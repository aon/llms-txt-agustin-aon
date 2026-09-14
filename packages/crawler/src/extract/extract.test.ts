import { sha256Hex } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import { extract } from "./extract.js";

const URL_ = "https://example.com/docs/intro";

describe("extract", () => {
  it("reads the document title first", () => {
    expect(extract(FULL, { url: URL_ }).title).toBe("Intro");
  });

  it("falls back to og:title and then the first h1", () => {
    expect(
      extract(
        '<html><head><meta property="og:title" content="Social"></head><body><h1>Heading</h1></body></html>',
        { url: URL_ },
      ).title,
    ).toBe("Social");
    expect(
      extract("<html><body><h1>Heading</h1><h1>Later</h1></body></html>", {
        url: URL_,
      }).title,
    ).toBe("Heading");
  });

  it("reads the meta description", () => {
    expect(extract(FULL, { url: URL_ }).description).toBe("What this is.");
  });

  it("falls back to og:description and then a long enough paragraph", () => {
    expect(
      extract(
        '<html><head><meta property="og:description" content="Social copy."></head><body><p>x</p></body></html>',
        { url: URL_ },
      ).description,
    ).toBe("Social copy.");
    expect(
      extract(
        "<html><body><p>Too short.</p><p>A paragraph long enough to say something about the page.</p></body></html>",
        { url: URL_ },
      ).description,
    ).toBe("A paragraph long enough to say something about the page.");
  });

  it("caps the description at 300 characters", () => {
    const long = `x${"y".repeat(400)}`;
    const description = extract(
      `<html><head><meta name="description" content="${long}"></head><body></body></html>`,
      { url: URL_ },
    ).description;
    expect(description).toHaveLength(300);
    expect(description?.endsWith("…")).toBe(true);
  });

  it("reads the language and resolves the canonical", () => {
    const page = extract(FULL, { url: URL_ });
    expect(page.lang).toBe("en");
    expect(page.canonicalUrl).toBe("https://example.com/docs/intro");
  });

  it("spots noindex in the meta tag and in the header", () => {
    expect(extract(FULL, { url: URL_ }).noindex).toBe(false);
    expect(
      extract('<html><head><meta name="robots" content="noindex, follow">', {
        url: URL_,
      }).noindex,
    ).toBe(true);
    expect(
      extract("<html></html>", { url: URL_, xRobotsTag: "noarchive, noindex" })
        .noindex,
    ).toBe(true);
  });

  it("resolves links and flags the ones in the site chrome", () => {
    expect(extract(FULL, { url: URL_ }).links).toEqual([
      { url: "https://example.com/", nav: true },
      { url: "https://example.com/docs/api", nav: false },
      { url: "https://other.example/x", nav: false },
      { url: "https://example.com/legal", nav: true },
    ]);
  });

  it("drops non-navigable hrefs", () => {
    const links = extract(
      '<html><body><a href="mailto:a@b.c">m</a><a href="tel:+1">t</a><a href="javascript:void(0)">j</a><a href="#top">f</a></body></html>',
      { url: URL_ },
    ).links;
    expect(links).toEqual([]);
  });

  it("strips chrome and script from the main text", () => {
    const page = extract(FULL, { url: URL_ });
    expect(page.mainText).toBe(
      "Intro The body of the page. API Elsewhere Also this.",
    );
    expect(page.wordCount).toBe(10);
    expect(page.contentHash).toBe(sha256Hex(page.mainText));
  });

  it("gives identical documents the same hash", () => {
    const a = extract(FULL, { url: URL_ });
    const b = extract(FULL.replace("</body>", "  \n</body>"), { url: URL_ });
    expect(b.contentHash).toBe(a.contentHash);
  });

  it("survives an empty document", () => {
    const page = extract("", { url: URL_ });
    expect(page).toMatchObject({ mainText: "", wordCount: 0, links: [] });
    expect(page.title).toBeUndefined();
  });

  it("reads the main text without the chrome", () => {
    expect(extract(FULL, { url: URL_ }).mainText).toBe(
      "Intro The body of the page. API Elsewhere Also this.",
    );
  });
});

const FULL = `<!doctype html><html lang="en"><head>
<title>Intro</title>
<meta name="description" content="What this is.">
<link rel="canonical" href="/docs/intro">
</head><body>
<header><a href="/">Home</a></header>
<main><h1>Intro</h1><p>The body of the page.</p>
<a href="api">API</a><a href="https://other.example/x">Elsewhere</a>
<script>console.log("noise");</script>
<aside>Sidebar noise.</aside>
<p>Also this.</p></main>
<footer><a href="/legal">Legal</a></footer>
</body></html>`;
