import type {
  CrawlSnapshot,
  Page,
  Site,
  SnapshotPage,
  SnapshotSection,
} from "@llms-txt/core";
import { humanize } from "./classify/classify.js";

export const MAX_DIFF_SAMPLES = 10;
/** Enough of a landing for a model to describe the site, not a full-text dump. */
export const MAX_LANDING_TEXT_LENGTH = 6000;
const TITLE_SEPARATORS = /\s+[|–—-]\s+/;
/** A tagline hangs off the site name by a colon as often as by a pipe. */
const TITLE_LEAD_SEPARATORS = /\s+[|–—-]\s+|:\s+/;
const GENERIC_LEADS: ReadonlySet<string> = new Set([
  "home",
  "welcome",
  "homepage",
  "index",
  "start",
]);

export interface BuildSnapshotInput {
  site: Pick<Site, "host" | "origin">;
  crawlId: string;
  generatedAt: string;
  pages: readonly Page[];
  sitePages: readonly Page[];
  sections: readonly string[];
  startedAt: string;
  changed: number;
  landingText?: string;
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

  const home = landingOf(fetched);
  const titles = fetched.flatMap((page) => (page.title ? [page.title] : []));
  const brand = repeatedBrand(titles);
  const snapshot: CrawlSnapshot = {
    host: input.site.host,
    origin: input.site.origin,
    crawlId: input.crawlId,
    generatedAt: input.generatedAt,
    siteTitle: siteName(brand, home?.title, input.site.host),
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
  if (brand) snapshot.brand = brand;
  const landingText = headOf(input.landingText ?? "", MAX_LANDING_TEXT_LENGTH);
  if (landingText) snapshot.landingText = landingText;
  return snapshot;
}

/** The root, or wherever the root redirected to on a site that lives under /en. */
export function landingOf<T extends Pick<Page, "path" | "depth" | "status">>(
  pages: readonly T[],
) {
  const fetched = pages.filter((page) => page.status === "fetched");
  return (
    fetched.find((page) => page.path === "/") ??
    fetched.find((page) => page.depth === 0)
  );
}

export function siteNameFrom(pages: readonly Page[], host: string) {
  const titles = pages.flatMap((page) => (page.title ? [page.title] : []));
  return siteName(repeatedBrand(titles), landingOf(pages)?.title, host);
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

function headOf(text: string, max: number) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = head.lastIndexOf(" ");
  return (cut > 0 ? head.slice(0, cut) : head).trimEnd();
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

function siteName(
  brand: string | undefined,
  homeTitle: string | undefined,
  host: string,
) {
  if (brand) return brand;
  const lead = leadSegment(homeTitle);
  if (lead) return lead;
  return humanize(host.replace(/^www\./, "").split(".")[0] ?? host) || host;
}

/** The name is the segment the tagline hangs off, whichever end it sits at. */
function leadSegment(title: string | undefined) {
  const parts =
    title
      ?.split(TITLE_LEAD_SEPARATORS)
      .map((part) => part.trim())
      .filter(Boolean) ?? [];
  const lead = parts[0];
  if (!lead) return undefined;
  if (parts.length > 1 && GENERIC_LEADS.has(lead.toLowerCase())) {
    return parts.at(-1);
  }
  return lead;
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
