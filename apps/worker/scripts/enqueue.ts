import { parseArgs } from "node:util";
import {
  DEFAULT_SITE_CONFIG,
  newCrawlId,
  normalizeOrigin,
  nowIso,
} from "@llms-txt/core";
import { deployedStack } from "./stack.ts";

/** Does what the web app does to start a crawl: rows first, then the message. */
async function main() {
  const { url, pageCap, scheduleHours } = readArgs();
  const { host, origin } = normalizeOrigin(url);
  const { store, queue } = await deployedStack();

  let site = await store.putSiteIfAbsent({
    host,
    origin,
    config: { ...DEFAULT_SITE_CONFIG, pageCap },
  });
  if (scheduleHours !== undefined) {
    site = await store.updateSite(host, {
      config: { ...site.config, scheduleHours },
    });
  }

  const crawlId = newCrawlId();
  await store.putCrawl(host, {
    crawlId,
    status: "queued",
    reason: "user",
    phase: "discovery",
    invocations: 0,
    pagesQueued: 0,
    pagesFetched: 0,
    pagesFailed: 0,
    pagesChanged: 0,
    createdAt: nowIso(),
  });
  await store.updateSite(host, { latestCrawlId: crawlId });
  await queue.enqueue({ siteId: host, crawlId, reason: "user" });

  process.stdout.write(`Enqueued crawl ${crawlId} for ${origin}\n`);
  process.stdout.write(
    `Follow it with: pnpm --filter @llms-txt/worker status ${host} --watch\n`,
  );
}

function readArgs() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pages: { type: "string", short: "p" },
      schedule: { type: "string", short: "s" },
    },
  });
  const url = positionals[0];
  if (!url) {
    process.stderr.write(
      "Usage: pnpm --filter @llms-txt/worker enqueue <url> [--pages N] [--schedule HOURS]\n",
    );
    process.exit(1);
  }
  return {
    url,
    pageCap: values.pages
      ? Number.parseInt(values.pages, 10)
      : DEFAULT_SITE_CONFIG.pageCap,
    scheduleHours: values.schedule
      ? Number.parseInt(values.schedule, 10)
      : undefined,
  };
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
