import { describe, expect, it } from "vitest";
import { enqueueCrawl, isCrawlFinished } from "./enqueue-crawl.js";
import { MemoryQueue } from "./memory/queue.js";
import { MemoryStore } from "./memory/store.js";

const HOST = "example.com";
const NOW = new Date("2026-09-14T10:00:00.000Z");

describe("enqueueCrawl", () => {
  it("writes a queued crawl, points the site at it and sends the message", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    await store.putSiteIfAbsent({ host: HOST, origin: `https://${HOST}` });

    const crawl = await enqueueCrawl(
      { store, queue },
      { host: HOST, reason: "user", now: NOW },
    );

    expect(crawl).toMatchObject({
      status: "queued",
      reason: "user",
      phase: "discovery",
      invocations: 0,
      createdAt: NOW.toISOString(),
    });
    expect(await store.getCrawl(HOST, crawl.crawlId)).toEqual(crawl);
    expect((await store.getSite(HOST))?.latestCrawlId).toBe(crawl.crawlId);
    expect(queue.messages).toEqual([
      {
        message: { siteId: HOST, crawlId: crawl.crawlId, reason: "user" },
        delaySeconds: 0,
      },
    ]);
  });

  it("refuses a site that does not exist", async () => {
    const store = new MemoryStore();
    await expect(
      enqueueCrawl(
        { store, queue: new MemoryQueue() },
        { host: HOST, reason: "user", now: NOW },
      ),
    ).rejects.toThrow();
  });
});

describe("isCrawlFinished", () => {
  it("is true only for done and failed", () => {
    expect(isCrawlFinished({ status: "done" })).toBe(true);
    expect(isCrawlFinished({ status: "failed" })).toBe(true);
    expect(isCrawlFinished({ status: "queued" })).toBe(false);
    expect(isCrawlFinished({ status: "running" })).toBe(false);
  });
});
