import { parseArgs } from "node:util";
import { deployedStack } from "./stack.ts";

const POLL_MS = 3000;

/** Prints a crawl row, follows it with --watch, and shows the file with --file. */
async function main() {
  const { host, crawlId: requested, watch, file } = readArgs();
  const { store, files } = await deployedStack();

  const site = await store.getSite(host);
  if (!site) throw new Error(`No site ${host} in the table`);
  const crawlId = requested ?? site.latestCrawlId;
  if (!crawlId) throw new Error(`Site ${host} has no crawl yet`);

  while (true) {
    const crawl = await store.getCrawl(host, crawlId);
    if (!crawl) throw new Error(`No crawl ${crawlId} for ${host}`);
    const fresh = await store.getSite(host);
    process.stdout.write(
      `${crawl.status.padEnd(7)} ${crawl.phase.padEnd(10)} ` +
        `inv ${crawl.invocations}  queued ${crawl.pagesQueued}  fetched ${crawl.pagesFetched}  ` +
        `failed ${crawl.pagesFailed}  changed ${crawl.pagesChanged}` +
        (fresh?.lease ? `  lease ${fresh.lease.crawlId}` : "") +
        (crawl.error ? `  error: ${crawl.error}` : "") +
        "\n",
    );
    const finished = crawl.status === "done" || crawl.status === "failed";
    if (finished || !watch) {
      if (finished) process.stdout.write(`${JSON.stringify(crawl, null, 2)}\n`);
      if (file && crawl.llmsTxtKey) {
        const bytes = await files.getObject(crawl.llmsTxtKey);
        process.stdout.write(
          bytes ? `\n${new TextDecoder().decode(bytes)}` : "\nFile not in S3\n",
        );
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function readArgs() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      watch: { type: "boolean", short: "w", default: false },
      file: { type: "boolean", short: "f", default: false },
    },
  });
  const host = positionals[0];
  if (!host) {
    process.stderr.write(
      "Usage: pnpm --filter @llms-txt/worker status <host> [crawlId] [--watch] [--file]\n",
    );
    process.exit(1);
  }
  return {
    host,
    crawlId: positionals[1],
    watch: values.watch,
    file: values.file,
  };
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
