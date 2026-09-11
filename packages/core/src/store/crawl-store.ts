import type { Crawl } from "../entities/crawl.js";
import type { Patch } from "./patch.js";

export type CrawlPatch = Patch<
  Pick<
    Crawl,
    | "status"
    | "phase"
    | "snapshotKey"
    | "llmsTxtKey"
    | "diff"
    | "error"
    | "startedAt"
    | "finishedAt"
  >
>;

export interface CrawlCounters {
  invocations?: number;
  pagesQueued?: number;
  pagesFetched?: number;
  pagesFailed?: number;
  pagesChanged?: number;
}

/**
 * Crawl rows, one per run of a site. The web app creates them and polls
 * them for progress; the worker moves them through phases and bumps the
 * counters as pages come in.
 */
export interface CrawlStore {
  putCrawl(host: string, crawl: Crawl): Promise<void>;
  getCrawl(host: string, crawlId: string): Promise<Crawl | null>;
  /** Newest first. */
  listCrawls(host: string, limit: number): Promise<Crawl[]>;
  updateCrawl(host: string, crawlId: string, patch: CrawlPatch): Promise<Crawl>;
  /** Adds to the counters atomically. */
  addCrawlCounters(
    host: string,
    crawlId: string,
    counters: CrawlCounters,
  ): Promise<Crawl>;
}
