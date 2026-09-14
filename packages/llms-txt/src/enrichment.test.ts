import { describe, expect, it } from "vitest";
import {
  buildEnrichmentRequest,
  EMPTY_ENRICHMENT,
  sanitizeEnrichment,
} from "./enrichment.js";
import { loadFixture, makeSnapshot } from "./test/snapshot.js";
import {
  MAX_ABOUT_LENGTH,
  MAX_ABOUT_PARAGRAPHS,
  MAX_SUMMARY_LENGTH,
} from "./text.js";

describe("buildEnrichmentRequest", () => {
  it("sends the site, its sections and its in-file pages in order", () => {
    const request = buildEnrichmentRequest(loadFixture("docs-site"));
    expect(request.site).toEqual({
      host: "acme.dev",
      origin: "https://acme.dev",
      title: "Acme",
      brand: "Acme",
      description:
        "Acme builds small tools that do one job and then stay out of the way of the people using them.",
      landingText:
        "Acme Acme builds small tools that do one job and then stay out of the way of the people using them. Read the docs, follow the blog or check the changelog.",
    });
    expect(request.sections).toEqual(["Acme", "Docs", "Blog", "Changelog"]);
    expect(request.pages[0]?.path).toBe("/");
    expect(request.pages.map((page) => page.path)).not.toContain("/noindex");
  });

  it("sends the landing as the only page body", () => {
    const request = buildEnrichmentRequest(loadFixture("docs-site"));
    const keys = new Set(request.pages.flatMap((page) => Object.keys(page)));
    expect([...keys].sort()).toEqual([
      "description",
      "path",
      "section",
      "title",
      "url",
    ]);
  });

  it("stops at maxPages", () => {
    const request = buildEnrichmentRequest(loadFixture("docs-site"), {
      maxPages: 3,
    });
    expect(request.pages).toHaveLength(3);
    expect(request.sections).toHaveLength(4);
  });
});

describe("sanitizeEnrichment", () => {
  const request = buildEnrichmentRequest(
    makeSnapshot({
      sections: [
        { name: "Docs", pages: [{ path: "/docs" }] },
        { name: "Blog", pages: [{ path: "/blog" }] },
      ],
    }),
  );

  it("returns an empty enrichment for anything that is not one", () => {
    for (const raw of [null, "no", 42, { about: "x" }, { about: [1] }]) {
      expect(sanitizeEnrichment(raw, request)).toEqual(EMPTY_ENRICHMENT);
    }
  });

  it("keeps the fields a payload may leave out", () => {
    expect(sanitizeEnrichment({ summary: "Hi." }, request)).toEqual({
      summary: "Hi.",
      about: [],
      sectionLabels: {},
    });
  });

  it("keeps the about paragraphs as plain prose", () => {
    const clean = sanitizeEnrichment(
      {
        about: [
          "## Acme makes tools.",
          "   ",
          "> Quoted\nacross lines.",
          "- One too many.",
        ],
      },
      request,
    );
    expect(clean.about).toEqual(["Acme makes tools.", "Quoted across lines."]);
    expect(clean.about).toHaveLength(MAX_ABOUT_PARAGRAPHS);
  });

  it("caps the about text as a whole", () => {
    const clean = sanitizeEnrichment(
      { about: ["word ".repeat(200), "word ".repeat(200)] },
      request,
    );
    const total = clean.about.reduce((sum, p) => sum + p.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_ABOUT_LENGTH);
    expect(clean.about.at(-1)?.endsWith("…")).toBe(true);
  });

  it("drops a label for a section the request never mentioned", () => {
    const clean = sanitizeEnrichment(
      { sectionLabels: { Docs: "Documentation", Nope: "No" } },
      request,
    );
    expect(clean.sectionLabels).toEqual({ Docs: "Documentation" });
  });

  it("trims, drops empties and caps what is too long", () => {
    const clean = sanitizeEnrichment(
      {
        summary: `  ${"word ".repeat(100)}  `,
        sectionLabels: { Docs: "  Documentation  ", Blog: "  " },
      },
      request,
    );
    expect(clean.summary?.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
    expect(clean.sectionLabels).toEqual({ Docs: "Documentation" });
  });

  it("never throws", () => {
    expect(() =>
      sanitizeEnrichment(Object.create(null), request),
    ).not.toThrow();
  });
});
