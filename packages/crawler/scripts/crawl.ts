import { parseArgs } from "node:util";
import {
  DEFAULT_SITE_CONFIG,
  MemoryFileStore,
  MemoryStore,
  newCrawlId,
  normalizeOrigin,
  nowIso,
  TIMING,
} from "@llms-txt/core";
import { crawl, RateLimitedError } from "../dist/index.js";

const USER_AGENT =
  "llms-txt-generator/0.1 (+https://github.com/agustinaon/llms-txt-agustin-aon)";

async function main() {
  const { url, pageCap, budgetMs, json } = readArgs();
  const { host, origin } = normalizeOrigin(url);
  const store = new MemoryStore();
  const files = new MemoryFileStore();
  const site = await store.putSiteIfAbsent({
    host,
    origin,
    config: { ...DEFAULT_SITE_CONFIG, pageCap },
  });
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

  let requests = 0;
  const fetch: typeof globalThis.fetch = (input, init) => {
    requests += 1;
    process.stderr.write(
      `  ${String(requests).padStart(4)}  ${urlOf(input)}\n`,
    );
    return globalThis.fetch(input, init);
  };
  const startedAt = Date.now();
  process.stderr.write(
    `Crawling ${origin} (cap ${pageCap} pages, budget ${budgetMs / 1000}s)\n`,
  );
  const result = await crawl(
    { site, crawlId, budgetMs, userAgent: USER_AGENT },
    { store, files, fetch, now: () => new Date(), sleep },
  );
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (!result.finished) {
    const rows = await store.listPages(host);
    const queued = rows.filter((row) => row.status === "queued").length;
    process.stderr.write(
      `Budget spent after ${elapsed}s with ${queued} pages still queued. A worker would continue in a new invocation.\n`,
    );
    process.exit(2);
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result.snapshot, null, 2)}\n`);
    return;
  }
  const rows = await store.listPages(host);
  printSummary(result.snapshot, rows, elapsed);
}

function readArgs() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pages: { type: "string", short: "p" },
      budget: { type: "string", short: "b" },
      json: { type: "boolean", default: false },
    },
  });
  const url = positionals[0];
  if (!url) {
    process.stderr.write(
      "Usage: pnpm --filter @llms-txt/crawler crawl <url> [--pages N] [--budget SECONDS] [--json]\n",
    );
    process.exit(1);
  }
  return {
    url,
    pageCap: values.pages
      ? Number.parseInt(values.pages, 10)
      : DEFAULT_SITE_CONFIG.pageCap,
    budgetMs: values.budget
      ? Number.parseInt(values.budget, 10) * 1000
      : TIMING.workerBudgetMs,
    json: values.json,
  };
}

type Snapshot = Extract<
  Awaited<ReturnType<typeof crawl>>,
  { finished: true }
>["snapshot"];
type Rows = Awaited<ReturnType<MemoryStore["listPages"]>>;

function printSummary(snapshot: Snapshot, rows: Rows, elapsed: string) {
  const out: string[] = [];
  out.push(`${snapshot.siteTitle} — ${snapshot.origin}`);
  if (snapshot.siteDescription) out.push(`  ${snapshot.siteDescription}`);
  out.push("");
  out.push(
    `Fetched ${snapshot.stats.fetched}, skipped ${snapshot.stats.skipped}, failed ${snapshot.stats.failed} in ${elapsed}s`,
  );
  out.push(
    `In file: ${snapshot.pages.filter((page) => page.inFile).length} pages across ${snapshot.sections.length} sections`,
  );
  out.push("");
  for (const section of snapshot.sections) {
    out.push(`## ${section.name}`);
    for (const page of section.pages) {
      const marker = page.inFile ? " " : "-";
      const thin = page.wordCount < 50 ? " (thin)" : "";
      out.push(
        `${marker} [${String(page.rank).padStart(3)}] ${page.path}  ${page.title}${thin}`,
      );
    }
    out.push("");
  }
  const problems = rows.filter(
    (row) => row.status === "skipped" || row.status === "failed",
  );
  if (problems.length > 0) {
    out.push("## Skipped and failed");
    for (const row of problems) {
      out.push(
        `  ${row.status.padEnd(7)} ${row.path}  ${row.skipReason ?? `HTTP ${row.httpStatus ?? "?"}`}`,
      );
    }
    out.push("");
  }
  const excluded = snapshot.pages.filter((page) => !page.inFile);
  if (excluded.length > 0) {
    out.push(
      `Fetched but left out of the file (noindex, duplicate or canonical elsewhere): ${excluded.map((page) => page.path).join(", ")}`,
    );
    out.push("");
  }
  out.push(
    `Diff vs previous crawl: +${snapshot.diff.added} -${snapshot.diff.removed} ~${snapshot.diff.changed}`,
  );
  process.stdout.write(`${out.join("\n")}\n`);
}

function urlOf(input: string | URL | Request) {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  if (error instanceof RateLimitedError) {
    process.stderr.write(`Aborted: ${error.message}\n`);
    process.exit(3);
  }
  throw error;
});
