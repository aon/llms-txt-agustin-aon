import "server-only";
import type { Site } from "@llms-txt/core";
import { crawlLlmsTxtKey, isCrawlFinished } from "@llms-txt/core";
import { backend } from "./backend";
import { recrawlOpensAt } from "./monitor";
import { isThin } from "./pages";

/** Crawls shown in the history block, newest first. */
export const HISTORY_LIMIT = 20;

export async function loadCrawlPage(host: string, crawlId: string) {
  const { store } = backend();
  const [site, crawl, pages, history] = await Promise.all([
    store.getSite(host),
    store.getCrawl(host, crawlId),
    store.listPagesByCrawl(crawlId),
    store.listCrawls(host, HISTORY_LIMIT),
  ]);
  if (!site || !crawl) return null;
  const file = crawl.status === "done" ? await loadFile(host, crawlId) : null;
  return {
    site: summarizeSite(site),
    crawl,
    pages,
    history,
    file,
    thin: crawl.status === "done" && isThin(pages),
  };
}

export type CrawlPageData = NonNullable<
  Awaited<ReturnType<typeof loadCrawlPage>>
>;

export async function loadSitePage(host: string) {
  const { store } = backend();
  const [site, history, pages] = await Promise.all([
    store.getSite(host),
    store.listCrawls(host, HISTORY_LIMIT),
    store.listPages(host, { eligible: true }),
  ]);
  if (!site) return null;
  const latest = history[0];
  const current = history.find((crawl) => crawl.status === "done");
  const file = current ? await loadFile(host, current.crawlId) : null;
  return {
    site: summarizeSite(site),
    history,
    pages,
    file,
    current: current ?? null,
    running: latest && !isCrawlFinished(latest) ? latest : null,
  };
}

export type SitePageData = NonNullable<
  Awaited<ReturnType<typeof loadSitePage>>
>;

/** What the URL form needs to tell a known site from a new one before anything is crawled. */
export async function loadSiteMatch(host: string) {
  const { store } = backend();
  const site = await store.getSite(host);
  if (!site) return null;
  const [latest, done] = await Promise.all([
    site.latestCrawlId ? store.getCrawl(host, site.latestCrawlId) : null,
    site.lastDoneCrawlId ? store.getCrawl(host, site.lastDoneCrawlId) : null,
  ]);
  const writtenAt = done ? (done.finishedAt ?? done.createdAt) : null;
  return {
    host,
    running:
      latest && !isCrawlFinished(latest)
        ? { crawlId: latest.crawlId, status: latest.status }
        : null,
    file:
      done && writtenAt
        ? {
            writtenAt,
            recrawlOpensAt: recrawlOpensAt(writtenAt),
          }
        : null,
    lastFailed: latest?.status === "failed",
  };
}

export type SiteMatch = NonNullable<Awaited<ReturnType<typeof loadSiteMatch>>>;

export async function loadCurrentFile(host: string) {
  const { store, files } = backend();
  const site = await store.getSite(host);
  if (!site?.currentLlmsTxtKey) return null;
  return files.getObject(site.currentLlmsTxtKey);
}

export type SiteSummary = ReturnType<typeof summarizeSite>;

/** What the pages need from the site row, without robots rules and the lease. */
function summarizeSite(site: Site) {
  return {
    host: site.host,
    origin: site.origin,
    monitoring: site.config.scheduleHours !== undefined,
    nextRunAt: site.nextRunAt ?? null,
    lastDoneCrawlId: site.lastDoneCrawlId ?? null,
  };
}

async function loadFile(host: string, crawlId: string) {
  const bytes = await backend().files.getObject(crawlLlmsTxtKey(host, crawlId));
  return bytes ? new TextDecoder().decode(bytes) : null;
}
