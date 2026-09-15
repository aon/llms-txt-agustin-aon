import type { Page } from "@llms-txt/core";

export type PageChange = "added" | "changed";

/** Same rule the crawler's diff uses: the crawl start is the baseline. */
export function pageChange(
  page: Pick<Page, "status" | "firstSeenAt" | "lastChangedAt">,
  startedAt: string | undefined,
): PageChange | undefined {
  if (page.status !== "fetched" || !startedAt) return undefined;
  if (page.firstSeenAt >= startedAt) return "added";
  if (page.lastChangedAt !== undefined && page.lastChangedAt >= startedAt) {
    return "changed";
  }
  return undefined;
}

export function countByStatus(pages: readonly Pick<Page, "status">[]) {
  const counts = { queued: 0, fetched: 0, skipped: 0, failed: 0 };
  for (const page of pages) counts[page.status] += 1;
  return counts;
}

export function sectionCount(
  pages: readonly Pick<Page, "status" | "eligible" | "section">[],
) {
  const sections = new Set<string>();
  for (const page of pages) {
    if (page.status === "fetched" && page.eligible && page.section) {
      sections.add(page.section);
    }
  }
  return sections.size;
}

/** Below this many words on every page the site almost surely renders in the browser. */
export const THIN_PAGE_WORDS = 40;

export function isThin(pages: readonly Pick<Page, "status" | "wordCount">[]) {
  const fetched = pages.filter((page) => page.status === "fetched");
  return (
    fetched.length > 0 &&
    fetched.every((page) => (page.wordCount ?? 0) < THIN_PAGE_WORDS)
  );
}
