import { describe, expect, it } from "vitest";
import { crawlKeys } from "./crawl.js";

describe("crawl keys", () => {
  it("lives under the site partition, sorted by crawl id", () => {
    expect(crawlKeys("example.com", "01ABC")).toEqual({
      pk: "SITE#example.com",
      sk: "CRAWL#01ABC",
    });
  });
});
