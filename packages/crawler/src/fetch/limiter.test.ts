import { describe, expect, it } from "vitest";
import { fakeClock, recordingSleep } from "../test/fake-site.js";
import { HostLimiter, RateLimitedError } from "./limiter.js";

function build(options: { concurrency?: number; spacingMs?: number } = {}) {
  const clock = fakeClock(1_000_000);
  const sleeper = recordingSleep(clock);
  const limiter = new HostLimiter({
    concurrency: options.concurrency ?? 1,
    spacingMs: options.spacingMs ?? 250,
    now: clock.now,
    sleep: sleeper.sleep,
  });
  return { limiter, clock, sleeps: sleeper.calls };
}

describe("HostLimiter", () => {
  it("spaces request starts by the configured gap", async () => {
    const { limiter, clock, sleeps } = build({ spacingMs: 500 });
    const starts: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      await limiter.run(async () => {
        starts.push(clock.now().getTime());
      });
    }
    expect(starts).toEqual([1_000_000, 1_000_500, 1_001_000]);
    expect(sleeps).toEqual([500, 500]);
  });

  it("does not wait when the clock already moved past the gap", async () => {
    const { limiter, clock, sleeps } = build({ spacingMs: 250 });
    await limiter.run(async () => {});
    clock.advance(1000);
    await limiter.run(async () => {});
    expect(sleeps).toEqual([]);
  });

  it("keeps at most `concurrency` tasks in flight", async () => {
    const { limiter } = build({ concurrency: 2, spacingMs: 0 });
    let peak = 0;
    const tasks = Array.from({ length: 6 }, () =>
      limiter.run(async () => {
        peak = Math.max(peak, limiter.inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }),
    );
    await Promise.all(tasks);
    expect(peak).toBe(2);
  });

  it("holds every request back while the host is paused", async () => {
    const { limiter, clock, sleeps } = build({ spacingMs: 0 });
    await limiter.pause(1);
    const at = await limiter.run(async () => clock.now().getTime());
    expect(sleeps).toEqual([1000]);
    expect(at).toBe(1_001_000);
  });

  it("backs off exponentially when Retry-After is missing", async () => {
    const { limiter, sleeps } = build();
    await limiter.pause();
    await limiter.pause();
    expect(sleeps).toEqual([2000, 4000]);
  });

  it("gives up after three pauses in a row", async () => {
    const { limiter } = build();
    await limiter.pause(0);
    await limiter.pause(0);
    await limiter.pause(0);
    await expect(limiter.pause(0)).rejects.toThrow(RateLimitedError);
  });

  it("forgets the pauses once a request gets through", async () => {
    const { limiter } = build();
    await limiter.pause(0);
    await limiter.pause(0);
    limiter.noteSuccess();
    expect(limiter.consecutivePauses).toBe(0);
    await limiter.pause(0);
    await limiter.pause(0);
    await limiter.pause(0);
    await expect(limiter.pause(0)).rejects.toThrow(RateLimitedError);
  });
});
