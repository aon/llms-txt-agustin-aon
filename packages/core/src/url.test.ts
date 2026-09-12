import { describe, expect, it } from "vitest";
import {
  InvalidUrlError,
  newCrawlId,
  normalizeOrigin,
  pagePathFromUrl,
  sameSite,
} from "./url.js";

describe("normalizeOrigin", () => {
  it("defaults to https when no scheme is given", () => {
    expect(normalizeOrigin("example.com")).toEqual({
      host: "example.com",
      origin: "https://example.com",
    });
  });

  it("keeps an explicit http scheme", () => {
    expect(normalizeOrigin("http://example.com").origin).toBe(
      "http://example.com",
    );
  });

  it("lowercases the host", () => {
    expect(normalizeOrigin("HTTPS://Docs.Example.COM").host).toBe(
      "docs.example.com",
    );
  });

  it("strips default ports and keeps custom ones", () => {
    expect(normalizeOrigin("https://example.com:443").host).toBe("example.com");
    expect(normalizeOrigin("http://example.com:80").host).toBe("example.com");
    expect(normalizeOrigin("http://example.com:8080").host).toBe(
      "example.com:8080",
    );
  });

  it("drops path, query and fragment", () => {
    expect(
      normalizeOrigin("https://example.com/docs/intro?x=1#top").origin,
    ).toBe("https://example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeOrigin("  example.com  ").host).toBe("example.com");
  });

  it("rejects localhost and IP hosts", () => {
    expect(() => normalizeOrigin("http://localhost:3000")).toThrow(
      InvalidUrlError,
    );
    expect(() => normalizeOrigin("http://127.0.0.1")).toThrow(InvalidUrlError);
  });

  it("rejects non-http schemes", () => {
    expect(() => normalizeOrigin("ftp://example.com")).toThrow(InvalidUrlError);
    expect(() => normalizeOrigin("mailto:a@example.com")).toThrow(
      InvalidUrlError,
    );
  });

  it("rejects credentials in the URL", () => {
    expect(() => normalizeOrigin("https://user:pw@example.com")).toThrow(
      InvalidUrlError,
    );
  });

  it("rejects garbage and empty input", () => {
    expect(() => normalizeOrigin("")).toThrow(InvalidUrlError);
    expect(() => normalizeOrigin("   ")).toThrow(InvalidUrlError);
    expect(() => normalizeOrigin("not a url")).toThrow(InvalidUrlError);
    expect(() => normalizeOrigin("https://")).toThrow(InvalidUrlError);
    expect(() => normalizeOrigin("justaword")).toThrow(InvalidUrlError);
  });
});

describe("pagePathFromUrl", () => {
  it("returns path plus query without the fragment", () => {
    expect(pagePathFromUrl("https://example.com/docs/intro?x=1#top")).toBe(
      "/docs/intro?x=1",
    );
  });

  it("returns / for an empty path", () => {
    expect(pagePathFromUrl("https://example.com")).toBe("/");
    expect(pagePathFromUrl(new URL("https://example.com?q=1"))).toBe("/?q=1");
  });
});

describe("sameSite", () => {
  it("ignores case and a leading www", () => {
    expect(sameSite("www.example.com", "EXAMPLE.com")).toBe(true);
    expect(sameSite("example.com", "example.com")).toBe(true);
  });

  it("keeps other subdomains and hosts apart", () => {
    expect(sameSite("docs.example.com", "example.com")).toBe(false);
    expect(sameSite("example.com", "example.org")).toBe(false);
  });
});

describe("newCrawlId", () => {
  it("produces ids that sort by creation time", async () => {
    const a = newCrawlId();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const b = newCrawlId();
    expect(a.length).toBe(26);
    expect(b > a).toBe(true);
  });
});
