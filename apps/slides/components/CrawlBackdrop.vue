<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const PITCH = 26;
const TICK_S = 0.075;
const PER_TICK = 2;
const FETCH_S = 0.35;
const START_DELAY_S = 0.6;
const FADE_S = 1.4;
const MAX_CRAWL_S = 40;
const DONE_SHARE = 0.55;
const HALO_PX = 160;
const ALPHA = 0.4;
const STILL_TICKS = 200;

const UNKNOWN = 0;
const QUEUED = 1;
const FETCHING = 2;
const FETCHED = 3;
const SKIPPED = 4;
const FAILED = 5;

const el = ref<HTMLCanvasElement>();
let dispose = () => {};

onMounted(() => {
  const canvas = el.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const palette = readPalette();
  const crawl = new Crawl();
  const pointer = trackPointer(canvas);
  let dpr = 1;
  let acc = 0;

  const draw = (t: number) => {
    pointer.step();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    paint(ctx, crawl, palette, t, pointer.active ? pointer : null);
  };

  const stopFit = fitCanvas(canvas, (w, h, d) => {
    dpr = d;
    crawl.resize(w, h);
    if (still) {
      for (let k = 0; k < STILL_TICKS; k++) crawl.tick(k * TICK_S, null);
      draw(STILL_TICKS * TICK_S);
    }
  });
  if (still) {
    dispose = () => {
      stopFit();
      pointer.dispose();
    };
    return;
  }

  const stop = loop((t, dt) => {
    if (t < START_DELAY_S) return;
    acc += dt;
    while (acc > TICK_S) {
      acc -= TICK_S;
      crawl.tick(t, pointer.active ? pointer.smooth : null);
    }
    draw(t);
  });
  dispose = () => {
    stop();
    stopFit();
    pointer.dispose();
  };
});

onBeforeUnmount(() => dispose());

class Crawl {
  cols = 0;
  rows = 0;
  state = new Uint8Array(0);
  since = new Float32Array(0);
  parent = new Int32Array(0);
  fadeStart = -1;
  private fetched = 0;
  private seededAt = 0;
  private rnd = mulberry(Date.now());

  resize(w: number, h: number) {
    this.cols = Math.ceil(w / PITCH) + 1;
    this.rows = Math.ceil(h / PITCH) + 1;
    this.state = new Uint8Array(this.cols * this.rows);
    this.since = new Float32Array(this.cols * this.rows);
    this.parent = new Int32Array(this.cols * this.rows);
    this.seed(0);
  }

  tick(t: number, focus: { x: number; y: number } | null) {
    const total = this.state.length;
    const done =
      this.fetched > total * DONE_SHARE || t - this.seededAt > MAX_CRAWL_S;
    if (done && this.fadeStart < 0) this.fadeStart = t;
    if (this.fadeStart >= 0) {
      if (t - this.fadeStart > FADE_S + 0.2) this.seed(t);
      return;
    }
    for (let k = 0; k < PER_TICK; k++) {
      const next = this.pick(t, focus);
      if (next < 0) break;
      this.state[next] = FETCHING;
      this.since[next] = t;
    }
    for (let i = 0; i < total; i++) {
      if (this.state[i] !== FETCHING || t - (this.since[i] ?? 0) < FETCH_S)
        continue;
      const roll = this.rnd();
      this.state[i] = roll < 0.86 ? FETCHED : roll < 0.95 ? SKIPPED : FAILED;
      this.since[i] = t;
      if (this.state[i] !== FETCHED) continue;
      this.fetched += 1;
      const c = i % this.cols;
      const r = (i - c) / this.cols;
      if (c > 0) this.enqueue(i - 1, i, t);
      if (c < this.cols - 1) this.enqueue(i + 1, i, t);
      if (r > 0) this.enqueue(i - this.cols, i, t);
      if (r < this.rows - 1) this.enqueue(i + this.cols, i, t);
    }
  }

  fade(t: number) {
    return this.fadeStart < 0
      ? 1
      : Math.max(0, 1 - (t - this.fadeStart) / FADE_S);
  }

  /** Anywhere but the edges. */
  private seed(t: number) {
    this.state.fill(UNKNOWN);
    this.parent.fill(-1);
    this.fetched = 0;
    this.fadeStart = -1;
    this.seededAt = t;
    const c = Math.floor(this.cols * (0.2 + this.rnd() * 0.6));
    const r = Math.floor(this.rows * (0.2 + this.rnd() * 0.6));
    const i = r * this.cols + c;
    this.state[i] = QUEUED;
    this.since[i] = t;
  }

  /** Nearest queued cell to the focus, or the longest-waiting one when there is no pointer. */
  private pick(t: number, focus: { x: number; y: number } | null) {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] !== QUEUED) continue;
      let score: number;
      if (focus) {
        const c = i % this.cols;
        const dx = c * PITCH - focus.x;
        const dy = ((i - c) / this.cols) * PITCH - focus.y;
        score = dx * dx + dy * dy + this.rnd() * PITCH * PITCH * 4;
      } else {
        score = (this.since[i] ?? 0) - t + this.rnd();
      }
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  private enqueue(i: number, from: number, t: number) {
    if (this.state[i] !== UNKNOWN || this.rnd() > 0.8) return;
    this.state[i] = QUEUED;
    this.since[i] = t;
    this.parent[i] = from;
  }
}

