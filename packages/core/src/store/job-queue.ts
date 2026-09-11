import type { CrawlJobMessage } from "../message.js";

export interface EnqueueOptions {
  /** Seconds to hold the message before it becomes receivable. */
  delaySeconds?: number;
}

/**
 * Where crawl jobs go. The web app and the monitor sweep enqueue; the worker
 * enqueues its own continuation or a deferred retry. SQS in production.
 */
export interface JobQueue {
  enqueue(message: CrawlJobMessage, options?: EnqueueOptions): Promise<void>;
}
