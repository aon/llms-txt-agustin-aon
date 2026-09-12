import type {
  CrawlSnapshot,
  Page,
  Site,
  SnapshotPage,
  SnapshotSection,
} from "@llms-txt/core";
import { humanize } from "./classify/classify.js";

export const MAX_DIFF_SAMPLES = 10;
const TITLE_SEPARATORS = /\s+[|–—-]\s+/;

export interface BuildSnapshotInput {
  site: Pick<Site, "host" | "origin">;
  crawlId: string;
  generatedAt: string;
  pages: readonly Page[];
  sitePages: readonly Page[];
  sections: readonly string[];
  startedAt: string;
  changed: number;
}

/** Everything here is derived: the crawl decided section, rank and inFile. */
export function buildSnapshot(input: BuildSnapshotInput) {
  const fetched = input.pages.filter((page) => page.status === "fetched");
  const byRank = [...fetched].sort(compareRank).map(toSnapshotPage);
  const order = new Map(input.sections.map((name, index) => [name, index]));

  const sections: SnapshotSection[] = [];
  for (const name of input.sections) {
    const pages = byRank.filter((page) => page.section === name);
    if (pages.length > 0) sections.push({ name, pages });
  }

  const home = fetched.find((page) => page.path === "/");
  const titles = fetched.flatMap((page) => (page.title ? [page.title] : []));
  const snapshot: CrawlSnapshot = {
    host: input.site.host,
    origin: input.site.origin,
    crawlId: input.crawlId,
    generatedAt: input.generatedAt,
    siteTitle: siteTitleFrom(home?.title, titles, input.site.host),
    sections,
    pages: byRank.sort(
      (a, b) =>
        (order.get(a.section) ?? 0) - (order.get(b.section) ?? 0) ||
        compareSnapshotRank(a, b),
    ),
    diff: buildDiff(input),
    stats: buildStats(input.pages),
  };
  if (home?.description) snapshot.siteDescription = home.description;
  return snapshot;
}

export function siteNameFrom(pages: readonly Page[], host: string) {
  const titles = pages.flatMap((page) => (page.title ? [page.title] : []));
  const brand = repeatedBrand(titles);
  if (brand) return brand;
  const home = pages.find((page) => page.path === "/")?.title;
  const lead = home?.split(TITLE_SEPARATORS)[0]?.trim();
  if (lead) return lead;
  return humanize(host.replace(/^www\./, "").split(".")[0] ?? host) || host;
}

function buildDiff(input: BuildSnapshotInput) {
  const added = input.pages.filter(
    (page) => page.status === "fetched" && page.firstSeenAt >= input.startedAt,
  );
  const removed = input.sitePages.filter(
    (page) => page.crawlId !== input.crawlId,
  );
  const changedPaths = input.pages
    .filter(
      (page) =>
        page.lastChangedAt !== undefined &&
        page.lastChangedAt >= input.startedAt &&
        page.firstSeenAt < input.startedAt,
    )
    .map((page) => page.path);
  const samples = [
    ...new Set([...changedPaths, ...added.map((page) => page.path)]),
  ].slice(0, MAX_DIFF_SAMPLES);
  return {
    added: added.length,
    removed: removed.length,
    changed: input.changed,
    samples,
  };
}

function buildStats(pages: readonly Page[]) {
  let fetched = 0;
  let failed = 0;
  let skipped = 0;
  for (const page of pages) {
    if (page.status === "fetched") fetched += 1;
    else if (page.status === "failed") failed += 1;
    else if (page.status === "skipped") skipped += 1;
  }
  return { fetched, failed, skipped };
}

function toSnapshotPage(page: Page) {
  const snapshotPage: SnapshotPage = {
    url: page.url,
    path: page.path,
    title: page.title ?? fallbackTitle(page.path),
    section: page.section ?? "",
    rank: page.rank ?? 0,
    depth: page.depth,
    inFile: page.inFile,
    wordCount: page.wordCount ?? 0,
  };
  if (page.description) snapshotPage.description = page.description;
  if (page.contentHash) snapshotPage.contentHash = page.contentHash;
  return snapshotPage;
}

function fallbackTitle(path: string) {
  const segments = path.split("?")[0]?.split("/").filter(Boolean) ?? [];
  return humanize(segments.at(-1) ?? "") || path;
}

function compareRank(a: Page, b: Page) {
  return (a.rank ?? 0) - (b.rank ?? 0) || a.path.localeCompare(b.path);
}

function compareSnapshotRank(a: SnapshotPage, b: SnapshotPage) {
  return a.rank - b.rank || a.path.localeCompare(b.path);
}

function siteTitleFrom(
  homeTitle: string | undefined,
  titles: readonly string[],
  host: string,
) {
  const brand = repeatedBrand(titles);
  const title = homeTitle ?? brand ?? host;
  if (!brand) return title;
  return stripBrand(title, brand) || brand;
}

function repeatedBrand(titles: readonly string[]) {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const parts = title.split(TITLE_SEPARATORS);
    const last = parts.length > 1 ? parts.at(-1)?.trim() : undefined;
    if (!last || last.length > 40) continue;
    counts.set(last, (counts.get(last) ?? 0) + 1);
  }
  let brand: string | undefined;
  let best = 1;
  for (const [candidate, count] of counts) {
    if (count > best) {
      brand = candidate;
      best = count;
    }
  }
  return brand;
}

function stripBrand(title: string, brand: string) {
  const parts = title.split(TITLE_SEPARATORS);
  if (parts.length < 2 || parts.at(-1)?.trim() !== brand) return title;
  return parts.slice(0, -1).join(" - ").trim();
}
