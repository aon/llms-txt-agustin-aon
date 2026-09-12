import { describe, expect, it } from "vitest";
import { crawlDelaySeconds, isAllowed, parseRobotsTxt } from "./robots.js";

const UA = "TestBot/1.0 (+https://example.test/bot)";

describe("parseRobotsTxt", () => {
  it("prefers our own group over the wildcard one", () => {
    const robots = parseRobotsTxt(MIXED, UA);
    expect(robots.rules).toEqual([
      { path: "/private", allow: false },
      { path: "/private/public", allow: true },
    ]);
    expect(robots.crawlDelay).toBe(0.5);
  });

  it("falls back to the wildcard group", () => {
    const robots = parseRobotsTxt(MIXED, "OtherBot/2.0");
    expect(robots.rules).toEqual([{ path: "/", allow: false }]);
    expect(robots.crawlDelay).toBe(5);
  });

  it("collects sitemaps from anywhere in the file, without duplicates", () => {
    expect(parseRobotsTxt(MIXED, UA).sitemaps).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/news.xml",
    ]);
  });

  it("shares consecutive user-agent lines between groups", () => {
    const robots = parseRobotsTxt(
      "User-agent: testbot\nUser-agent: otherbot\nDisallow: /x\n",
      UA,
    );
    expect(robots.rules).toEqual([{ path: "/x", allow: false }]);
  });

  it("starts a new group after a rule, not after every agent line", () => {
    const robots = parseRobotsTxt(
      "User-agent: *\nDisallow: /a\nUser-agent: testbot\nDisallow: /b\n",
      UA,
    );
    expect(robots.rules).toEqual([{ path: "/b", allow: false }]);
  });

  it("ignores comments, blank lines and an empty Disallow", () => {
    const robots = parseRobotsTxt(
      "# hi\n\nUser-agent: *\nDisallow:   # everything is fine\nAllow: /x\n",
      UA,
    );
    expect(robots.rules).toEqual([{ path: "/x", allow: true }]);
    expect(robots.crawlDelay).toBeUndefined();
  });

  it("returns nothing usable for an empty file", () => {
    expect(parseRobotsTxt("", UA)).toEqual({ rules: [], sitemaps: [] });
  });
});

describe("isAllowed", () => {
  const robots = { ...parseRobotsTxt(MIXED, UA), fetchedAt: NOW };

  it("allows everything when there are no rules", () => {
    expect(isAllowed(undefined, "/anything")).toBe(true);
    expect(isAllowed({ rules: [], sitemaps: [], fetchedAt: NOW }, "/x")).toBe(
      true,
    );
  });

  it("matches on prefix", () => {
    expect(isAllowed(robots, "/private")).toBe(false);
    expect(isAllowed(robots, "/private/secret")).toBe(false);
    expect(isAllowed(robots, "/public")).toBe(true);
  });

  it("lets the longest matching rule win", () => {
    expect(isAllowed(robots, "/private/public/page")).toBe(true);
  });

  it("lets Allow win a tie", () => {
    const tied = {
      rules: [
        { path: "/x", allow: false },
        { path: "/x", allow: true },
      ],
      sitemaps: [],
      fetchedAt: NOW,
    };
    expect(isAllowed(tied, "/x")).toBe(true);
  });

  it("honours the * and $ wildcards", () => {
    const wildcards = {
      rules: [
        { path: "/*.json$", allow: false },
        { path: "/a/*/b", allow: false },
      ],
      sitemaps: [],
      fetchedAt: NOW,
    };
    expect(isAllowed(wildcards, "/data/file.json")).toBe(false);
    expect(isAllowed(wildcards, "/data/file.json.html")).toBe(true);
    expect(isAllowed(wildcards, "/a/one/b/c")).toBe(false);
    expect(isAllowed(wildcards, "/a/b")).toBe(true);
  });
});

describe("crawlDelaySeconds", () => {
  it("reports the delay only when the file asks for a positive one", () => {
    expect(crawlDelaySeconds(undefined)).toBe(0);
    expect(crawlDelaySeconds({ rules: [], sitemaps: [], fetchedAt: NOW })).toBe(
      0,
    );
    expect(
      crawlDelaySeconds({
        rules: [],
        sitemaps: [],
        crawlDelay: 2,
        fetchedAt: NOW,
      }),
    ).toBe(2);
  });
});

const NOW = "2026-09-12T00:00:00.000Z";

const MIXED = `User-agent: *
Disallow: /
Crawl-delay: 5
Sitemap: https://example.com/sitemap.xml

User-agent: testbot
Disallow: /private
Allow: /private/public
Crawl-delay: 0.5

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/news.xml
`;
