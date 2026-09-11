import { describe, expect, it } from "vitest";
import {
  InvalidMessageError,
  parseCrawlJobMessage,
  serializeCrawlJobMessage,
} from "./message.js";

describe("crawl job message", () => {
  it("round-trips a user job", () => {
    const body = serializeCrawlJobMessage({
      siteId: "example.com",
      crawlId: "01ABC",
      reason: "user",
    });
    expect(parseCrawlJobMessage(body)).toEqual({
      siteId: "example.com",
      crawlId: "01ABC",
      reason: "user",
    });
  });

  it("keeps the continuation flag", () => {
    const body = serializeCrawlJobMessage({
      siteId: "example.com",
      crawlId: "01ABC",
      reason: "scheduled",
      continuation: true,
    });
    expect(parseCrawlJobMessage(body).continuation).toBe(true);
  });

  it("rejects bodies that are not JSON", () => {
    expect(() => parseCrawlJobMessage("not json")).toThrow(InvalidMessageError);
  });

  it("rejects bodies missing fields or with a bad reason", () => {
    expect(() => parseCrawlJobMessage(JSON.stringify({ siteId: "x" }))).toThrow(
      InvalidMessageError,
    );
    expect(() =>
      parseCrawlJobMessage(
        JSON.stringify({ siteId: "x", crawlId: "y", reason: "cron" }),
      ),
    ).toThrow(InvalidMessageError);
  });

  it("rejects continuation: false", () => {
    expect(() =>
      parseCrawlJobMessage(
        JSON.stringify({
          siteId: "x",
          crawlId: "y",
          reason: "user",
          continuation: false,
        }),
      ),
    ).toThrow(InvalidMessageError);
  });
});
