import { parseCrawlJobMessage } from "@llms-txt/core";
import type { SQSHandler } from "aws-lambda";
import { type JobDeps, runCrawlJob } from "../job.js";
import { log, runtimeDeps } from "../runtime.js";

let deps: Promise<JobDeps> | undefined;

/** Batch size is one, so a throw retries exactly this job. */
export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const message = parseCrawlJobMessage(record.body);
    const outcome = await runCrawlJob(message, await loadDeps());
    log("crawl job handled", { ...message, outcome });
  }
};

/** Cached per container; a failed load is retried on the next invocation. */
function loadDeps() {
  deps ??= runtimeDeps().catch((error: unknown) => {
    deps = undefined;
    throw error;
  });
  return deps;
}
