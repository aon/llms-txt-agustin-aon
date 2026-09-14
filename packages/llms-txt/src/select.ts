import type { CrawlSnapshot, SnapshotPage } from "@llms-txt/core";
import {
  cleanLine,
  cleanNote,
  cleanTitle,
  collapse,
  MAX_TITLE_LENGTH,
  titleFromPath,
} from "./text.js";

export const RENDER_LIMITS = Object.freeze({
  maxSections: 8,
  maxLinksPerSection: 15,
  maxMainLinks: 60,
  maxOptionalLinks: 100,
  minSectionLinks: 2,
  minWordsMain: 50,
  boilerplateNoteCount: 3,
});

/** Widened from the defaults so a caller can pass any number. */
export type RenderLimits = {
  -readonly [K in keyof typeof RENDER_LIMITS]: number;
};

/** The spec's own name for the links an agent may skip. */
export const OPTIONAL_SECTION = "Optional";
const HOME_TITLE = "Home";

/** Pages nobody asks an agent to read: legal, account and index plumbing. */
export const LOW_VALUE_PATH =
  /(^|\/)(privacy|terms|cookie|cookies|legal|imprint|login|log-in|signin|sign-in|signup|sign-up|register|cart|checkout|account|search|tag|tags|category|categories|author|authors|page\/\d+)(\/|$)/i;

export interface Link {
  path: string;
  title: string;
  url: string;
  note?: string;
}

export function selectLinks(
  snapshot: CrawlSnapshot,
  limits: RenderLimits = RENDER_LIMITS,
) {
  const optional: SnapshotPage[] = [];
  const sections = keepLeading(
    fold(split(snapshot, limits, optional), limits),
    limits,
    optional,
  );
  cap(sections, limits, optional);

  const toLink = linkBuilder(snapshot, limits);
  const result = {
    sections: sections
      .filter((section) => section.pages.length > 0)
      .map((section) => ({
        name: section.name,
        links: section.pages.map(toLink),
      })),
    optional: optional
      .sort(byRank)
      .slice(0, limits.maxOptionalLinks)
      .map(toLink),
  };
  disambiguateTitles([
    ...result.sections.flatMap((section) => section.links),
    ...result.optional,
  ]);
  return result;
}

interface Group {
  name: string;
  pages: SnapshotPage[];
}

function split(
  snapshot: CrawlSnapshot,
  limits: RenderLimits,
  optional: SnapshotPage[],
) {
  const sections: Group[] = [];
  for (const section of snapshot.sections) {
    const pages: SnapshotPage[] = [];
    const candidates = section.pages.filter((page) => page.eligible);
    const reserved =
      section.name.toLowerCase() === OPTIONAL_SECTION.toLowerCase();
    for (const page of candidates.sort(byRank)) {
      if (reserved || isLowValue(page, limits)) optional.push(page);
      else pages.push(page);
    }
    sections.push({ name: section.name, pages });
  }
  return sections;
}

/** A section of one link reads as noise, so it joins the site's own section. */
function fold(sections: Group[], limits: RenderLimits) {
  const first = sections[0];
  if (!first || sections.length === 1) return sections;

  const kept: Group[] = [first];
  const folded: SnapshotPage[] = [];
  for (const section of sections.slice(1)) {
    if (section.pages.length < limits.minSectionLinks) {
      folded.push(...section.pages);
    } else kept.push(section);
  }
  // Folded pages compete on rank instead of being appended past the cap.
  first.pages = [...first.pages, ...folded].sort(byRank);
  return kept;
}

/** The sections arrive ordered by weight, so the ones past the limit are the least valuable. */
function keepLeading(
  sections: Group[],
  limits: RenderLimits,
  optional: SnapshotPage[],
) {
  for (const section of sections.slice(limits.maxSections)) {
    optional.push(...section.pages);
  }
  return sections.slice(0, limits.maxSections);
}

