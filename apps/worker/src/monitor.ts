import type { JobQueue, Store } from "@llms-txt/core";
import { newCrawlId } from "@llms-txt/core";
import { nextRunAfter } from "./job.js";

export const SWEEP_LIMIT = 100;

export interface MonitorDeps {
  store: Store;
  queue: JobQueue;
  now: () => Date;
  log: (message: string, fields?: Record<string, unknown>) => void;
}

/**
 * Enqueues a scheduled crawl for every site whose nextRunAt has passed. The
 * schedule is pushed forward right away so a running crawl is not enqueued
 * twice, and finishCrawl sets it again from the real finish time.
 */
export async function sweep(deps: MonitorDeps) {
  const now = deps.now();
  const due = await deps.store.listDueSites(now.toISOString(), SWEEP_LIMIT);
  for (const site of due) {
    const crawlId = newCrawlId();
    await deps.store.putCrawl(site.host, {
      crawlId,
      status: "queued",
      reason: "scheduled",
      phase: "discovery",
      invocations: 0,
      pagesQueued: 0,
      pagesFetched: 0,
      pagesFailed: 0,
      pagesChanged: 0,
      createdAt: now.toISOString(),
    });
    await deps.store.updateSite(site.host, { latestCrawlId: crawlId });
    await deps.store.setSchedule(site.host, nextRunAfter(site, now));
    await deps.queue.enqueue({
      siteId: site.host,
      crawlId,
      reason: "scheduled",
    });
    deps.log("scheduled crawl enqueued", { siteId: site.host, crawlId });
  }
  return due.length;
}
