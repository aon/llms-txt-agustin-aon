import { MemoryStore, serializeCrawlJobMessage } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import { giveUp } from "./dead-letter.js";
import {
  CRAWL_ID,
  fakeClock,
  HOST,
  newCrawl,
  ORIGIN,
} from "./test/fixtures.js";

const MESSAGE = { siteId: HOST, crawlId: CRAWL_ID, reason: "user" as const };

describe("giveUp", () => {
  it("marks the crawl failed with its last error and releases the lease", async () => {
    const store = new MemoryStore();
    await store.putSiteIfAbsent({ host: HOST, origin: ORIGIN });
    await store.putCrawl(
      HOST,
      newCrawl(CRAWL_ID, { status: "running", error: "boom" }),
    );
    await store.acquireLease(HOST, CRAWL_ID, 1000);
    const clock = fakeClock();

    expect(
      await giveUp(serializeCrawlJobMessage(MESSAGE), {
        store,
        now: clock.now,
        log: () => {},
      }),
    ).toBe(true);

    expect(await store.getCrawl(HOST, CRAWL_ID)).toMatchObject({
      status: "failed",
      error: "boom",
      finishedAt: clock.now().toISOString(),
    });
    expect((await store.getSite(HOST))?.lease).toBeUndefined();
  });

  it("drops bodies that are not crawl jobs and crawls already finished", async () => {
    const store = new MemoryStore();
    await store.putSiteIfAbsent({ host: HOST, origin: ORIGIN });
    await store.putCrawl(HOST, newCrawl(CRAWL_ID, { status: "done" }));
    const deps = { store, now: fakeClock().now, log: () => {} };
    expect(await giveUp("not json", deps)).toBe(false);
    expect(await giveUp(serializeCrawlJobMessage(MESSAGE), deps)).toBe(false);
    expect((await store.getCrawl(HOST, CRAWL_ID))?.status).toBe("done");
  });
});
