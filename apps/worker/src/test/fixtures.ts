import type { Crawl } from "@llms-txt/core";
import {
  DEFAULT_SITE_CONFIG,
  MemoryFileStore,
  MemoryQueue,
  MemoryStore,
} from "@llms-txt/core";
import type { JobDeps } from "../job.js";

export const HOST = "example.com";
export const ORIGIN = `https://${HOST}`;
export const CRAWL_ID = "01CRAWLONE";

const HOME = `<html><head><title>Acme</title><meta name="description" content="Acme makes widgets."></head>
<body><nav><a href="/docs">Docs</a></nav><main><h1>Acme</h1><p>Acme makes widgets for everyone who needs widgets.</p></main></body></html>`;
const DOCS = `<html><head><title>Docs | Acme</title></head>
<body><main><h1>Docs</h1><p>How to use the widgets, step by step, with examples.</p></main></body></html>`;

export interface Route {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

export function fakeFetch(routes: Record<string, Route>) {
  const requests: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    requests.push(url);
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body ?? "", {
      status: route.status ?? 200,
      headers: { "content-type": "text/html; charset=utf-8", ...route.headers },
    });
  };
  return { fetch, requests };
}

export function twoPageSite(): Record<string, Route> {
  return {
    [`${ORIGIN}/robots.txt`]: { status: 404 },
    [`${ORIGIN}/sitemap.xml`]: { status: 404 },
    [`${ORIGIN}/`]: { body: HOME },
    [`${ORIGIN}/docs`]: { body: DOCS },
  };
}

export function fakeClock(startMs = Date.parse("2026-09-14T10:00:00.000Z")) {
  let current = startMs;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

export interface HarnessOptions {
  routes?: Record<string, Route>;
  scheduleHours?: number;
  budgetMs?: number;
  files?: MemoryFileStore;
}

export async function harness(options: HarnessOptions = {}) {
  const store = new MemoryStore();
  const files = options.files ?? new MemoryFileStore();
  const queue = new MemoryQueue();
  const clock = fakeClock();
  const site = await store.putSiteIfAbsent({
    host: HOST,
    origin: ORIGIN,
    config: {
      ...DEFAULT_SITE_CONFIG,
      ...(options.scheduleHours
        ? { scheduleHours: options.scheduleHours }
        : {}),
    },
  });
  await store.putCrawl(HOST, newCrawl(CRAWL_ID));
  const { fetch, requests } = fakeFetch(options.routes ?? twoPageSite());
  const logs: string[] = [];
  const deps: JobDeps = {
    store,
    files,
    queue,
    fetch,
    now: clock.now,
    sleep: async (ms) => clock.advance(ms),
    log: (message) => {
      logs.push(message);
    },
    userAgent: "TestBot/1.0",
    budgetMs: options.budgetMs ?? 10 * 60 * 1000,
  };
  return { store, files, queue, clock, site, deps, requests, logs };
}

export function newCrawl(
  crawlId: string,
  overrides: Partial<Crawl> = {},
): Crawl {
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
    createdAt: "2026-09-14T09:00:00.000Z",
    ...overrides,
  };
}
