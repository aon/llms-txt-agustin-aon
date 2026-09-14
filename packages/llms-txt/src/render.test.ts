import type { CrawlSnapshot } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import { parseLlmsTxt } from "./parse.js";
import { type RenderOptions, render } from "./render.js";
import {
  type Link,
  OPTIONAL_SECTION,
  RENDER_LIMITS,
  selectLinks,
} from "./select.js";
import { loadFixture, loadGolden, makeSnapshot } from "./test/snapshot.js";
import { cleanLine, MAX_LABEL_LENGTH, unescapeInline } from "./text.js";

const FIXTURES = ["docs-site", "small-site"];

describe("render: golden files", () => {
  for (const name of FIXTURES) {
    it(`writes ${name} exactly as recorded`, () => {
      expect(render(loadFixture(name))).toBe(loadGolden(name));
    });

    it(`round-trips ${name} through the parser`, () => {
      expectRoundTrip(loadFixture(name));
    });

    it(`round-trips ${name} with an enrichment`, () => {
      const snapshot = loadFixture(name);
      expectRoundTrip(snapshot, { enrichment: enrichmentFor(snapshot) });
    });
  }
});

describe("render: the shape of the file", () => {
  it("starts with one H1 and writes no other heading level", () => {
    const text = render(loadFixture("docs-site"));
    const headings = text.split("\n").filter((line) => line.startsWith("#"));
    expect(headings.filter((line) => /^#\s/.test(line))).toHaveLength(1);
    expect(headings[0]).toBe("# Acme");
    expect(headings.filter((line) => /^#{3,}/.test(line))).toEqual([]);
  });

  it("ends with a single newline and never a trailing space", () => {
    const text = render(loadFixture("docs-site"));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    expect(text).not.toMatch(/[ \t]\n/);
    expect(text).not.toContain("\r");
  });

  it("omits the blockquote when the site has no description", () => {
    expect(render(loadFixture("small-site"))).not.toContain("\n>");
  });

  it("falls back to the host when the site has no usable title", () => {
    const snapshot = makeSnapshot({
      siteTitle: "   ",
      sections: [{ name: "Example", pages: [{ path: "/" }] }],
    });
    expect(render(snapshot).startsWith("# example.com\n")).toBe(true);
  });
});

describe("render: escaping", () => {
  it("round-trips a title that looks like a markdown link", () => {
    expectRoundTrip(
      makeSnapshot({
        sections: [
          {
            name: "Docs",
            pages: [
              { path: "/arrays", title: "Arrays [0](1)" },
              { path: "/sets", title: "Sets" },
            ],
          },
        ],
      }),
    );
  });
});

describe("render: determinism", () => {
  it("writes the same bytes twice", () => {
    const snapshot = loadFixture("docs-site");
    expect(render(snapshot)).toBe(render(snapshot));
  });

  it("ignores the order of snapshot.pages", () => {
    const snapshot = loadFixture("docs-site");
    const shuffled: CrawlSnapshot = {
      ...snapshot,
      pages: [...snapshot.pages].reverse(),
    };
    expect(render(shuffled)).toBe(render(snapshot));
  });
});

describe("render: enrichment", () => {
  const snapshot = makeSnapshot({
    siteTitle: "Example",
    siteDescription: "From the crawl.",
    sections: [
      {
        name: "Docs",
        pages: [
          { path: "/docs", description: "From the page." },
          { path: "/docs/api" },
        ],
      },
    ],
  });

  it("prefers the enriched summary and label, and keeps the page's note", () => {
    const text = render(snapshot, {
      enrichment: {
        summary: "From the model.",
        about: [],
        sectionLabels: { Docs: "Documentation" },
      },
    });
    expect(text).toContain("> From the model.");
    expect(text).toContain("## Documentation");
    expect(text).toContain("](https://example.com/docs): From the page.");
    expect(text).toContain("](https://example.com/docs/api)\n");
  });

  it("writes the about paragraphs between the summary and the sections", () => {
    const text = render(snapshot, {
      enrichment: {
        about: ["Who it is for.", "How to read it."],
        sectionLabels: {},
      },
    });
    expect(text).toContain(
      "> From the crawl.\n\nWho it is for.\n\nHow to read it.\n\n## Docs",
    );
    expect(parseLlmsTxt(text).about).toEqual([
      "Who it is for.",
      "How to read it.",
    ]);
  });

  it("falls back to the crawl when the enrichment is empty", () => {
    const text = render(snapshot, {
      enrichment: { about: [], sectionLabels: {} },
    });
    expect(text).toContain("> From the crawl.");
    expect(text).toContain("## Docs");
  });

  it("never lets a label take over the Optional section", () => {
    const text = render(snapshot, {
      enrichment: { about: [], sectionLabels: { Docs: "Optional" } },
    });
    expect(text).toContain("## Docs");
  });

  it("keeps the crawled name when two sections ask for one label", () => {
    const two = makeSnapshot({
      sections: [
        { name: "Docs", pages: [{ path: "/docs" }, { path: "/docs/api" }] },
        { name: "Blog", pages: [{ path: "/blog" }, { path: "/blog/one" }] },
      ],
    });
    const headings = render(two, {
      enrichment: {
        about: [],
        sectionLabels: { Docs: "Reference", Blog: "Reference" },
      },
    })
      .split("\n")
      .filter((line) => line.startsWith("## "));
    expect(headings).toEqual(["## Reference", "## Blog"]);
  });
});

/** The parsed file must say exactly what the selection decided, link by link. */
function expectRoundTrip(snapshot: CrawlSnapshot, options: RenderOptions = {}) {
  const text = render(snapshot, options);
  const parsed = parseLlmsTxt(text);
  expect(parsed.sections).toEqual(oracle(snapshot, options));

  const allowed = new Set(
    snapshot.pages.filter((page) => page.inFile).map((page) => page.url),
  );
  for (const section of parsed.sections) {
    for (const link of section.links) expect(allowed.has(link.url)).toBe(true);
  }
  expect(parsed.title).toBe(snapshot.siteTitle);
  expect(parsed.summary).toBe(
    options.enrichment?.summary ?? snapshot.siteDescription,
  );
  expect(parsed.about).toEqual(options.enrichment?.about ?? []);
  if (parsed.sections.some((section) => section.name === OPTIONAL_SECTION)) {
    expect(parsed.sections.at(-1)?.name).toBe(OPTIONAL_SECTION);
  }
}

function oracle(snapshot: CrawlSnapshot, options: RenderOptions) {
  const limits = { ...RENDER_LIMITS, ...options.limits };
  const selection = selectLinks(snapshot, limits);
  const sections = selection.sections.map((section) => ({
    name: label(
      options.enrichment?.sectionLabels[section.name] ?? section.name,
    ),
    links: section.links.map(bare),
  }));
  if (selection.optional.length > 0) {
    sections.push({
      name: OPTIONAL_SECTION,
      links: selection.optional.map(bare),
    });
  }
  return sections;
}

function bare(link: Link) {
  const parsed: Omit<Link, "path"> = {
    title: unescapeInline(link.title),
    url: link.url,
  };
  if (link.note) parsed.note = unescapeInline(link.note);
  return parsed;
}

function label(name: string) {
  return unescapeInline(cleanLine(name, MAX_LABEL_LENGTH));
}

function enrichmentFor(snapshot: CrawlSnapshot) {
  return {
    summary: "What the model made of this site, in one line.",
    about: ["Who the site is for.", "Start with the docs, then the blog."],
    sectionLabels: Object.fromEntries(
      snapshot.sections.map((section) => [
        section.name,
        `All about ${section.name}`,
      ]),
    ),
  };
}
