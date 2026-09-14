import type { PageStatus } from "@llms-txt/core";
import { humanize, pagePathFromUrl } from "@llms-txt/core";
import { localeSegmentOf, normalizeLink } from "../frontier/normalize.js";

/** Lower rank is better. */
export const RANK_WEIGHTS = Object.freeze({
  depth: 10,
  inboundLink: 1,
  nav: 5,
  sitemap: 2,
});

/** A first segment this many pages share is a section, nav menu or not. */
export const MIN_SEGMENT_PAGES = 2;

/** Where the homepage and the pages hanging off the nav go. Always listed first. */
export const ROOT_SECTION = "Overview";

/** Kept as their own section: "Docs" beats folding them into the root. */
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
  lang?: string;
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
  eligible: boolean;
}

export function classifyPages(pages: readonly ClassifiablePage[]) {
  const winners = duplicateWinners(pages);
  const landing = landingOf(pages);
  const locale = landing ? localeSegmentOf(landing.path) : undefined;
  const crowded = crowdedSegments(pages, locale);
  const classified = pages.map((page) => ({
    path: page.path,
    section: sectionOf(page, crowded, locale),
    rank: rankOf(page, landing),
    eligible: isEligible(page, winners, landing),
  }));
  return { pages: classified, sections: orderSections(classified) };
}

function sectionOf(
  page: ClassifiablePage,
  crowded: ReadonlySet<string>,
  locale: string | undefined,
) {
  const first = firstSegment(page.path, locale);
  if (!first) return ROOT_SECTION;
  const key = first.toLowerCase();
  if (SECTION_SEGMENTS.has(key) || crowded.has(key)) return humanize(first);
  if (page.navLinked && page.depth <= 1) return ROOT_SECTION;
  return humanize(first) || ROOT_SECTION;
}

/** A menu that lists every feature page must not flatten them into the root section. */
function crowdedSegments(
  pages: readonly ClassifiablePage[],
  locale: string | undefined,
) {
  const counts = new Map<string, number>();
  for (const page of pages) {
    if (page.status !== "fetched") continue;
    const first = firstSegment(page.path, locale)?.toLowerCase();
    if (first) counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  const crowded = new Set<string>();
  for (const [segment, count] of counts) {
    if (count >= MIN_SEGMENT_PAGES) crowded.add(segment);
  }
  return crowded;
}

function rankOf(page: ClassifiablePage, landing: ClassifiablePage | undefined) {
  if (page.path === "/" || page === landing) return 0;
  const raw =
    page.depth * RANK_WEIGHTS.depth -
    page.inboundLinks * RANK_WEIGHTS.inboundLink -
    (page.navLinked ? RANK_WEIGHTS.nav : 0) -
    (page.inSitemap ? RANK_WEIGHTS.sitemap : 0);
  // The homepage keeps rank 0 to itself, so nothing else may reach it.
  return Math.max(1, raw);
}

/** Whether a page may appear in the file at all; where it lands is the selector's call. */
function isEligible(
  page: ClassifiablePage,
  winners: ReadonlyMap<string, string>,
  landing: ClassifiablePage | undefined,
) {
  if (page.status !== "fetched") return false;
  if (page.noindex || !page.allowed) return false;
  if (isTranslation(page, landing)) return false;
  if (pointsElsewhere(page)) return false;
  if (page.contentHash && winners.get(page.contentHash) !== page.path) {
    return false;
  }
  return true;
}

/** The root, or wherever it redirected to: the page whose language the file follows. */
function landingOf(pages: readonly ClassifiablePage[]) {
  const fetched = pages.filter((page) => page.status === "fetched");
  return (
    fetched.find((page) => page.path === "/") ??
    fetched.find((page) => page.depth === 0)
  );
}

/** A copy of the site in another language, by its lang tag or a locale path such as /de-de/. */
function isTranslation(
  page: ClassifiablePage,
  landing: ClassifiablePage | undefined,
) {
  if (!landing || page === landing) return false;
  const locale = localeSegmentOf(page.path);
  if (locale && locale !== localeSegmentOf(landing.path)) return true;
  const language = primaryLanguage(page.lang);
  const siteLanguage = primaryLanguage(landing.lang);
  return (
    language !== undefined &&
    siteLanguage !== undefined &&
    language !== siteLanguage
  );
}

function primaryLanguage(lang: string | undefined) {
  const primary = lang?.split("-")[0]?.trim().toLowerCase();
  return primary || undefined;
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

/** Root first, then by weight, so many well-linked pages beat a single good one. */
function orderSections(pages: readonly PageClassification[]) {
  const weight = new Map<string, number>();
  for (const page of pages) {
    const gain = page.eligible ? 1 / (page.rank + 1) : 0;
    weight.set(page.section, (weight.get(page.section) ?? 0) + gain);
  }
  return [...weight.keys()].sort((a, b) => {
    if (a === ROOT_SECTION) return -1;
    if (b === ROOT_SECTION) return 1;
    const byWeight = (weight.get(b) ?? 0) - (weight.get(a) ?? 0);
    return byWeight !== 0 ? byWeight : a.localeCompare(b); // fallback to alphabetical
  });
}

/** On a site that lives under /en-us/, the segment after the locale is the section. */
function firstSegment(path: string, locale: string | undefined) {
  const withoutQuery = path.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  const start =
    locale !== undefined && segments[0]?.toLowerCase() === locale ? 1 : 0;
  return segments[start];
}
