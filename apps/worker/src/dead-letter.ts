import type { Store } from "@llms-txt/core";
import { InvalidMessageError, parseCrawlJobMessage } from "@llms-txt/core";
import { fail } from "./job.js";

export interface DeadLetterDeps {
  store: Store;
  now: () => Date;
  log: (message: string, fields?: Record<string, unknown>) => void;
}

/** A job that failed every receive: record it on the crawl and free the site. */
export async function giveUp(body: string, deps: DeadLetterDeps) {
  let message: ReturnType<typeof parseCrawlJobMessage>;
  try {
    message = parseCrawlJobMessage(body);
  } catch (error) {
    if (!(error instanceof InvalidMessageError)) throw error;
    deps.log("dead letter is not a crawl job, dropping", { body });
    return false;
  }
  const crawl = await deps.store.getCrawl(message.siteId, message.crawlId);
  if (!crawl) {
    deps.log("dead letter for unknown crawl, dropping", message);
    return false;
  }
  if (crawl.status === "done" || crawl.status === "failed") {
    deps.log("dead letter for finished crawl, dropping", message);
    return false;
  }
  await fail(
    deps,
    message.siteId,
    message.crawlId,
    crawl.error ?? "Crawl job failed on every attempt",
  );
  deps.log("crawl marked failed from dead letter", message);
  return true;
}
