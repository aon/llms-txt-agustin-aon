import { sitePk } from "./site.js";

/** Times are ISO-8601 strings. */

export interface Crawl {
  crawlId: string;
  status: CrawlStatus;
  reason: CrawlReason;
  phase: CrawlPhase;
  invocations: number;
  pagesQueued: number;
  pagesFetched: number;
  pagesFailed: number;
  pagesChanged: number;
  snapshotKey?: string;
  llmsTxtKey?: string;
  diff?: CrawlDiff;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export type CrawlStatus = "queued" | "running" | "done" | "failed";
export type CrawlReason = "user" | "scheduled";
export type CrawlPhase = "discovery" | "fetching" | "extracting" | "generating";

export interface CrawlDiff {
  added: number;
  removed: number;
  changed: number;
  /** Sample paths that changed, for the UI. */
  samples: string[];
}

export function crawlKeys(host: string, crawlId: string) {
  return { pk: sitePk(host), sk: `CRAWL#${crawlId}` };
}
