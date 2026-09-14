import { humanize } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import type { ClassifiablePage } from "./classify.js";
import { classifyPages, ROOT_SECTION } from "./classify.js";

describe("classifyPages: sections", () => {
  it("puts the homepage in the root section", () => {
    expect(sectionOf(page({ path: "/", depth: 0 }))).toBe(ROOT_SECTION);
  });

  it("puts nav pages near the root in the root section", () => {
    expect(sectionOf(page({ path: "/about", depth: 1, navLinked: true }))).toBe(
      ROOT_SECTION,
    );
    expect(
      sectionOf(page({ path: "/deep/about", depth: 2, navLinked: true })),
    ).toBe("Deep");
  });

  it("keeps docs-like segments as their own section, even from the nav", () => {
    expect(sectionOf(page({ path: "/docs", depth: 1, navLinked: true }))).toBe(
      "Docs",
    );
    expect(sectionOf(page({ path: "/api/v2", depth: 2 }))).toBe("API");
  });

  it("gives a segment several pages share its own section, nav or not", () => {
    const { pages } = classifyPages([
      page({ path: "/", depth: 0 }),
      page({ path: "/about", depth: 1, navLinked: true }),
      page({ path: "/features", depth: 1, navLinked: true }),
      page({ path: "/features/agenda", depth: 1, navLinked: true }),
      page({ path: "/features/alerts", depth: 2 }),
    ]);
    const sections = Object.fromEntries(pages.map((p) => [p.path, p.section]));
    expect(sections).toEqual({
      "/": ROOT_SECTION,
      "/about": ROOT_SECTION,
      "/features": "Features",
      "/features/agenda": "Features",
      "/features/alerts": "Features",
    });
  });

  it("sections a site that lives under a locale by the segment after it", () => {
    const { pages, sections } = classifyPages([
      page({ path: "/en-us", depth: 0 }),
      page({ path: "/en-us/about", depth: 1, navLinked: true }),
      page({ path: "/en-us/docs", depth: 1, navLinked: true }),
      page({ path: "/en-us/docs/start", depth: 2 }),
      page({ path: "/de-de/docs", depth: 1 }),
    ]);
    expect(pages.map((p) => [p.path, p.section, p.rank])).toEqual([
      ["/en-us", ROOT_SECTION, 0],
      ["/en-us/about", ROOT_SECTION, 5],
      ["/en-us/docs", "Docs", 5],
      ["/en-us/docs/start", "Docs", 20],
      ["/de-de/docs", "De De", 10],
    ]);
    expect(sections.slice(0, 2)).toEqual([ROOT_SECTION, "Docs"]);
  });

  it("humanizes any other first segment", () => {
    expect(sectionOf(page({ path: "/getting-started/x", depth: 2 }))).toBe(
      "Getting Started",
    );
  });

  it("leads with the root section and then follows section weight", () => {
    const { sections } = classifyPages([
      page({ path: "/blog/late", depth: 3 }),
      page({ path: "/docs", depth: 1, navLinked: true }),
      page({ path: "/", depth: 0 }),
    ]);
    expect(sections).toEqual([ROOT_SECTION, "Docs", "Blog"]);
  });

  it("weighs a section by all its pages, not its best one", () => {
    const { sections } = classifyPages([
      page({ path: "/", depth: 0 }),
      page({ path: "/careers", depth: 1, navLinked: true }),
      page({ path: "/careers/jobs", depth: 2 }),
      ...["a", "b", "c", "d", "e", "f"].map((name) =>
        page({ path: `/products/${name}`, depth: 2 }),
      ),
    ]);
    expect(sections).toEqual([ROOT_SECTION, "Products", "Careers"]);
  });

  it("ignores pages left out of the file when weighing sections", () => {
    const { sections } = classifyPages([
      page({ path: "/", depth: 0 }),
      page({ path: "/tags/a", depth: 1, noindex: true }),
      page({ path: "/tags/b", depth: 1, noindex: true }),
      page({ path: "/tags/c", depth: 1, noindex: true }),
      page({ path: "/docs", depth: 2 }),
      page({ path: "/docs/x", depth: 2 }),
    ]);
    expect(sections).toEqual([ROOT_SECTION, "Docs", "Tags"]);
  });
});

describe("classifyPages: translations", () => {
  it("leaves out copies of the site under a locale prefix", () => {
    const { pages } = classifyPages([
      page({ path: "/", depth: 0 }),
      page({ path: "/pricing", depth: 1 }),
      page({ path: "/de-de/pricing", depth: 1 }),
      page({ path: "/pt-br/pricing", depth: 1 }),
    ]);
    expect(pages.map((p) => [p.path, p.eligible])).toEqual([
      ["/", true],
      ["/pricing", true],
      ["/de-de/pricing", false],
      ["/pt-br/pricing", false],
    ]);
  });

  it("leaves out pages in another language than the landing", () => {
    const { pages } = classifyPages([
      page({ path: "/", depth: 0, lang: "en-US" }),
      page({ path: "/about", depth: 1, lang: "en-GB" }),
      page({ path: "/es/about", depth: 1, lang: "es" }),
      page({ path: "/untagged", depth: 1 }),
    ]);
    expect(pages.map((p) => [p.path, p.eligible])).toEqual([
      ["/", true],
      ["/about", true],
      ["/es/about", false],
      ["/untagged", true],
    ]);
  });

  it("keeps the locale the landing itself lives under", () => {
    const { pages } = classifyPages([
      page({ path: "/en-us", depth: 0 }),
      page({ path: "/en-us/docs", depth: 1 }),
      page({ path: "/fr-fr/docs", depth: 1 }),
    ]);
    expect(pages.map((p) => [p.path, p.eligible])).toEqual([
      ["/en-us", true],
      ["/en-us/docs", true],
      ["/fr-fr/docs", false],
    ]);
  });

  it("keeps every language when the landing has no lang tag", () => {
    const { pages } = classifyPages([
      page({ path: "/", depth: 0 }),
      page({ path: "/about", depth: 1, lang: "fr" }),
    ]);
    expect(pages.every((p) => p.eligible)).toBe(true);
  });
});

