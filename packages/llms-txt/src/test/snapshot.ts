import { readFileSync } from "node:fs";
import type { CrawlSnapshot, SnapshotPage } from "@llms-txt/core";

export function loadFixture(name: string) {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as CrawlSnapshot;
}

export function loadGolden(name: string) {
  return readFileSync(
    new URL(`./fixtures/${name}.llms.txt`, import.meta.url),
    "utf8",
  );
}

export interface FakeSection {
  name: string;
  pages: Array<Partial<SnapshotPage> & { path: string }>;
}

export interface FakeSnapshot {
  siteTitle?: string;
  siteDescription?: string;
  brand?: string;
  landingText?: string;
  sections: FakeSection[];
}

export function makeSnapshot(input: FakeSnapshot) {
  const sections = input.sections.map((section) => ({
    name: section.name,
    pages: section.pages.map((page, index) => fill(page, section.name, index)),
  }));
  const snapshot: CrawlSnapshot = {
    host: "example.com",
    origin: ORIGIN,
    crawlId: "01TEST",
    generatedAt: "2026-09-12T10:00:00.000Z",
    siteTitle: input.siteTitle ?? "Example",
    sections,
    pages: sections.flatMap((section) => section.pages),
    diff: { added: 0, removed: 0, changed: 0, samples: [] },
    stats: { fetched: 0, failed: 0, skipped: 0 },
  };
  if (input.siteDescription) snapshot.siteDescription = input.siteDescription;
  if (input.brand) snapshot.brand = input.brand;
  if (input.landingText) snapshot.landingText = input.landingText;
  return snapshot;
}

const ORIGIN = "https://example.com";

function fill(
  page: Partial<SnapshotPage> & { path: string },
  section: string,
  index: number,
) {
  const filled: SnapshotPage = {
    url: `${ORIGIN}${page.path}`,
    path: page.path,
    title: page.title ?? page.path,
    section,
    rank: page.rank ?? index + 1,
    depth: page.depth ?? 1,
    inFile: page.inFile ?? true,
    wordCount: page.wordCount ?? 200,
  };
  if (page.description) filled.description = page.description;
  return filled;
}
