import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../defaults.js";
import type { Crawl } from "../entities/crawl.js";
import type { Store } from "../store/index.js";

const HOST = "example.com";

/** The behaviour every Store implementation must share. `factory` returns an empty store. */
export function describeStoreContract(factory: () => Promise<Store>) {
  describe("store contract: sites", () => {
    let store: Store;
    beforeEach(async () => {
      store = await factory();
      await store.putSiteIfAbsent({ host: HOST, origin: `https://${HOST}` });
    });

    it("putSiteIfAbsent is idempotent and applies defaults", async () => {
      const first = await store.getSite(HOST);
      expect(first?.config).toEqual(DEFAULT_SITE_CONFIG);
      const again = await store.putSiteIfAbsent({
        host: HOST,
        origin: "https://other",
        config: { pageCap: 1, maxDepth: 1, concurrency: 1 },
      });
      expect(again.origin).toBe(`https://${HOST}`);
      expect(again.config).toEqual(DEFAULT_SITE_CONFIG);
    });

    it("returns copies, not references", async () => {
      const site = await store.getSite(HOST);
      if (!site) throw new Error("missing");
      site.config.pageCap = 1;
      expect((await store.getSite(HOST))?.config.pageCap).toBe(
        DEFAULT_SITE_CONFIG.pageCap,
      );
    });

    it("acquires a lease only when free or expired", async () => {
      expect(await store.acquireLease(HOST, "c1", 100, 1000)).toBe(true);
      expect(await store.acquireLease(HOST, "c2", 100, 1050)).toBe(false);
      expect((await store.getSite(HOST))?.lease).toEqual({
        crawlId: "c1",
        expiresAt: 1100,
      });
      expect(await store.acquireLease(HOST, "c2", 100, 1101)).toBe(true);
      expect((await store.getSite(HOST))?.lease?.crawlId).toBe("c2");
    });

    it("lets the holding crawl re-acquire and refresh its lease", async () => {
      expect(await store.acquireLease(HOST, "c1", 100, 1000)).toBe(true);
      expect(await store.acquireLease(HOST, "c1", 100, 1050)).toBe(true);
      expect((await store.getSite(HOST))?.lease).toEqual({
        crawlId: "c1",
        expiresAt: 1150,
      });
      expect(await store.acquireLease(HOST, "c2", 100, 1149)).toBe(false);
    });

    it("releases a lease only for its holder", async () => {
      await store.acquireLease(HOST, "c1", 100, 1000);
      await store.releaseLease(HOST, "c2");
      expect((await store.getSite(HOST))?.lease?.crawlId).toBe("c1");
      await store.releaseLease(HOST, "c1");
      expect((await store.getSite(HOST))?.lease).toBeUndefined();
    });

    it("lists due sites earliest first and honors the limit", async () => {
      for (const [host, at] of [
        ["c.com", "2026-09-11T03:00:00.000Z"],
        ["a.com", "2026-09-11T01:00:00.000Z"],
        ["b.com", "2026-09-11T02:00:00.000Z"],
        ["later.com", "2026-09-12T00:00:00.000Z"],
      ] as const) {
        await store.putSiteIfAbsent({ host, origin: `https://${host}` });
        await store.setSchedule(host, at);
      }
      const due = await store.listDueSites("2026-09-11T12:00:00.000Z", 2);
      expect(due.map((s) => s.host)).toEqual(["a.com", "b.com"]);
      const all = await store.listDueSites("2026-09-11T12:00:00.000Z", 10);
      expect(all.map((s) => s.host)).toEqual(["a.com", "b.com", "c.com"]);
    });

    it("clears the schedule with null", async () => {
      await store.setSchedule(HOST, "2026-09-11T01:00:00.000Z");
      await store.setSchedule(HOST, null);
      expect(await store.listDueSites("2027-01-01T00:00:00.000Z", 10)).toEqual(
        [],
      );
    });
  });

  describe("store contract: crawls", () => {
    let store: Store;
    beforeEach(async () => {
      store = await factory();
      await store.putSiteIfAbsent({ host: HOST, origin: `https://${HOST}` });
    });

    it("lists crawls newest first by id and honors the limit", async () => {
      await store.putCrawl(HOST, crawl("01A"));
      await store.putCrawl(HOST, crawl("01C"));
      await store.putCrawl(HOST, crawl("01B"));
      expect((await store.listCrawls(HOST, 10)).map((c) => c.crawlId)).toEqual([
        "01C",
        "01B",
        "01A",
      ]);
      expect((await store.listCrawls(HOST, 1)).map((c) => c.crawlId)).toEqual([
        "01C",
      ]);
    });

    it("updates fields and adds counters", async () => {
      await store.putCrawl(HOST, crawl("01A"));
      await store.updateCrawl(HOST, "01A", {
        status: "running",
        phase: "fetching",
      });
      await store.addCrawlCounters(HOST, "01A", {
        pagesFetched: 2,
        invocations: 1,
      });
      const after = await store.addCrawlCounters(HOST, "01A", {
        pagesFetched: 3,
      });
      expect(after).toMatchObject({
        status: "running",
        phase: "fetching",
        pagesFetched: 5,
        invocations: 1,
      });
    });

    it("removes a field when the patch sets it to undefined", async () => {
      await store.putCrawl(HOST, crawl("01A", { error: "boom" }));
      await store.updateCrawl(HOST, "01A", { error: undefined });
      expect((await store.getCrawl(HOST, "01A"))?.error).toBeUndefined();
    });
  });

  describe("store contract: pages", () => {
    let store: Store;
    beforeEach(async () => {
      store = await factory();
      await store.putSiteIfAbsent({ host: HOST, origin: `https://${HOST}` });
      await store.putCrawl(HOST, crawl("01A"));
    });

    it("queues new pages and reports the count", async () => {
      const n = await store.upsertQueuedPages(HOST, "01A", [
        { url: `https://${HOST}/`, path: "/", depth: 0 },
        { url: `https://${HOST}/docs`, path: "/docs", depth: 1 },
      ]);
      expect(n).toBe(2);
      expect(
        (await store.listPagesByCrawl("01A", "queued")).map((p) => p.path),
      ).toEqual(["/", "/docs"]);
    });

    it("does not re-queue a page this crawl already fetched", async () => {
      await store.upsertQueuedPages(HOST, "01A", [
        { url: `https://${HOST}/`, path: "/", depth: 0 },
      ]);
      await store.updatePage(HOST, "/", { status: "fetched", title: "Home" });
      const n = await store.upsertQueuedPages(HOST, "01A", [
        { url: `https://${HOST}/`, path: "/", depth: 0 },
      ]);
      expect(n).toBe(0);
      expect((await store.getPage(HOST, "/"))?.status).toBe("fetched");
    });

    it("re-points a page from an older crawl and keeps firstSeenAt", async () => {
      await store.upsertQueuedPages(HOST, "01A", [
        { url: `https://${HOST}/`, path: "/", depth: 0 },
      ]);
      await store.updatePage(HOST, "/", { status: "fetched" });
      const before = await store.getPage(HOST, "/");
      await store.putCrawl(HOST, crawl("01B"));
      const n = await store.upsertQueuedPages(HOST, "01B", [
        { url: `https://${HOST}/`, path: "/", depth: 0 },
      ]);
      const after = await store.getPage(HOST, "/");
      expect(n).toBe(1);
      expect(after).toMatchObject({ crawlId: "01B", status: "queued" });
      expect(after?.firstSeenAt).toBe(before?.firstSeenAt);
      expect(await store.listPagesByCrawl("01A")).toEqual([]);
    });

    it("filters listPages by eligible", async () => {
      await store.upsertQueuedPages(HOST, "01A", [
        { url: `https://${HOST}/a`, path: "/a", depth: 1 },
        { url: `https://${HOST}/b`, path: "/b", depth: 1 },
      ]);
      await store.updatePage(HOST, "/a", { status: "fetched", eligible: true });
      expect(
        (await store.listPages(HOST, { eligible: true })).map((p) => p.path),
      ).toEqual(["/a"]);
      expect((await store.listPages(HOST)).map((p) => p.path)).toEqual([
        "/a",
        "/b",
      ]);
    });
  });

  describe("store contract: finishCrawl", () => {
    it("marks the crawl done, points the site at the output, releases the lease and schedules", async () => {
      const store = await factory();
      await store.putSiteIfAbsent({ host: HOST, origin: `https://${HOST}` });
      await store.putCrawl(HOST, crawl("01A", { status: "running" }));
      await store.acquireLease(HOST, "01A", 100, 1000);
      await store.finishCrawl(HOST, "01A", {
        snapshotKey: "snap",
        llmsTxtKey: "file",
        diff: { added: 1, removed: 0, changed: 0, samples: ["/"] },
        nextRunAt: "2026-09-12T00:00:00.000Z",
        finishedAt: "2026-09-11T00:10:00.000Z",
      });
      expect(await store.getCrawl(HOST, "01A")).toMatchObject({
        status: "done",
        snapshotKey: "snap",
        llmsTxtKey: "file",
        diff: { added: 1 },
        finishedAt: "2026-09-11T00:10:00.000Z",
      });
      const site = await store.getSite(HOST);
      expect(site).toMatchObject({
        lastDoneCrawlId: "01A",
        currentLlmsTxtKey: "file",
        nextRunAt: "2026-09-12T00:00:00.000Z",
      });
      expect(site?.lease).toBeUndefined();
    });

    it("clears the schedule when nextRunAt is null", async () => {
      const store = await factory();
      await store.putSiteIfAbsent({ host: HOST, origin: `https://${HOST}` });
      await store.setSchedule(HOST, "2026-09-12T00:00:00.000Z");
      await store.putCrawl(HOST, crawl("01A"));
      await store.finishCrawl(HOST, "01A", {
        snapshotKey: "s",
        llmsTxtKey: "f",
        diff: { added: 0, removed: 0, changed: 0, samples: [] },
        nextRunAt: null,
        finishedAt: "2026-09-11T00:10:00.000Z",
      });
      expect((await store.getSite(HOST))?.nextRunAt).toBeUndefined();
    });
  });
}

function crawl(crawlId: string, overrides: Partial<Crawl> = {}): Crawl {
  return {
    crawlId,
    status: "queued",
    reason: "user",
    phase: "discovery",
    invocations: 0,
    pagesQueued: 0,
    pagesFetched: 0,
    pagesFailed: 0,
    pagesChanged: 0,
    createdAt: "2026-09-11T00:00:00.000Z",
    ...overrides,
  };
}
