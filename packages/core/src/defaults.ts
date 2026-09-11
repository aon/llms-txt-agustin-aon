import type { SiteConfig } from "./entities/site.js";

export const DEFAULT_SITE_CONFIG: Readonly<SiteConfig> = Object.freeze({
  pageCap: 300,
  maxDepth: 6,
  concurrency: 4,
});

export const TIMING = Object.freeze({
  /** How long a single worker invocation fetches before it hands off. */
  workerBudgetMs: 10 * 60 * 1000, // 10 min
  /** Matches the SQS visibility timeout. */
  leaseTtlSeconds: 1200, // 20 min
  /** SQS DelaySeconds for a job that finds the site lease held. */
  deferredRequeueSeconds: 60, // 1 min
  /** Re-fetch robots.txt when the cached copy is older than this. */
  robotsMaxAgeMs: 24 * 60 * 60 * 1000, // 1 day
});
