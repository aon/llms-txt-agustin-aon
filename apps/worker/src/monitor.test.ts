import { MemoryQueue, MemoryStore } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import { sweep } from "./monitor.js";
import { fakeClock } from "./test/fixtures.js";

describe("sweep", () => {
  it("enqueues a scheduled crawl for every due site and pushes its schedule", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const clock = fakeClock();
    for (const [host, at, hours] of [
      ["a.com", "2026-09-14T09:00:00.000Z", 24],
      ["b.com", "2026-09-14T10:00:00.000Z", 6],
      ["later.com", "2026-09-14T11:00:00.000Z", 24],
    ] as const) {
      await store.putSiteIfAbsent({
        host,
        origin: `https://${host}`,
        config: {
          pageCap: 10,
          maxDepth: 2,
          concurrency: 1,
          scheduleHours: hours,
        },
      });
      await store.setSchedule(host, at);
    }

    expect(await sweep({ store, queue, now: clock.now, log: () => {} })).toBe(
      2,
    );

    expect(queue.messages.map((m) => m.message.siteId)).toEqual([
      "a.com",
      "b.com",
    ]);
    expect(queue.messages.every((m) => m.message.reason === "scheduled")).toBe(
      true,
    );
    const a = await store.getSite("a.com");
    expect(a?.nextRunAt).toBe("2026-09-15T10:00:00.000Z");
    expect(a?.latestCrawlId).toBe(queue.messages[0]?.message.crawlId);
    expect(await store.getCrawl("a.com", a?.latestCrawlId ?? "")).toMatchObject(
      {
        status: "queued",
        reason: "scheduled",
      },
    );
    expect((await store.getSite("b.com"))?.nextRunAt).toBe(
      "2026-09-14T16:00:00.000Z",
    );
    expect((await store.getSite("later.com"))?.nextRunAt).toBe(
      "2026-09-14T11:00:00.000Z",
    );
  });
});
