import type { Page, SiteConfig } from "@llms-txt/core";
import { DEFAULT_SITE_CONFIG, MemoryStore } from "@llms-txt/core";
import { beforeEach, describe, expect, it } from "vitest";
import { COMMIT_BATCH_SIZE, Frontier } from "./frontier.js";

const HOST = "example.com";
const ORIGIN = `https://${HOST}`;
const CRAWL = "01CRAWL";

let store: MemoryStore;

async function build(config: Partial<SiteConfig> = {}) {
  store = new MemoryStore();
  await store.putSiteIfAbsent({ host: HOST, origin: ORIGIN });
  return new Frontier({
    host: HOST,
    crawlId: CRAWL,
    store,
    config: { ...DEFAULT_SITE_CONFIG, ...config },
  });
}

function urls(...paths: string[]) {
  return paths.map((path) => `${ORIGIN}${path}`);
}

beforeEach(() => {
  store = new MemoryStore();
});

describe("Frontier", () => {
  it("commits discovered pages and hands them out in order", async () => {
    const frontier = await build();
    expect(await frontier.discover(urls("/a", "/b"), 1)).toBe(2);
    expect(frontier.pending).toBe(2);
    expect(frontier.take()?.path).toBe("/a");
    expect(frontier.take()?.path).toBe("/b");
    expect(frontier.take()).toBeUndefined();
    const rows = await store.listPagesByCrawl(CRAWL, "queued");
    expect(rows.map((row) => row.path)).toEqual(["/a", "/b"]);
    expect(rows[0]?.depth).toBe(1);
  });

  it("never queues the same path twice", async () => {
    const frontier = await build();
    expect(await frontier.discover(urls("/a", "/a"), 1)).toBe(1);
    expect(await frontier.discover(urls("/a"), 2)).toBe(0);
    expect(frontier.pending).toBe(1);
  });

  it("commits in batches", async () => {
    const frontier = await build();
    const calls: number[] = [];
    const upsert = store.upsertQueuedPages.bind(store);
    store.upsertQueuedPages = async (host, crawlId, pages) => {
      calls.push(pages.length);
      return upsert(host, crawlId, pages);
    };
    const many = Array.from(
      { length: COMMIT_BATCH_SIZE * 2 + 3 },
      (_, i) => `${ORIGIN}/p${i}`,
    );
    await frontier.discover(many, 1);
    expect(calls).toEqual([COMMIT_BATCH_SIZE, COMMIT_BATCH_SIZE, 3]);
  });

  it("stops at the maximum depth", async () => {
    const frontier = await build({ maxDepth: 2 });
    expect(await frontier.discover(urls("/a"), 2)).toBe(1);
    expect(await frontier.discover(urls("/b"), 3)).toBe(0);
  });

  it("rejects paths and queries that look generated", async () => {
    const frontier = await build();
    const deep = `${ORIGIN}/${Array.from({ length: 11 }, (_, i) => i).join("/")}`;
    expect(await frontier.discover([deep], 1)).toBe(0);
    expect(await frontier.discover(urls("/a?a=1&b=2&c=3&d=4"), 1)).toBe(0);
    expect(await frontier.discover(urls("/a?a=1&b=2&c=3"), 1)).toBe(1);
  });

  it("caps how many pages one two-segment prefix may contribute", async () => {
    // A small page cap still leaves the floor of 25 pages per prefix.
    const frontier = await build({ pageCap: 60 });
    const many = Array.from(
      { length: 40 },
      (_, i) => `${ORIGIN}/events/2026/${i}`,
    );
    expect(await frontier.discover(many, 1)).toBe(25);
    expect(await frontier.discover(urls("/about"), 1)).toBe(1);
  });

  it("scales the prefix cap with the page cap", async () => {
    const frontier = await build({ pageCap: 300 });
    const many = Array.from(
      { length: 200 },
      (_, i) => `${ORIGIN}/blog/2026/${i}`,
    );
    expect(await frontier.discover(many, 1)).toBe(100);
  });

  it("stops queueing at the page cap", async () => {
    const frontier = await build({ pageCap: 3 });
    const many = Array.from({ length: 10 }, (_, i) => `${ORIGIN}/p/${i}`);
    expect(await frontier.discover(many, 1)).toBe(3);
    expect(frontier.committed).toBe(3);
  });

  it("resumes from rows a previous invocation left", async () => {
    const frontier = await build();
    frontier.resume([
      row("/", "fetched"),
      row("/a", "queued"),
      row("/b", "skipped"),
    ]);
    expect(frontier.pending).toBe(1);
    expect(frontier.take()?.path).toBe("/a");
    expect(frontier.has("/b")).toBe(true);
    expect(await frontier.discover(urls("/", "/b", "/c"), 1)).toBe(1);
  });

  it("puts a page taken but not fetched back at the head", async () => {
    const frontier = await build();
    await frontier.discover(urls("/a", "/b"), 1);
    const first = frontier.take();
    if (!first) throw new Error("nothing to take");
    frontier.requeue(first);
    expect(frontier.pending).toBe(2);
    expect(frontier.take()?.path).toBe("/a");
  });

  it("skips translated copies of the site under a locale prefix", async () => {
    const frontier = await build();
    expect(
      await frontier.discover(urls("/pricing", "/de-de/pricing", "/pt-br"), 1),
    ).toBe(1);
    expect(frontier.take()?.path).toBe("/pricing");
  });

  it("keeps the locale the landing redirected into", async () => {
    const frontier = await build();
    await frontier.claim({ url: `${ORIGIN}/en-us`, path: "/en-us", depth: 0 });
    expect(await frontier.discover(urls("/en-us/docs", "/fr-fr/docs"), 1)).toBe(
      1,
    );
    expect(frontier.take()?.path).toBe("/en-us/docs");
  });

  it("restores the landing's locale from the rows it resumes", async () => {
    const frontier = await build();
    frontier.resume([
      { ...row("/", "skipped"), depth: 0 },
      { ...row("/en-us", "fetched"), depth: 0 },
    ]);
    expect(await frontier.discover(urls("/en-us/docs", "/fr-fr/docs"), 1)).toBe(
      1,
    );
    expect(frontier.take()?.path).toBe("/en-us/docs");
  });

  it("claims a redirect target without queueing it", async () => {
    const frontier = await build();
    expect(
      await frontier.claim({ url: `${ORIGIN}/b`, path: "/b", depth: 1 }),
    ).toBe(1);
    expect(frontier.pending).toBe(0);
    expect(frontier.has("/b")).toBe(true);
    expect(
      await frontier.claim({ url: `${ORIGIN}/b`, path: "/b", depth: 1 }),
    ).toBe(0);
  });
});

function row(path: string, status: Page["status"]): Page {
  return {
    url: `${ORIGIN}${path}`,
    path,
    depth: 1,
    crawlId: CRAWL,
    status,
    eligible: false,
    firstSeenAt: "2026-09-12T00:00:00.000Z",
    lastSeenAt: "2026-09-12T00:00:00.000Z",
  };
}
