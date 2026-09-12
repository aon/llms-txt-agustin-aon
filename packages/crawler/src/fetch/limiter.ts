export interface HostLimiterOptions {
  concurrency: number;
  spacingMs: number;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  maxConsecutivePauses?: number;
}

export class HostLimiter {
  constructor(options: HostLimiterOptions) {
    this.concurrency = Math.max(1, options.concurrency);
    this.spacingMs = Math.max(0, options.spacingMs);
    this.now = options.now;
    this.sleep = options.sleep;
    this.maxConsecutivePauses = options.maxConsecutivePauses ?? 3;
  }

  get inFlight() {
    return this.active;
  }

  get consecutivePauses() {
    return this.pauses;
  }

  async run<T>(task: () => Promise<T>) {
    while (this.active >= this.concurrency) {
      await this.waitForSlot();
    }
    this.active += 1;
    try {
      await this.waitForTurn();
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  /** A burst of rate-limited responses is one pause, not one per request, so late callers wait out the running one. */
  async pause(seconds?: number) {
    const running = this.paused;
    if (running) {
      await running;
      return;
    }
    this.pauses += 1;
    if (this.pauses > this.maxConsecutivePauses) {
      throw new RateLimitedError(
        `Host rate limited the crawl ${this.pauses} times in a row`,
      );
    }
    const ms = Math.max(0, Math.round((seconds ?? 2 ** this.pauses) * 1000));
    this.nextStartAt = Math.max(this.nextStartAt, this.now().getTime() + ms);
    const pausing = this.sleep(ms);
    this.paused = pausing;
    await pausing;
    if (this.paused === pausing) this.paused = undefined;
  }

  noteSuccess() {
    this.pauses = 0;
  }

  private readonly concurrency: number;
  private readonly spacingMs: number;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxConsecutivePauses: number;
  private readonly waiting: (() => void)[] = [];
  private active = 0;
  private pauses = 0;
  private nextStartAt = 0;
  private paused: Promise<void> | undefined;

  private waitForSlot() {
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  /** The claim is synchronous so two callers can never be handed the same slot, and only the wait is awaited. */
  private async waitForTurn() {
    while (this.paused) await this.paused;
    const now = this.now().getTime();
    const startAt = Math.max(now, this.nextStartAt);
    this.nextStartAt = startAt + this.spacingMs;
    if (startAt > now) await this.sleep(startAt - now);
  }
}

export class RateLimitedError extends Error {
  override readonly name = "RateLimitedError";
}
