import { describe, expect, it } from "vitest";
import { OPTIONAL_SECTION, RENDER_LIMITS, selectLinks } from "./select.js";
import { makeSnapshot } from "./test/snapshot.js";

describe("selectLinks", () => {
  it("keeps only the pages the crawl put in the file", () => {
    const snapshot = makeSnapshot({
      sections: [
        {
          name: "Example",
          pages: [{ path: "/a" }, { path: "/b", eligible: false }],
        },
      ],
    });
    expect(paths(selectLinks(snapshot).sections[0]?.links)).toEqual(["/a"]);
  });

  it("sends low-value paths to Optional whatever their rank", () => {
    const snapshot = makeSnapshot({
      sections: [
        {
          name: "Example",
          pages: [
            { path: "/a", rank: 9 },
            { path: "/privacy", rank: 1 },
            { path: "/blog/page/2", rank: 2 },
            { path: "/tags/release", rank: 3 },
            { path: "/account/billing", rank: 4 },
          ],
        },
      ],
    });
    const result = selectLinks(snapshot);
    expect(paths(result.sections[0]?.links)).toEqual(["/a"]);
    expect(paths(result.optional)).toEqual([
      "/privacy",
      "/blog/page/2",
      "/tags/release",
      "/account/billing",
    ]);
  });

  it("sends thin pages to Optional but never the homepage", () => {
    const snapshot = makeSnapshot({
      sections: [
        {
          name: "Example",
          pages: [
            { path: "/", rank: 0, wordCount: 5 },
            { path: "/thin", rank: 1, wordCount: 49 },
            { path: "/full", rank: 2, wordCount: 50 },
          ],
        },
      ],
    });
    const result = selectLinks(snapshot);
    expect(paths(result.sections[0]?.links)).toEqual(["/", "/full"]);
    expect(paths(result.optional)).toEqual(["/thin"]);
  });

  it("caps a section and pushes the overflow to Optional by rank", () => {
    const snapshot = makeSnapshot({
      sections: [{ name: "Example", pages: numbered(20) }],
    });
    const result = selectLinks(snapshot, {
      ...RENDER_LIMITS,
      maxLinksPerSection: 3,
    });
    expect(paths(result.sections[0]?.links)).toEqual(["/p0", "/p1", "/p2"]);
    expect(result.optional).toHaveLength(17);
    expect(result.optional[0]?.path).toBe("/p3");
  });

  it("fills the main cap section by section", () => {
    const snapshot = makeSnapshot({
      sections: [
        { name: "Example", pages: numbered(3) },
        { name: "Docs", pages: numbered(3, "/docs/d") },
      ],
    });
    const result = selectLinks(snapshot, { ...RENDER_LIMITS, maxMainLinks: 5 });
    expect(paths(result.sections[0]?.links)).toHaveLength(3);
    expect(paths(result.sections[1]?.links)).toEqual(["/docs/d0", "/docs/d1"]);
    expect(paths(result.optional)).toEqual(["/docs/d2"]);
  });

  it("folds a thin section into the first one and re-sorts by rank", () => {
    const snapshot = makeSnapshot({
      sections: [
        {
          name: "Example",
          pages: [
            { path: "/", rank: 0 },
            { path: "/about", rank: 4 },
          ],
        },
        { name: "Changelog", pages: [{ path: "/changelog", rank: 2 }] },
        {
          name: "Docs",
          pages: [
            { path: "/docs", rank: 1 },
            { path: "/docs/api", rank: 3 },
          ],
        },
      ],
    });
    const result = selectLinks(snapshot);
    expect(result.sections.map((section) => section.name)).toEqual([
      "Example",
      "Docs",
    ]);
    expect(paths(result.sections[0]?.links)).toEqual([
      "/",
      "/changelog",
      "/about",
    ]);
  });

  it("leaves a lone section alone", () => {
    const snapshot = makeSnapshot({
      sections: [{ name: "Example", pages: [{ path: "/" }] }],
    });
    expect(selectLinks(snapshot).sections).toHaveLength(1);
  });

  it("drops what does not fit the Optional cap", () => {
    const snapshot = makeSnapshot({
      sections: [
        { name: "Example", pages: numbered(6, "/tags/t") },
        { name: "Docs", pages: numbered(2, "/docs/d") },
      ],
    });
    const result = selectLinks(snapshot, {
      ...RENDER_LIMITS,
      maxOptionalLinks: 2,
    });
    expect(paths(result.optional)).toEqual(["/tags/t0", "/tags/t1"]);
  });

  it("orders Optional by rank across every section", () => {
    const snapshot = makeSnapshot({
      sections: [
        { name: "Example", pages: [{ path: "/privacy", rank: 9 }] },
        { name: "Docs", pages: [{ path: "/docs/search", rank: 2 }] },
      ],
    });
    expect(paths(selectLinks(snapshot).optional)).toEqual([
      "/docs/search",
      "/privacy",
    ]);
  });

  it("names the homepage Home whatever its title says", () => {
    const home = (title: string) =>
      selectLinks(
        makeSnapshot({
          siteTitle: "Example",
          brand: "Acme",
          sections: [
            {
              name: "Example",
              pages: [
                { path: "/", rank: 0, title },
                { path: "/a", rank: 1 },
              ],
            },
          ],
        }),
      ).sections[0]?.links[0]?.title;
    expect(home("Example")).toBe("Home");
    expect(home("Acme")).toBe("Home");
    expect(home("Acme — build things")).toBe("Home");
  });

  it("sends a section the crawl already called Optional to the list", () => {
    const snapshot = makeSnapshot({
      sections: [
        { name: "Example", pages: [{ path: "/" }, { path: "/a" }] },
        { name: OPTIONAL_SECTION, pages: [{ path: "/optional/x", rank: 1 }] },
      ],
    });
    const result = selectLinks(snapshot);
    expect(result.sections.map((section) => section.name)).toEqual(["Example"]);
    expect(paths(result.optional)).toEqual(["/optional/x"]);
  });

  it("makes a folded page earn its slot against the section it joined", () => {
    const snapshot = makeSnapshot({
      sections: [
        {
          name: "Example",
          pages: [
            { path: "/a", rank: 1 },
            { path: "/b", rank: 2 },
            { path: "/z", rank: 9 },
          ],
        },
        { name: "Lonely", pages: [{ path: "/lonely", rank: 3 }] },
      ],
    });
    const result = selectLinks(snapshot, {
      ...RENDER_LIMITS,
      maxLinksPerSection: 3,
    });
    expect(paths(result.sections[0]?.links)).toEqual(["/a", "/b", "/lonely"]);
    expect(paths(result.optional)).toEqual(["/z"]);
  });

  it("drops a description the whole site repeats", () => {
    const shared = "One description the site puts on every page.";
    const snapshot = makeSnapshot({
      sections: [
        {
          name: "Example",
          pages: [
            { path: "/a", description: shared },
            { path: "/b", description: shared },
            { path: "/c", description: shared },
            { path: "/d", description: "Its own words." },
          ],
        },
      ],
    });
    const links = selectLinks(snapshot).sections[0]?.links;
    expect(links?.slice(0, 3).map((link) => link.note)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(links?.[3]?.note).toBe("Its own words.");
  });

  it("drops the site description as a note, the blockquote already has it", () => {
    const snapshot = makeSnapshot({
      siteDescription: "What the site is.",
      sections: [
        {
          name: "Example",
          pages: [
            { path: "/", description: "What the site is." },
            { path: "/a", description: "Its own words." },
          ],
        },
      ],
    });
    const links = selectLinks(snapshot).sections[0]?.links;
    expect(links?.[0]?.note).toBeUndefined();
    expect(links?.[1]?.note).toBe("Its own words.");
  });

  it("strips a trailing segment that only repeats the section", () => {
    const snapshot = makeSnapshot({
      brand: "Acme",
      sections: [
        {
          name: "Guide",
          pages: [
            { path: "/guide/start", title: "Getting Started | Guide | Acme" },
            { path: "/guide", title: "Guide | Acme" },
          ],
        },
      ],
    });
    expect(
      selectLinks(snapshot).sections[0]?.links.map((link) => link.title),
    ).toEqual(["Getting Started", "Guide"]);
  });
});

function numbered(count: number, prefix = "/p") {
  return Array.from({ length: count }, (_, index) => ({
    path: `${prefix}${index}`,
    rank: index + 1,
  }));
}

function paths(links: ReadonlyArray<{ path: string }> | undefined) {
  return (links ?? []).map((link) => link.path);
}
