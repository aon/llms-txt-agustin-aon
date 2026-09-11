import type { Site, SiteConfig } from "../entities/site.js";
import type { Patch } from "./patch.js";

export interface NewSite {
  host: string;
  origin: string;
  config?: SiteConfig;
}

export type SitePatch = Patch<
  Pick<Site, "config" | "robots" | "latestCrawlId">
>;

/**
 * Site rows. The web app creates and reads them; the worker takes the lease
 * and refreshes robots; the monitor sweep lists the ones due for a re-crawl.
 */
export interface SiteStore {
  getSite(host: string): Promise<Site | null>;
  /** Creates the site if missing. Returns the stored site either way. */
  putSiteIfAbsent(site: NewSite): Promise<Site>;
  updateSite(host: string, patch: SitePatch): Promise<Site>;
  /**
   * Take the site lease for a crawl. Succeeds when no lease exists, the
   * existing one has expired, or the same crawl already holds it, in which
   * case the expiry is refreshed so continuations and retries of a crawl are
   * never blocked by their own lease. `nowEpochSeconds` defaults to now.
   */
  acquireLease(
    host: string,
    crawlId: string,
    ttlSeconds: number,
    nowEpochSeconds?: number,
  ): Promise<boolean>;
  /** Removes the lease only if `crawlId` holds it. */
  releaseLease(host: string, crawlId: string): Promise<void>;
  /** Sets the next scheduled run, or clears the schedule with null. */
  setSchedule(host: string, nextRunAt: string | null): Promise<void>;
  /** Sites whose nextRunAt is at or before `nowIso`, earliest first. */
  listDueSites(nowIso: string, limit: number): Promise<Site[]>;
}
