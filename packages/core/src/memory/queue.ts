import type { CrawlJobMessage } from "../message.js";
import type { EnqueueOptions, JobQueue } from "../store/index.js";

export interface QueuedMessage {
  message: CrawlJobMessage;
  delaySeconds: number;
}

/** In-memory JobQueue. `messages` holds every enqueue in order, for tests. */
export class MemoryQueue implements JobQueue {
  readonly messages: QueuedMessage[] = [];

  async enqueue(
    message: CrawlJobMessage,
    options: EnqueueOptions = {},
  ): Promise<void> {
    this.messages.push({
      message: structuredClone(message),
      delaySeconds: options.delaySeconds ?? 0,
    });
  }
}
