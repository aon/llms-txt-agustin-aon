import type {
  CrawlJobMessage,
  FileStore,
  JobQueue,
  Site,
  Store,
} from "@llms-txt/core";
import {
  crawlLlmsTxtKey,
  llmsTxtKey,
  snapshotKey,
  TIMING,
} from "@llms-txt/core";
import { crawl, RateLimitedError } from "@llms-txt/crawler";
import { type Enricher, generateLlmsTxt } from "@llms-txt/llms-txt";

export interface JobDeps {
  store: Store;
  files: FileStore;
  queue: JobQueue;
  enricher?: Enricher;
  fetch: typeof globalThis.fetch;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  log: (message: string, fields?: Record<string, unknown>) => void;
  userAgent: string;
  budgetMs: number;
}

export type JobOutcome =
  | "skipped"
  | "deferred"
  | "continued"
  | "finished"
  | "rate-limited";

/**
 * One SQS message, one invocation. Throws only for errors worth a redelivery;
 * everything terminal is written to the crawl row and swallowed.
 */
export async function runCrawlJob(
  message: CrawlJobMessage,
  deps: JobDeps,
): Promise<JobOutcome> {
  const host = message.siteId;
  const [site, existing] = await Promise.all([
    deps.store.getSite(host),
    deps.store.getCrawl(host, message.crawlId),
  ]);
  if (!site || !existing) {
    deps.log("crawl job for unknown site or crawl, dropping", message);
    return "skipped";
  }
  if (existing.status === "done" || existing.status === "failed") {
    deps.log("crawl already finished, dropping redelivery", message);
    return "skipped";
  }

  const leased = await deps.store.acquireLease(
    host,
    message.crawlId,
    TIMING.leaseTtlSeconds,
  );
  if (!leased) {
    await deps.queue.enqueue(message, {
      delaySeconds: TIMING.deferredRequeueSeconds,
    });
    deps.log("site lease held by another crawl, deferring", message);
    return "deferred";
  }

  let result: Awaited<ReturnType<typeof crawl>>;
  try {
    result = await crawl(
      {
        site,
        crawlId: message.crawlId,
        budgetMs: deps.budgetMs,
        userAgent: deps.userAgent,
      },
      deps,
    );
  } catch (error) {
    if (error instanceof RateLimitedError) {
      await fail(deps, host, message.crawlId, error.message);
      return "rate-limited";
    }
    await deps.store.updateCrawl(host, message.crawlId, {
      error: errorMessage(error),
    });
    throw error;
  }

  if (!result.finished) {
    await deps.queue.enqueue({ ...message, continuation: true });
    deps.log("budget spent, continuation enqueued", message);
    return "continued";
  }

  const llmsTxt = await generateLlmsTxt(result.snapshot, {
    ...(deps.enricher ? { enricher: deps.enricher } : {}),
    onEnrichError: (error) => {
      deps.log("enrichment failed, writing the file without it", {
        ...message,
        error: errorMessage(error),
      });
    },
  });
  const versionKey = crawlLlmsTxtKey(host, message.crawlId);
  const currentKey = llmsTxtKey(host);
  await Promise.all([
    deps.files.putObject(versionKey, llmsTxt, "text/plain; charset=utf-8"),
    deps.files.putObject(currentKey, llmsTxt, "text/plain; charset=utf-8"),
  ]);
  const finishedAt = deps.now();
  await deps.store.finishCrawl(host, message.crawlId, {
    snapshotKey: snapshotKey(host, message.crawlId),
    llmsTxtKey: currentKey,
    diff: result.snapshot.diff,
    nextRunAt: nextRunAfter(site, finishedAt),
    finishedAt: finishedAt.toISOString(),
  });
  deps.log("crawl finished", { ...message, pages: result.snapshot.stats });
  return "finished";
}

/** Marks a crawl failed and frees the site, for errors a retry cannot fix. */
export async function fail(
  deps: Pick<JobDeps, "store" | "now">,
  host: string,
  crawlId: string,
  error: string,
) {
  await deps.store.updateCrawl(host, crawlId, {
    status: "failed",
    error,
    finishedAt: deps.now().toISOString(),
  });
  await deps.store.releaseLease(host, crawlId);
}

export function nextRunAfter(site: Site, from: Date) {
  const hours = site.config.scheduleHours;
  if (!hours) return null;
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
