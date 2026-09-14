import { crawlLlmsTxtKey, llmsTxtKey, MemoryFileStore } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import { runCrawlJob } from "./job.js";
import { CRAWL_ID, HOST, harness, newCrawl, ORIGIN } from "./test/fixtures.js";

const MESSAGE = { siteId: HOST, crawlId: CRAWL_ID, reason: "user" as const };

describe("runCrawlJob", () => {
  it("crawls, writes the file twice and finishes the crawl", async () => {
    const h = await harness({ scheduleHours: 24 });
    expect(await runCrawlJob(MESSAGE, h.deps)).toBe("finished");

    const current = await h.files.getObject(llmsTxtKey(HOST));
    const versioned = await h.files.getObject(crawlLlmsTxtKey(HOST, CRAWL_ID));
    expect(current).toEqual(versioned);
    expect(new TextDecoder().decode(current ?? undefined)).toContain("# Acme");

    expect(await h.store.getCrawl(HOST, CRAWL_ID)).toMatchObject({
      status: "done",
      llmsTxtKey: llmsTxtKey(HOST),
      finishedAt: h.clock.now().toISOString(),
    });
    const site = await h.store.getSite(HOST);
    expect(site?.lastDoneCrawlId).toBe(CRAWL_ID);
    expect(site?.lease).toBeUndefined();
    expect(site?.nextRunAt).toBe(
      new Date(h.clock.now().getTime() + 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(h.queue.messages).toEqual([]);
  });

  it("leaves the schedule empty when monitoring is off", async () => {
    const h = await harness();
    await runCrawlJob(MESSAGE, h.deps);
    expect((await h.store.getSite(HOST))?.nextRunAt).toBeUndefined();
  });

  it("defers when another crawl holds the site lease", async () => {
    const h = await harness();
    await h.store.acquireLease(HOST, "01OTHER", 1000);
    expect(await runCrawlJob(MESSAGE, h.deps)).toBe("deferred");
    expect(h.queue.messages).toEqual([{ message: MESSAGE, delaySeconds: 60 }]);
    expect(h.requests).toEqual([]);
  });

  it("enqueues a continuation when the budget runs out", async () => {
    const h = await harness({ budgetMs: 0 });
    expect(await runCrawlJob(MESSAGE, h.deps)).toBe("continued");
    expect(h.queue.messages).toEqual([
      { message: { ...MESSAGE, continuation: true }, delaySeconds: 0 },
    ]);
    expect((await h.store.getCrawl(HOST, CRAWL_ID))?.status).toBe("running");
    expect((await h.store.getSite(HOST))?.lease?.crawlId).toBe(CRAWL_ID);
  });

  it("drops a redelivery of a finished crawl", async () => {
    const h = await harness();
    await h.store.putCrawl(HOST, newCrawl(CRAWL_ID, { status: "done" }));
    expect(await runCrawlJob(MESSAGE, h.deps)).toBe("skipped");
    expect(h.requests).toEqual([]);
  });

  it("drops a job for a crawl that does not exist", async () => {
    const h = await harness();
    expect(await runCrawlJob({ ...MESSAGE, crawlId: "01NOPE" }, h.deps)).toBe(
      "skipped",
    );
  });

  it("fails the crawl and frees the site when the host keeps rate limiting", async () => {
    const h = await harness({
      routes: {
        [`${ORIGIN}/robots.txt`]: { status: 404 },
        [`${ORIGIN}/sitemap.xml`]: { status: 404 },
        [`${ORIGIN}/`]: { status: 429, headers: { "retry-after": "1" } },
      },
    });
    expect(await runCrawlJob(MESSAGE, h.deps)).toBe("rate-limited");
    expect(await h.store.getCrawl(HOST, CRAWL_ID)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("rate limited"),
    });
    expect((await h.store.getSite(HOST))?.lease).toBeUndefined();
    expect(h.queue.messages).toEqual([]);
  });

  it("records an unexpected error on the crawl and rethrows for a retry", async () => {
    class BrokenFiles extends MemoryFileStore {
      override async putHtmlGz(): Promise<void> {
        throw new Error("S3 is down");
      }
    }
    const h = await harness({ files: new BrokenFiles() });
    await expect(runCrawlJob(MESSAGE, h.deps)).rejects.toThrow("S3 is down");
    expect(await h.store.getCrawl(HOST, CRAWL_ID)).toMatchObject({
      status: "running",
      error: "S3 is down",
    });
    expect((await h.store.getSite(HOST))?.lease?.crawlId).toBe(CRAWL_ID);
  });
});