function paint(
  ctx: CanvasRenderingContext2D,
  crawl: Crawl,
  palette: ReturnType<typeof readPalette>,
  t: number,
  focus: { smooth: Point; target: Point } | null,
) {
  const { cols, state, since, parent } = crawl;
  const fade = crawl.fade(t);
  ctx.globalAlpha = ALPHA;

  ctx.strokeStyle = `rgba(${palette.ink},${0.05 * fade})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < state.length; i++) {
    const from = parent[i] ?? -1;
    if ((state[i] ?? UNKNOWN) < FETCHED || from < 0) continue;
    const c = i % cols;
    const pc = from % cols;
    ctx.moveTo(c * PITCH, ((i - c) / cols) * PITCH);
    ctx.lineTo(pc * PITCH, ((from - pc) / cols) * PITCH);
  }
  ctx.stroke();

  for (let i = 0; i < state.length; i++) {
    const c = i % cols;
    const x = c * PITCH;
    const y = ((i - c) / cols) * PITCH;
    const s = state[i] ?? UNKNOWN;
    const age = t - (since[i] ?? 0);
    let halo = 0;
    if (focus) {
      const dx = x - focus.smooth.x;
      const dy = y - focus.smooth.y;
      const d = Math.sqrt(dx * dx + dy * dy) / HALO_PX;
      if (d < 1) halo = (1 - d) * (1 - d);
    }
    if (s === UNKNOWN) {
      // the resting dot is the CSS grid under the canvas; only the halo is painted here
      if (halo === 0) continue;
      ctx.fillStyle = `rgba(${palette.ink},${halo * 0.14})`;
      ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    } else if (s === QUEUED) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
      ctx.fillStyle = `rgba(${palette.ink},${(0.12 + pulse * 0.08 + halo * 0.2) * fade})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    } else if (s === FETCHING) {
      const k = Math.min(1, age / FETCH_S);
      const size = 4 + (1 - k) * 3;
      ctx.fillStyle = `rgba(${palette.brand},${(0.95 - k * 0.3) * fade})`;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    } else {
      const settle = Math.min(1, age / 0.6);
      const color =
        s === FETCHED
          ? palette.ink
          : s === SKIPPED
            ? palette.warn
            : palette.err;
      const base = s === FETCHED ? 0.4 - settle * 0.18 : 0.55 - settle * 0.15;
      ctx.fillStyle = `rgba(${color},${(base + halo * 0.3) * fade})`;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  if (focus) {
    const c = Math.round(focus.target.x / PITCH);
    const r = Math.round(focus.target.y / PITCH);
    ctx.strokeStyle = `rgba(${palette.brand},0.7)`;
    ctx.strokeRect(c * PITCH - 6.5, r * PITCH - 6.5, 13, 13);
  }
}

/** The ledger tokens as "r,g,b" strings so the canvas stays on the same palette as the CSS. */
function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const rgb = (name: string) => {
    const hex = style.getPropertyValue(name).trim().replace("#", "");
    const n = Number.parseInt(
      hex.length === 3 ? hex.replace(/./g, "$&$&") : hex,
      16,
    );
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  };
  return {
    ink: rgb("--ink"),
    brand: rgb("--brand"),
    warn: rgb("--warn"),
    err: rgb("--err"),
  };
}

type Point = { x: number; y: number };

/** Slidev scales the slide, so pointer coordinates come back through the canvas box. */
function trackPointer(canvas: HTMLCanvasElement) {
  const target: Point = { x: 0, y: 0 };
  const smooth: Point = { x: 0, y: 0 };
  let active = false;
  let seen = false;
  const onMove = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    target.x = ((e.clientX - box.left) / box.width) * canvas.clientWidth;
    target.y = ((e.clientY - box.top) / box.height) * canvas.clientHeight;
    if (!seen) {
      smooth.x = target.x;
      smooth.y = target.y;
      seen = true;
    }
    active = true;
  };
  const onLeave = () => {
    active = false;
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  return {
    smooth,
    target,
    get active() {
      return active;
    },
    step() {
      smooth.x += (target.x - smooth.x) * 0.25;
      smooth.y += (target.y - smooth.y) * 0.25;
    },
    dispose() {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    },
  };
}

function fitCanvas(
  canvas: HTMLCanvasElement,
  onResize: (w: number, h: number, dpr: number) => void,
) {
  const apply = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    onResize(canvas.clientWidth, canvas.clientHeight, dpr);
  };
  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(canvas);
  return () => observer.disconnect();
}

/** Runs `frame` with seconds and delta while the tab is visible. */
function loop(frame: (t: number, dt: number) => void) {
  let raf = 0;
  let last = performance.now();
  let running = true;
  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(now / 1000, dt);
    raf = requestAnimationFrame(tick);
  };
  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
</script>

<template>
  <canvas
    ref="el"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 h-full w-full"
    :style="{
      backgroundImage:
        'radial-gradient(circle, color-mix(in srgb, var(--ink) 8%, transparent) 0.75px, transparent 1px)',
      backgroundSize: '26px 26px',
      backgroundPosition: '-13px -13px',
    }"
  />
</template>
