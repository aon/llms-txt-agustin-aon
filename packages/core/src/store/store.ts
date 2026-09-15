import type { CrawlDiff } from "../entities/crawl.js";
import type { CrawlStore } from "./crawl-store.js";
import type { PageStore } from "./page-store.js";
import type { SiteStore } from "./site-store.js";

export interface FinishCrawlInput {
  snapshotKey: string;
  llmsTxtKey: string;
  diff: CrawlDiff;
  finishedAt: string;
}

/**
 * The one object the worker and the web app hold. It is the three entity
 * stores plus the single operation that has to touch two entities at once.
 * Backed by DynamoDB in production and by Maps in tests and the CLI.
 */
export interface Store extends SiteStore, CrawlStore, PageStore {
  /**
   * Marks the crawl done, points the site at its output, releases the lease
   * and sets the schedule. Implementations do this in one transaction.
   */
  finishCrawl(
    host: string,
    crawlId: string,
    input: FinishCrawlInput,
  ): Promise<void>;
}
