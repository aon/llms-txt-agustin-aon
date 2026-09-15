import type { Crawl, CrawlReason } from "./entities/crawl.js";
import type { JobQueue } from "./store/job-queue.js";
import type { Store } from "./store/store.js";
import { newCrawlId } from "./url.js";

export interface EnqueueCrawlDeps {
  store: Store;
  queue: JobQueue;
}

export interface EnqueueCrawlInput {
  host: string;
  reason: CrawlReason;
  now: Date;
}

/** Rows first, then the message, so the worker always finds the crawl it was sent. */
export async function enqueueCrawl(
  deps: EnqueueCrawlDeps,
  input: EnqueueCrawlInput,
) {
  const crawl: Crawl = {
    crawlId: newCrawlId(),
    status: "queued",
    reason: input.reason,
    phase: "discovery",
    invocations: 0,
    pagesQueued: 0,
    pagesFetched: 0,
    pagesFailed: 0,
    pagesChanged: 0,
    createdAt: input.now.toISOString(),
  };
  await deps.store.putCrawl(input.host, crawl);
  await deps.store.updateSite(input.host, { latestCrawlId: crawl.crawlId });
  await deps.queue.enqueue({
    siteId: input.host,
    crawlId: crawl.crawlId,
    reason: input.reason,
  });
  return crawl;
}

export function isCrawlFinished(crawl: Pick<Crawl, "status">) {
  return crawl.status === "done" || crawl.status === "failed";
}
