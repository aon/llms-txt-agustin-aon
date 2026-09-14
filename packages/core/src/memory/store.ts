import { DEFAULT_SITE_CONFIG } from "../defaults.js";
import type { Crawl } from "../entities/crawl.js";
import type { Page, PageStatus } from "../entities/page.js";
import type { Site } from "../entities/site.js";
import { NotFoundError } from "../store/errors.js";
import type {
  CrawlCounters,
  CrawlPatch,
  DiscoveredPage,
  FinishCrawlInput,
  ListPagesOptions,
  NewSite,
  PagePatch,
  Patch,
  SitePatch,
  Store,
} from "../store/index.js";
import { nowIso } from "../url.js";

/**
 * In-memory Store for tests. Keeps the same semantics the
 * DynamoDB implementation must have: reads return deep copies, the lease is
 * re-entrant for its holder, and queued rows are never downgraded.
 */
export class MemoryStore implements Store {
  private readonly sites = new Map<string, Site>();
  private readonly crawls = new Map<string, Map<string, Crawl>>();
  private readonly pages = new Map<string, Map<string, Page>>();

  // Sites

  async getSite(host: string): Promise<Site | null> {
    const site = this.sites.get(host);
    return site ? clone(site) : null;
  }

  async putSiteIfAbsent(input: NewSite): Promise<Site> {
    const existing = this.sites.get(input.host);
    if (existing) return clone(existing);
    const now = nowIso();
    const site: Site = {
      host: input.host,
      origin: input.origin,
      config: clone(input.config ?? DEFAULT_SITE_CONFIG),
      createdAt: now,
      updatedAt: now,
    };
    this.sites.set(site.host, site);
    return clone(site);
  }

  async updateSite(host: string, patch: SitePatch): Promise<Site> {
    const site = this.requireSite(host);
    apply(site, patch);
    site.updatedAt = nowIso();
    return clone(site);
  }

  async acquireLease(
    host: string,
    crawlId: string,
    ttlSeconds: number,
    nowEpochSeconds?: number,
  ): Promise<boolean> {
    const site = this.requireSite(host);
    const now = nowEpochSeconds ?? Math.floor(Date.now() / 1000);
    const held = site.lease && site.lease.expiresAt >= now;
    if (held && site.lease?.crawlId !== crawlId) return false;
    site.lease = { crawlId, expiresAt: now + ttlSeconds };
    site.updatedAt = nowIso();
    return true;
  }

  async releaseLease(host: string, crawlId: string): Promise<void> {
    const site = this.requireSite(host);
    if (site.lease?.crawlId === crawlId) {
      delete site.lease;
      site.updatedAt = nowIso();
    }
  }

  async setSchedule(host: string, nextRunAt: string | null): Promise<void> {
    const site = this.requireSite(host);
    if (nextRunAt === null) {
      delete site.nextRunAt;
    } else {
      site.nextRunAt = nextRunAt;
    }
    site.updatedAt = nowIso();
  }

  async listDueSites(now: string, limit: number): Promise<Site[]> {
    return [...this.sites.values()]
      .filter((site) => site.nextRunAt !== undefined && site.nextRunAt <= now)
      .sort((a, b) => {
        const key = (s: Site) => `${s.nextRunAt}#${s.host}`;
        return key(a) < key(b) ? -1 : 1;
      })
      .slice(0, limit)
      .map(clone);
  }

  // Crawls

  async putCrawl(host: string, crawl: Crawl): Promise<void> {
    this.requireSite(host);
    let map = this.crawls.get(host);
    if (!map) {
      map = new Map();
      this.crawls.set(host, map);
    }
    map.set(crawl.crawlId, clone(crawl));
  }

  async getCrawl(host: string, crawlId: string): Promise<Crawl | null> {
    const crawl = this.crawls.get(host)?.get(crawlId);
    return crawl ? clone(crawl) : null;
  }

  async listCrawls(host: string, limit: number): Promise<Crawl[]> {
    const map = this.crawls.get(host);
    if (!map) return [];
    return [...map.values()]
      .sort((a, b) =>
        a.crawlId > b.crawlId ? -1 : a.crawlId < b.crawlId ? 1 : 0,
      )
      .slice(0, limit)
      .map(clone);
  }

  async updateCrawl(
    host: string,
    crawlId: string,
    patch: CrawlPatch,
  ): Promise<Crawl> {
    const crawl = this.requireCrawl(host, crawlId);
    apply(crawl, patch);
    return clone(crawl);
  }