/** Budget shares follow section weight so a heavy section is never starved by the ones listed first. */
function cap(
  sections: Group[],
  limits: RenderLimits,
  optional: SnapshotPage[],
) {
  const weights = new Map(
    sections.map((section) => [section, weightOf(section)] as const),
  );
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  const room = new Map<Group, number>();
  let budget = limits.maxMainLinks;
  for (const section of sections) {
    const share =
      total > 0
        ? Math.round(
            (limits.maxMainLinks * (weights.get(section) ?? 0)) / total,
          )
        : 0;
    const kept = Math.max(
      0,
      Math.min(
        section.pages.length,
        budget,
        Math.max(
          limits.minSectionLinks,
          Math.min(share, limits.maxLinksPerSection),
        ),
      ),
    );
    room.set(section, kept);
    budget -= kept;
  }
  for (const section of sections) {
    const kept = room.get(section) ?? 0;
    const wanted = Math.min(section.pages.length, limits.maxLinksPerSection);
    const extra = Math.max(0, Math.min(wanted - kept, budget));
    room.set(section, kept + extra);
    budget -= extra;
  }
  for (const section of sections) {
    const kept = room.get(section) ?? 0;
    optional.push(...section.pages.slice(kept));
    section.pages = section.pages.slice(0, kept);
  }
}

/** Several links with one title, "Press Overview" four times, are told apart by their paths. */
function disambiguateTitles(links: Link[]) {
  const counts = new Map<string, number>();
  for (const link of links) {
    counts.set(link.title, (counts.get(link.title) ?? 0) + 1);
  }
  for (const link of links) {
    if ((counts.get(link.title) ?? 0) < 2 || link.title === HOME_TITLE)
      continue;
    link.title = titleFromPath(link.path) || link.title;
  }
}

function weightOf(section: Group) {
  return section.pages.reduce((sum, page) => sum + 1 / (page.rank + 1), 0);
}

function isLowValue(page: SnapshotPage, limits: RenderLimits) {
  if (LOW_VALUE_PATH.test(pathWithoutQuery(page.path))) return true;
  return !isLanding(page) && page.wordCount < limits.minWordsMain;
}

/** A note is the page's own description or nothing: the file never invents one. */
function linkBuilder(snapshot: CrawlSnapshot, limits: RenderLimits) {
  const brand = snapshot.brand ?? snapshot.siteTitle;
  const boilerplate = boilerplateNotes(snapshot, limits);
  return (page: SnapshotPage) => {
    const title = titleOf(page, brand);
    const link: Link = { path: page.path, title, url: page.url };
    const note = describe(page, title, boilerplate);
    if (note) link.note = note;
    return link;
  };
}

/** One description repeated across the site says nothing about any one page. */
function boilerplateNotes(snapshot: CrawlSnapshot, limits: RenderLimits) {
  const counts = new Map<string, number>();
  for (const page of snapshot.pages) {
    if (!page.eligible || !page.description) continue;
    const description = collapse(page.description);
    counts.set(description, (counts.get(description) ?? 0) + 1);
  }
  const repeated = new Set<string>();
  for (const [description, count] of counts) {
    if (count >= limits.boilerplateNoteCount) repeated.add(description);
  }
  if (snapshot.siteDescription) {
    repeated.add(collapse(snapshot.siteDescription));
  }
  return repeated;
}

function describe(
  page: SnapshotPage,
  title: string,
  boilerplate: ReadonlySet<string>,
) {
  if (!page.description) return undefined;
  if (boilerplate.has(collapse(page.description))) return undefined;
  return cleanNote(page.description, title);
}

/** The H1 already names the site, so the homepage link needs no tagline. */
function titleOf(page: SnapshotPage, brand: string) {
  if (isLanding(page)) return HOME_TITLE;
  return (
    cleanTitle(page.title, brand, page.section) ||
    cleanLine(page.path, MAX_TITLE_LENGTH)
  );
}

/** The root, or the page it redirected to on a site that lives under /en-us/. */
function isLanding(page: SnapshotPage) {
  return page.path === "/" || page.depth === 0;
}

function pathWithoutQuery(path: string) {
  return path.split("?")[0] ?? path;
}

function byRank(a: SnapshotPage, b: SnapshotPage) {
  return a.rank - b.rank || a.path.localeCompare(b.path);
}
