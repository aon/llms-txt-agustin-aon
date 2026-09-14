import { describe, expect, it } from "vitest";
import { localeSegmentOf, normalizeLink } from "./normalize.js";

const BASE = "https://example.com/docs/intro";
const HOST = "example.com";

function normalize(href: string, base = BASE) {
  return normalizeLink(href, base, HOST);
}

describe("normalizeLink", () => {
  it("resolves relative links against the page", () => {
    expect(normalize("api")).toBe("https://example.com/docs/api");
    expect(normalize("../about")).toBe("https://example.com/about");
    expect(normalize("/")).toBe("https://example.com/");
  });

  it("drops the fragment", () => {
    expect(normalize("/a#section")).toBe("https://example.com/a");
    expect(normalize("#section")).toBeNull();
  });

  it("strips tracking parameters and sorts the rest", () => {
    expect(normalize("/a?utm_source=x&b=2&a=1&gclid=z&ref=y")).toBe(
      "https://example.com/a?a=1&b=2",
    );
    expect(normalize("/blog/hello?utm_source=x")).toBe(
      "https://example.com/blog/hello",
    );
  });

  it("removes a trailing slash except on the root", () => {
    expect(normalize("/docs/")).toBe("https://example.com/docs");
    expect(normalize("https://example.com")).toBe("https://example.com/");
  });

  it("rejects other hosts, schemes and protocols", () => {
    expect(normalize("https://other.example/x")).toBeNull();
    expect(normalize("mailto:hi@example.com")).toBeNull();
    expect(normalize("tel:+123")).toBeNull();
    expect(normalize("javascript:void(0)")).toBeNull();
    expect(normalize("ftp://example.com/x")).toBeNull();
  });

  it("compares hosts case-insensitively", () => {
    expect(normalize("https://EXAMPLE.com/a")).toBe("https://example.com/a");
  });

  it("treats www and the bare host as one site", () => {
    expect(normalize("https://www.example.com/a")).toBe(
      "https://www.example.com/a",
    );
    expect(normalize("https://docs.example.com/a")).toBeNull();
  });

  it("rejects files that are not pages", () => {
    for (const href of [
      "/big.PDF",
      "/a.png",
      "/app.js",
      "/feed.xml",
      "/x.zip",
    ]) {
      expect(normalize(href)).toBeNull();
    }
  });

  it("keeps paths whose last segment merely contains a dot", () => {
    expect(normalize("/v1.2/notes")).toBe("https://example.com/v1.2/notes");
    expect(normalize("/team/j.doe")).toBe("https://example.com/team/j.doe");
  });

  it("rejects empty and unparsable hrefs", () => {
    expect(normalize("")).toBeNull();
    expect(normalize("   ")).toBeNull();
    expect(normalize("http://")).toBeNull();
  });
});

describe("localeSegmentOf", () => {
  it("recognizes a language and region or script prefix", () => {
    expect(localeSegmentOf("/de-de/pricing")).toBe("de-de");
    expect(localeSegmentOf("/pt-br")).toBe("pt-br");
    expect(localeSegmentOf("/EN-US/docs?x=1")).toBe("en-us");
    expect(localeSegmentOf("/zh-hans/docs")).toBe("zh-hans");
    expect(localeSegmentOf("/fil-ph")).toBe("fil-ph");
  });

  it("leaves hyphenated words alone", () => {
    for (const path of [
      "/how-to/x",
      "/use-case/x",
      "/our-team",
      "/web-apps",
      "/sign-up",
      "/no-go",
      "/en-xx",
      "/en-us-old/x",
      "/en",
      "/",
    ]) {
      expect(localeSegmentOf(path)).toBeUndefined();
    }
  });
});
