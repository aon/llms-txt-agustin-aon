import type { Page, PageStatus } from "../entities/page.js";
import type { Patch } from "./patch.js";

export interface DiscoveredPage {
  url: string;
  path: string;
  depth: number;
}

export type PagePatch = Patch<Omit<Page, "url" | "path" | "firstSeenAt">>;

export interface ListPagesOptions {
  inFile?: boolean;
}

/**
 * Page rows, one per URL of a site, shared across crawls.x During a crawl
 * they double as the durable frontier: a queued row is a URL still to
 * fetch, a fetched row is one already done. That is what lets a crawl
 * resume after a crash or a continuation.
 */
export interface PageStore {
  /**
   * Commits discovered URLs as queued rows for this crawl. Existing rows are
   * re-pointed to this crawl as queued unless this crawl already fetched,
   * skipped or failed them. Returns how many rows became newly queued.
   */
  upsertQueuedPages(
    host: string,
    crawlId: string,
    pages: DiscoveredPage[],
  ): Promise<number>;
  getPage(host: string, path: string): Promise<Page | null>;
  updatePage(host: string, path: string, patch: PagePatch): Promise<Page>;
  /** All pages of a site, sorted by path. */
  listPages(host: string, options?: ListPagesOptions): Promise<Page[]>;
  /** Pages last touched by a crawl, optionally by status, sorted by path. */
  listPagesByCrawl(crawlId: string, status?: PageStatus): Promise<Page[]>;
}
