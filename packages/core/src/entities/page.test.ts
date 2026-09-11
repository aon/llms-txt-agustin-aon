import { describe, expect, it } from "vitest";
import { sha256Hex } from "../hash.js";
import { pageGsi1Keys, pageKeys } from "./page.js";

describe("page keys", () => {
  it("uses the path as the page sort key", () => {
    expect(pageKeys("example.com", "/docs?x=1")).toEqual({
      pk: "SITE#example.com",
      sk: "PAGE#/docs?x=1",
    });
  });

  it("hashes page paths that exceed 900 bytes", () => {
    const path = `/${"a".repeat(1000)}`;
    const { sk } = pageKeys("example.com", path);
    expect(sk).toBe(`PAGE#sha256:${sha256Hex(path)}`);
    expect(Buffer.byteLength(sk)).toBeLessThan(900);
  });

  it("counts bytes, not characters, for the hash rule", () => {
    const path = `/${"é".repeat(500)}`; // 1000 bytes, 500 chars
    expect(pageKeys("example.com", path).sk.startsWith("PAGE#sha256:")).toBe(
      true,
    );
  });

  it("builds GSI1 keys from crawl, status and path", () => {
    expect(pageGsi1Keys("01ABC", "queued", "/a")).toEqual({
      gsi1pk: "CRAWL#01ABC",
      gsi1sk: "queued#/a",
    });
  });
});
