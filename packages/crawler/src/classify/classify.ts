import type { PageStatus } from "@llms-txt/core";
import { pagePathFromUrl } from "@llms-txt/core";
import { normalizeLink } from "../frontier/normalize.js";

/** Lower rank is better. */
export const RANK_WEIGHTS = Object.freeze({
  depth: 10,
  inboundLink: 1,
  nav: 5,
  sitemap: 2,
});

/** A first segment this many pages share is a section, nav menu or not. */
export const MIN_SEGMENT_PAGES = 2;

/** Kept as their own section: "Docs" beats folding them into the site name. */
export const SECTION_SEGMENTS: ReadonlySet<string> = new Set([
  "docs",
  "doc",
  "documentation",
  "guide",
  "guides",
  "reference",
  "api",
  "manual",
  "handbook",
  "learn",
  "tutorial",
  "tutorials",
  "blog",
  "changelog",
]);

export interface ClassifiablePage {
  url: string;
  path: string;
  depth: number;
  status: PageStatus;
  noindex: boolean;
  allowed: boolean;
  canonicalUrl?: string;
  contentHash?: string;
  inboundLinks: number;
  navLinked: boolean;
  inSitemap: boolean;
}

export interface PageClassification {
  path: string;
  section: string;
  rank: number;
  inFile: boolean;
}

export interface ClassifyOptions {
  siteName: string;
}

export function classifyPages(
  pages: readonly ClassifiablePage[],
  options: ClassifyOptions,
) {
  const winners = duplicateWinners(pages);
  const crowded = crowdedSegments(pages);
  const classified = pages.map((page) => ({
    path: page.path,
    section: sectionOf(page, options.siteName, crowded),
    rank: rankOf(page),
    inFile: isInFile(page, winners),
  }));
  return { pages: classified, sections: orderSections(classified, options) };
}

export function humanize(segment: string) {
  const words = decodeSegment(segment)
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.map(capitalize).join(" ");
}

const ACRONYMS: Readonly<Record<string, string>> = Object.freeze({
  api: "API",
  faq: "FAQ",
  sdk: "SDK",
  cli: "CLI",
  ui: "UI",
});

/** A path segment may hold a bare percent sign, which is not valid escaping. */
function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function capitalize(word: string) {
  const lower = word.toLowerCase();
  return ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}

function sectionOf(
  page: ClassifiablePage,
  siteName: string,
  crowded: ReadonlySet<string>,
) {
  const first = firstSegment(page.path);
  if (!first) return siteName;
  const key = first.toLowerCase();
  if (SECTION_SEGMENTS.has(key) || crowded.has(key)) return humanize(first);
  if (page.navLinked && page.depth <= 1) return siteName;
  return humanize(first) || siteName;
}

/** A menu that lists every feature page must not flatten them into the site section. */
function crowdedSegments(pages: readonly ClassifiablePage[]) {
  const counts = new Map<string, number>();
  for (const page of pages) {
    if (page.status !== "fetched") continue;
    const first = firstSegment(page.path)?.toLowerCase();
    if (first) counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  const crowded = new Set<string>();
  for (const [segment, count] of counts) {
    if (count >= MIN_SEGMENT_PAGES) crowded.add(segment);
  }
  return crowded;
}

function rankOf(page: ClassifiablePage) {
  if (page.path === "/") return 0;
  const raw =
    page.depth * RANK_WEIGHTS.depth -
    page.inboundLinks * RANK_WEIGHTS.inboundLink -
    (page.navLinked ? RANK_WEIGHTS.nav : 0) -
    (page.inSitemap ? RANK_WEIGHTS.sitemap : 0);
  // The homepage keeps rank 0 to itself, so nothing else may reach it.
  return Math.max(1, raw);
}

function isInFile(
  page: ClassifiablePage,
  winners: ReadonlyMap<string, string>,
) {
  if (page.status !== "fetched") return false;
  if (page.noindex || !page.allowed) return false;
  if (pointsElsewhere(page)) return false;
  if (page.contentHash && winners.get(page.contentHash) !== page.path) {
    return false;
  }
  return true;
}

function pointsElsewhere(page: ClassifiablePage) {
  if (!page.canonicalUrl) return false;
  try {
    const host = new URL(page.url).host;
    const canonical = normalizeLink(page.canonicalUrl, page.url, host);
    if (canonical === null) return false;
    return pagePathFromUrl(canonical) !== page.path;
  } catch {
    return false;
  }
}

function duplicateWinners(pages: readonly ClassifiablePage[]) {
  const winners = new Map<string, string>();
  for (const page of pages) {
    if (page.status !== "fetched" || !page.contentHash) continue;
    const current = winners.get(page.contentHash);
    if (current === undefined || shorterPath(page.path, current)) {
      winners.set(page.contentHash, page.path);
    }
  }
  return winners;
}

function shorterPath(candidate: string, current: string) {
  if (candidate.length !== current.length) {
    return candidate.length < current.length;
  }
  return candidate < current;
}

function orderSections(
  pages: readonly PageClassification[],
  options: ClassifyOptions,
) {
  const best = new Map<string, number>();
  for (const page of pages) {
    const current = best.get(page.section);
    if (current === undefined || page.rank < current) {
      best.set(page.section, page.rank);
    }
  }
  return [...best.keys()].sort((a, b) => {
    if (a === options.siteName) return -1;
    if (b === options.siteName) return 1;
    const byRank = (best.get(a) ?? 0) - (best.get(b) ?? 0);
    return byRank !== 0 ? byRank : a.localeCompare(b);
  });
}

function firstSegment(path: string) {
  const withoutQuery = path.split("?")[0] ?? "";
  return withoutQuery.split("/").filter(Boolean)[0];
}