  async addCrawlCounters(
    host: string,
    crawlId: string,
    counters: CrawlCounters,
  ): Promise<Crawl> {
    const crawl = this.requireCrawl(host, crawlId);
    crawl.invocations += counters.invocations ?? 0;
    crawl.pagesQueued += counters.pagesQueued ?? 0;
    crawl.pagesFetched += counters.pagesFetched ?? 0;
    crawl.pagesFailed += counters.pagesFailed ?? 0;
    crawl.pagesChanged += counters.pagesChanged ?? 0;
    return clone(crawl);
  }

  // Pages

  async upsertQueuedPages(
    host: string,
    crawlId: string,
    discovered: DiscoveredPage[],
  ): Promise<number> {
    this.requireSite(host);
    const map = this.sitePages(host);
    const now = nowIso();
    let queued = 0;
    for (const item of discovered) {
      const existing = map.get(item.path);
      if (existing) {
        if (existing.crawlId === crawlId) {
          // Already touched by this crawl: queued, fetched, skipped or failed.
          continue;
        }
        existing.crawlId = crawlId;
        existing.status = "queued";
        existing.depth = item.depth;
        existing.lastSeenAt = now;
        queued += 1;
        continue;
      }
      map.set(item.path, {
        url: item.url,
        path: item.path,
        depth: item.depth,
        crawlId,
        status: "queued",
        eligible: false,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      queued += 1;
    }
    return queued;
  }

  async getPage(host: string, path: string): Promise<Page | null> {
    const page = this.pages.get(host)?.get(path);
    return page ? clone(page) : null;
  }

  async updatePage(
    host: string,
    path: string,
    patch: PagePatch,
  ): Promise<Page> {
    const page = this.pages.get(host)?.get(path);
    if (!page) throw new NotFoundError(`Page not found: ${host} ${path}`);
    apply(page, patch);
    return clone(page);
  }

  async listPages(
    host: string,
    options: ListPagesOptions = {},
  ): Promise<Page[]> {
    const map = this.pages.get(host);
    if (!map) return [];
    return [...map.values()]
      .filter(
        (page) =>
          options.eligible === undefined || page.eligible === options.eligible,
      )
      .sort(byPath)
      .map(clone);
  }

  async listPagesByCrawl(
    crawlId: string,
    status?: PageStatus,
  ): Promise<Page[]> {
    const out: Page[] = [];
    for (const map of this.pages.values()) {
      for (const page of map.values()) {
        if (page.crawlId !== crawlId) continue;
        if (status !== undefined && page.status !== status) continue;
        out.push(page);
      }
    }
    return out.sort(byPath).map(clone);
  }

  // Cross-entity

  async finishCrawl(
    host: string,
    crawlId: string,
    input: FinishCrawlInput,
  ): Promise<void> {
    const site = this.requireSite(host);
    const crawl = this.requireCrawl(host, crawlId);
    crawl.status = "done";
    crawl.phase = "generating";
    crawl.snapshotKey = input.snapshotKey;
    crawl.llmsTxtKey = input.llmsTxtKey;
    crawl.diff = clone(input.diff);
    crawl.finishedAt = input.finishedAt;
    site.lastDoneCrawlId = crawlId;
    site.currentLlmsTxtKey = input.llmsTxtKey;
    if (site.lease?.crawlId === crawlId) delete site.lease;
    if (input.nextRunAt === null) {
      delete site.nextRunAt;
    } else {
      site.nextRunAt = input.nextRunAt;
    }
    site.updatedAt = nowIso();
  }

  // Helpers

  private requireSite(host: string) {
    const site = this.sites.get(host);
    if (!site) throw new NotFoundError(`Site not found: ${host}`);
    return site;
  }

  private requireCrawl(host: string, crawlId: string) {
    const crawl = this.crawls.get(host)?.get(crawlId);
    if (!crawl) throw new NotFoundError(`Crawl not found: ${host}/${crawlId}`);
    return crawl;
  }

  private sitePages(host: string) {
    let map = this.pages.get(host);
    if (!map) {
      map = new Map();
      this.pages.set(host, map);
    }
    return map;
  }
}

// Helpers

function clone<T>(value: T) {
  return structuredClone(value);
}

function byPath(a: Page, b: Page) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** Applies a patch, deleting keys whose value is undefined. */
function apply<T extends object>(target: T, patch: Patch<T>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (target as Record<string, unknown>)[key];
    } else {
      (target as Record<string, unknown>)[key] = value;
    }
  }
  return target;
}
