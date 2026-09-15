import type { JobQueue, Store } from "@llms-txt/core";
import { enqueueCrawl, nextRunAfter } from "@llms-txt/core";

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
    await deps.store.setSchedule(site.host, nextRunAfter(site, now));
    const crawl = await enqueueCrawl(deps, {
      host: site.host,
      reason: "scheduled",
      now,
    });
    deps.log("scheduled crawl enqueued", {
      siteId: site.host,
      crawlId: crawl.crawlId,
    });
  }
  return due.length;
}
