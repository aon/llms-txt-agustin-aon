import type { CrawlDiff } from "./crawl.js";
import type { Page } from "./page.js";

/**
 * The JSON the crawler writes to S3 at `snapshotKey(host, crawlId)`. The
 * llms.txt generator and the web app read it instead of scanning page rows,
 * so it carries everything either of them needs about one crawl.
 */
export interface CrawlSnapshot {
  host: string;
  origin: string;
  crawlId: string;
  generatedAt: string;
  siteTitle: string;
  siteDescription?: string;
  /** The title suffix most pages repeat, when the crawler found one. */
  brand?: string;
  /** Main text of the landing page, what the enricher reads about the site. */
  landingText?: string;
  /** Ordered by importance; the pages inside one are sorted by rank. */
  sections: SnapshotSection[];
  /** Every page of the crawl, section order first, then rank. */
  pages: SnapshotPage[];
  diff: CrawlDiff;
  stats: SnapshotStats;
}

export interface SnapshotSection {
  name: string;
  pages: SnapshotPage[];
}

/** The page fields the generator and the UI need, taken from the page row. */
export type SnapshotPage = Required<
  Pick<
    Page,
    | "url"
    | "path"
    | "title"
    | "section"
    | "rank"
    | "depth"
    | "eligible"
    | "wordCount"
  >
> &
  Pick<Page, "description" | "contentHash">;

export interface SnapshotStats {
  fetched: number;
  failed: number;
  skipped: number;
}
