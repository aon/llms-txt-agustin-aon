/** Times are ISO-8601 strings unless noted. */

export interface Site {
  host: string;
  origin: string;
  config: SiteConfig;
  robots?: RobotsRules;
  lease?: Lease;
  latestCrawlId?: string;
  lastDoneCrawlId?: string;
  currentLlmsTxtKey?: string;
  /** Present only while monitoring is enabled. */
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteConfig {
  pageCap: number;
  maxDepth: number;
  concurrency: number;
  /** Hours between scheduled re-crawls. Absent means monitoring is off. */
  scheduleHours?: number;
}

export interface RobotsRule {
  path: string;
  allow: boolean;
}

export interface RobotsRules {
  rules: RobotsRule[];
  /** Seconds between requests, from the Crawl-delay directive. */
  crawlDelay?: number;
  sitemaps: string[];
  fetchedAt: string;
}

/**
 * The site lock. Held by the crawl that is currently fetching the site so a
 * user-triggered crawl and a scheduled one never run at the same time.
 * Expires on its own if the holder crashes.
 */
export interface Lease {
  crawlId: string;
  /** Epoch seconds, so a DynamoDB condition can compare it numerically. */
  expiresAt: number;
}

export const SCHEDULE_PARTITION = "SCHEDULE";

/** The next scheduled run for a site, or null while monitoring is off. */
export function nextRunAfter(site: Pick<Site, "config">, from: Date) {
  const hours = site.config.scheduleHours;
  if (!hours) return null;
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function sitePk(host: string) {
  return `SITE#${host}`;
}

export function siteKeys(host: string) {
  return { pk: sitePk(host), sk: "SITE" };
}

/**
 * GSI2 keys for the schedule sweep: every monitored site under one
 * partition, sorted by next run time. Written only while monitoring is on,
 * so the index stays sparse.
 */
export function siteGsi2Keys(nextRunAt: string, host: string) {
  return { gsi2pk: SCHEDULE_PARTITION, gsi2sk: `${nextRunAt}#${host}` };
}
