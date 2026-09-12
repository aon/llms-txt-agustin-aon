import { describe, expect, it } from "vitest";
import { FakeSite } from "../test/fake-site.js";
import { collectSitemapUrls, parseSitemap, SITEMAP_LIMITS } from "./sitemap.js";

const ORIGIN = "https://example.com";
const XML = { "content-type": "application/xml" };

describe("parseSitemap", () => {
  it("reads locs out of a urlset", () => {
    expect(parseSitemap(urlset(["/a", "/b"]))).toEqual({
      isIndex: false,
      locs: [`${ORIGIN}/a`, `${ORIGIN}/b`],
    });
  });

  it("recognises a sitemap index", () => {
    expect(parseSitemap(index(["/one.xml"])).isIndex).toBe(true);
  });

  it("handles namespaced tags, CDATA and entities", () => {
    const xml = `<sm:urlset><sm:url><sm:loc><![CDATA[${ORIGIN}/a?x=1&amp;y=2]]></sm:loc></sm:url></sm:urlset>`;
    expect(parseSitemap(xml).locs).toEqual([`${ORIGIN}/a?x=1&y=2`]);
  });

  it("returns nothing for junk", () => {
    expect(parseSitemap("not xml at all")).toEqual({
      isIndex: false,
      locs: [],
    });
  });
});

describe("collectSitemapUrls", () => {
  it("expands an index and keeps only on-host URLs", async () => {
    const site = new FakeSite({
      [`${ORIGIN}/sitemap.xml`]: { body: index(["/one.xml"]), headers: XML },
      [`${ORIGIN}/one.xml`]: {
        body: urlsetOf([`${ORIGIN}/a`, "https://other.example/b"]),
        headers: XML,
      },
    });
    expect(await collect(site)).toEqual([`${ORIGIN}/a`]);
  });

  it("ignores sitemaps that are missing or fail", async () => {
    const site = new FakeSite({
      [`${ORIGIN}/sitemap.xml`]: { status: 500, body: "boom" },
    });
    expect(await collect(site)).toEqual([]);
  });

  it("stops after the file cap", async () => {
    const children = Array.from(
      { length: SITEMAP_LIMITS.maxFiles + 3 },
      (_, i) => `${ORIGIN}/s${i}.xml`,
    );
    const routes: Record<string, { body: string; headers: typeof XML }> = {
      [`${ORIGIN}/sitemap.xml`]: { body: indexOf(children), headers: XML },
    };
    for (const [i, child] of children.entries()) {
      routes[child] = { body: urlsetOf([`${ORIGIN}/p${i}`]), headers: XML };
    }
    const site = new FakeSite(routes);
    const urls = await collect(site);
    // The index itself is one of the files we are allowed to download.
    expect(urls).toHaveLength(SITEMAP_LIMITS.maxFiles - 1);
  });

  it("does not fetch the same sitemap twice", async () => {
    const site = new FakeSite({
      [`${ORIGIN}/sitemap.xml`]: {
        body: indexOf([`${ORIGIN}/one.xml`, `${ORIGIN}/one.xml`]),
        headers: XML,
      },
      [`${ORIGIN}/one.xml`]: { body: urlsetOf([`${ORIGIN}/a`]), headers: XML },
    });
    expect(await collect(site)).toEqual([`${ORIGIN}/a`]);
    expect(site.countOf(`${ORIGIN}/one.xml`)).toBe(1);
  });
});

function collect(site: FakeSite) {
  return collectSitemapUrls({
    seeds: [`${ORIGIN}/sitemap.xml`],
    host: "example.com",
    userAgent: "TestBot/1.0",
    fetch: site.fetch,
  });
}

function urlset(paths: readonly string[]) {
  return urlsetOf(paths.map((path) => `${ORIGIN}${path}`));
}

function urlsetOf(urls: readonly string[]) {
  const entries = urls.map((url) => `<url><loc>${url}</loc></url>`).join("");
  return `<?xml version="1.0"?><urlset>${entries}</urlset>`;
}

function index(paths: readonly string[]) {
  return indexOf(paths.map((path) => `${ORIGIN}${path}`));
}

function indexOf(urls: readonly string[]) {
  const entries = urls
    .map((url) => `<sitemap><loc>${url}</loc></sitemap>`)
    .join("");
  return `<?xml version="1.0"?><sitemapindex>${entries}</sitemapindex>`;
}