describe("classifyPages: rank", () => {
  it("keeps rank 0 for the homepage alone", () => {
    const { pages } = classifyPages([
      page({ path: "/", depth: 0 }),
      page({
        path: "/hub",
        depth: 1,
        navLinked: true,
        inSitemap: true,
        inboundLinks: 50,
      }),
    ]);
    expect(pages.map((p) => p.rank)).toEqual([0, 1]);
  });

  it("prefers shallow, linked, sitemapped pages", () => {
    expect(rankOf(page({ path: "/a", depth: 1 }))).toBe(10);
    expect(rankOf(page({ path: "/a", depth: 1, inboundLinks: 3 }))).toBe(7);
    expect(rankOf(page({ path: "/a", depth: 1, navLinked: true }))).toBe(5);
    expect(rankOf(page({ path: "/a", depth: 1, inSitemap: true }))).toBe(8);
    expect(rankOf(page({ path: "/a/b", depth: 2 }))).toBe(20);
  });
});

describe("classifyPages: eligible", () => {
  it("includes a plain fetched page", () => {
    expect(eligibleOf(page({ path: "/a", depth: 1 }))).toBe(true);
  });

  it("excludes pages that were never fetched", () => {
    expect(eligibleOf(page({ path: "/a", depth: 1, status: "failed" }))).toBe(
      false,
    );
    expect(eligibleOf(page({ path: "/a", depth: 1, status: "skipped" }))).toBe(
      false,
    );
    expect(eligibleOf(page({ path: "/a", depth: 1, status: "queued" }))).toBe(
      false,
    );
  });

  it("excludes noindex and disallowed pages", () => {
    expect(eligibleOf(page({ path: "/a", depth: 1, noindex: true }))).toBe(
      false,
    );
    expect(eligibleOf(page({ path: "/a", depth: 1, allowed: false }))).toBe(
      false,
    );
  });

  it("excludes a page whose canonical names another path of the site", () => {
    expect(
      eligibleOf(
        page({
          path: "/a?x=1",
          depth: 1,
          canonicalUrl: "https://example.com/a",
        }),
      ),
    ).toBe(false);
    expect(
      eligibleOf(
        page({ path: "/a", depth: 1, canonicalUrl: "https://example.com/a" }),
      ),
    ).toBe(true);
    expect(
      eligibleOf(
        page({ path: "/a", depth: 1, canonicalUrl: "https://other.example/a" }),
      ),
    ).toBe(true);
  });

  it("reads the canonical through the same normalization as links", () => {
    expect(
      eligibleOf(
        page({ path: "/a", depth: 1, canonicalUrl: "https://example.com/a/" }),
      ),
    ).toBe(true);
    expect(
      eligibleOf(
        page({
          path: "/a",
          depth: 1,
          canonicalUrl: "https://www.example.com/a?utm_source=x",
        }),
      ),
    ).toBe(true);
  });

  it("keeps the shortest path of a set of duplicates", () => {
    const { pages } = classifyPages([
      page({ path: "/about-us-copy", depth: 1, contentHash: "h" }),
      page({ path: "/about", depth: 1, contentHash: "h" }),
      page({ path: "/other", depth: 1, contentHash: "g" }),
    ]);
    expect(pages.map((p) => [p.path, p.eligible])).toEqual([
      ["/about-us-copy", false],
      ["/about", true],
      ["/other", true],
    ]);
  });

  it("breaks a duplicate tie on the path itself", () => {
    const { pages } = classifyPages([
      page({ path: "/bbb", depth: 1, contentHash: "h" }),
      page({ path: "/aaa", depth: 1, contentHash: "h" }),
    ]);
    expect(pages.map((p) => p.eligible)).toEqual([false, true]);
  });
});

describe("humanize", () => {
  it("turns a slug into words and keeps acronyms upper case", () => {
    expect(humanize("getting-started")).toBe("Getting Started");
    expect(humanize("release_notes")).toBe("Release Notes");
    expect(humanize("api")).toBe("API");
    expect(humanize("")).toBe("");
  });

  it("survives a segment that is not valid percent escaping", () => {
    expect(humanize("100%")).toBe("100%");
    expect(humanize("caf%C3%A9")).toBe("Café");
  });
});

function page(overrides: Partial<ClassifiablePage> & { path: string }) {
  return {
    url: `https://example.com${overrides.path}`,
    depth: 0,
    status: "fetched" as const,
    noindex: false,
    allowed: true,
    inboundLinks: 0,
    navLinked: false,
    inSitemap: false,
    ...overrides,
  };
}

function classifyOne(item: ClassifiablePage) {
  const first = classifyPages([item]).pages[0];
  if (!first) throw new Error("nothing was classified");
  return first;
}

function sectionOf(item: ClassifiablePage) {
  return classifyOne(item).section;
}

function rankOf(item: ClassifiablePage) {
  return classifyOne(item).rank;
}

function eligibleOf(item: ClassifiablePage) {
  return classifyOne(item).eligible;
}
