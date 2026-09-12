import type {
  DiscoveredPage,
  Page,
  PageStore,
  SiteConfig,
} from "@llms-txt/core";
import { pagePathFromUrl } from "@llms-txt/core";

export const COMMIT_BATCH_SIZE = 25;

export interface FrontierOptions {
  host: string;
  crawlId: string;
  store: PageStore;
  config: SiteConfig;
}

/** Durable state lives in the queued page rows; this class is only the working copy of them. */
export class Frontier {
  constructor(options: FrontierOptions) {
    this.host = options.host;
    this.crawlId = options.crawlId;
    this.store = options.store;
    this.config = options.config;
    this.prefixCap = Math.max(25, Math.floor(options.config.pageCap / 3));
  }

  get pending() {
    return this.queue.length - this.cursor;
  }

  get committed() {
    return this.seen.size;
  }

  resume(pages: readonly Page[]) {
    for (const page of pages) {
      if (this.seen.has(page.path)) continue;
      this.seen.add(page.path);
      this.countPrefix(page.path);
      if (page.status === "queued") {
        this.queue.push({ url: page.url, path: page.path, depth: page.depth });
      }
    }
  }

  take() {
    const next = this.queue[this.cursor];
    if (next) this.cursor += 1;
    return next;
  }

  /** For a hand-off that ran out of budget with a page already taken. */
  requeue(page: DiscoveredPage) {
    this.queue.splice(this.cursor, 0, page);
  }

  async discover(urls: readonly string[], depth: number) {
    const accepted: DiscoveredPage[] = [];
    for (const url of urls) {
      const page = this.accept(url, depth);
      if (page) accepted.push(page);
    }
    return await this.commit(accepted);
  }

  /** Same as `discover` for a single URL whose guards were already checked. */
  async claim(page: DiscoveredPage) {
    if (this.seen.has(page.path)) return 0;
    this.seen.add(page.path);
    this.countPrefix(page.path);
    return await this.store.upsertQueuedPages(this.host, this.crawlId, [page]);
  }

  has(path: string) {
    return this.seen.has(path);
  }

  private readonly host: string;
  private readonly crawlId: string;
  private readonly store: PageStore;
  private readonly config: SiteConfig;
  private readonly prefixCap: number;
  private readonly queue: DiscoveredPage[] = [];
  private readonly seen = new Set<string>();
  private readonly prefixCounts = new Map<string, number>();
  private cursor = 0;

  private accept(url: string, depth: number) {
    if (depth > this.config.maxDepth) return null;
    if (this.seen.size >= this.config.pageCap) return null;
    const path = pagePathFromUrl(url);
    if (this.seen.has(path)) return null;
    const segments = pathSegments(path);
    if (segments.length > MAX_PATH_SEGMENTS) return null;
    if (queryParamCount(url) > MAX_QUERY_PARAMS) return null;
    const prefix = prefixKey(segments);
    if ((this.prefixCounts.get(prefix) ?? 0) >= this.prefixCap) return null;
    this.seen.add(path);
    this.prefixCounts.set(prefix, (this.prefixCounts.get(prefix) ?? 0) + 1);
    return { url, path, depth };
  }

  private countPrefix(path: string) {
    const prefix = prefixKey(pathSegments(path));
    this.prefixCounts.set(prefix, (this.prefixCounts.get(prefix) ?? 0) + 1);
  }

  private async commit(pages: readonly DiscoveredPage[]) {
    let queued = 0;
    for (let index = 0; index < pages.length; index += COMMIT_BATCH_SIZE) {
      const batch = pages.slice(index, index + COMMIT_BATCH_SIZE);
      queued += await this.store.upsertQueuedPages(
        this.host,
        this.crawlId,
        batch,
      );
      this.queue.push(...batch);
    }
    return queued;
  }
}

/** A path deeper than this is a generated tree, not a page someone wrote. */
export const MAX_PATH_SEGMENTS = 10;
/** More than this and the query is a filter combination, not a page. */
export const MAX_QUERY_PARAMS = 3;

function pathSegments(path: string) {
  const withoutQuery = path.split("?")[0] ?? "";
  return withoutQuery.split("/").filter(Boolean);
}

function prefixKey(segments: readonly string[]) {
  return `/${segments.slice(0, 2).join("/")}`;
}

function queryParamCount(url: string) {
  const query = url.split("?")[1];
  if (!query) return 0;
  return new URLSearchParams(query).size;
}
