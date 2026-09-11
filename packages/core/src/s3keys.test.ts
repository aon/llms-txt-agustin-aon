import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash.js";
import { crawlLlmsTxtKey, htmlKey, llmsTxtKey, snapshotKey } from "./s3keys.js";

describe("S3 keys", () => {
  it("places crawl artifacts under the site and crawl", () => {
    expect(snapshotKey("example.com", "01ABC")).toBe(
      "sites/example.com/crawls/01ABC/snapshot.json",
    );
    expect(crawlLlmsTxtKey("example.com", "01ABC")).toBe(
      "sites/example.com/crawls/01ABC/llms.txt",
    );
    expect(llmsTxtKey("example.com")).toBe("sites/example.com/llms.txt");
  });

  it("names raw html by the hash of the path", () => {
    expect(htmlKey("example.com", "01ABC", "/docs")).toBe(
      `sites/example.com/crawls/01ABC/html/${sha256Hex("/docs")}.html.gz`,
    );
  });
});
