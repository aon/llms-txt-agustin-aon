import { isCrawlFinished } from "@llms-txt/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CrawlView } from "@/components/ledger/crawl-view";
import { LiveRefresh } from "@/components/ledger/live-refresh";
import { Shell } from "@/components/ledger/shell";
import { loadCrawlPage } from "@/lib/site-data";

/** How often the page asks the server for the crawl row while it runs. */
const POLL_MS = 2500;

export async function generateMetadata({
  params,
}: PageProps<"/sites/[host]/crawls/[crawlId]">): Promise<Metadata> {
  const { host } = await params;
  return { title: `Crawling ${host} · llms.txt` };
}

export default async function CrawlPage({
  params,
}: PageProps<"/sites/[host]/crawls/[crawlId]">) {
  const { host, crawlId } = await params;
  const data = await loadCrawlPage(host, crawlId);
  if (!data) notFound();
  const finished = isCrawlFinished(data.crawl);
  return (
    <Shell
      host={host}
      origin={data.site.origin}
      state={finished ? "finished" : "running"}
      crawledAt={data.crawl.createdAt}
    >
      <LiveRefresh active={!finished} everyMs={POLL_MS} />
      <CrawlView data={data} />
    </Shell>
  );
}
