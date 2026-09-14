import type {
  DiscoveredPage,
  FileStore,
  Page,
  PagePatch,
  RobotsRules,
  Site,
  Store,
} from "@llms-txt/core";
import { htmlKey, pagePathFromUrl, snapshotKey, TIMING } from "@llms-txt/core";
import { type ClassifiablePage, classifyPages } from "./classify/classify.js";
import {
  crawlDelaySeconds,
  isAllowed,
  parseRobotsTxt,
} from "./discovery/robots.js";
import { collectSitemapUrls } from "./discovery/sitemap.js";
import { type ExtractedLink, extract } from "./extract/extract.js";
import { type FetchOutcome, fetchPage } from "./fetch/fetch-page.js";
import { HostLimiter } from "./fetch/limiter.js";
import { Frontier } from "./frontier/frontier.js";
import { normalizeLink } from "./frontier/normalize.js";
import { buildSnapshot, landingOf, siteNameFrom } from "./snapshot.js";

/** Never hammer a host faster than this, whatever robots.txt allows. */
export const MIN_REQUEST_SPACING_MS = 1000;

export interface CrawlInput {
  site: Site;
  crawlId: string;
  budgetMs: number;
  userAgent: string;
}

export interface CrawlDeps {
  store: Store;
  files: FileStore;
  fetch: typeof globalThis.fetch;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

/** Durable progress lives in page rows: unfinished means "call me again". */
export async function crawl(input: CrawlInput, deps: CrawlDeps) {
  const context = await begin(input, deps);
  await fetchAll(context);
  if (context.outOfBudget) return { finished: false as const };
  const classified = await classify(context);
  const snapshot = await writeSnapshot(context, classified);
  return { finished: true as const, snapshot };
}

export type CrawlResult = Awaited<ReturnType<typeof crawl>>;

interface CrawlContext {
  readonly input: CrawlInput;
  readonly deps: CrawlDeps;
  readonly host: string;
  readonly origin: string;
  readonly crawlId: string;
  readonly config: Site["config"];
  readonly robots: RobotsRules | undefined;
  /** When the crawl started, not this invocation: the diff baseline. */
  readonly startedAt: string;
  readonly deadlineAt: number;
  readonly limiter: HostLimiter;
  readonly frontier: Frontier;
  readonly inbound: Map<string, Set<string>>;
  readonly navLinked: Set<string>;
  readonly sitemapPaths: Set<string>;
  fetched: number;
  outOfBudget: boolean;
  failure: unknown;
}

/**  */
async function begin(input: CrawlInput, deps: CrawlDeps) {
  const host = input.site.host;
  const startedNow = deps.now();
  const existing = await deps.store.getCrawl(host, input.crawlId);
  const startedAt = existing?.startedAt ?? startedNow.toISOString();
  await deps.store.updateCrawl(host, input.crawlId, {
    status: "running",
    startedAt,
  });
  await deps.store.addCrawlCounters(host, input.crawlId, { invocations: 1 });

  const robots = await refreshRobots(input, deps);
  const rows = await deps.store.listPagesByCrawl(input.crawlId);
  const context: CrawlContext = {
    input,
    deps,
    host,
    origin: input.site.origin,
    crawlId: input.crawlId,
    config: input.site.config,
    robots,
    startedAt,
    deadlineAt: startedNow.getTime() + input.budgetMs,
    limiter: new HostLimiter({
      concurrency: input.site.config.concurrency,
      spacingMs: Math.max(
        crawlDelaySeconds(robots) * 1000,
        MIN_REQUEST_SPACING_MS,
      ),
      now: deps.now,
      sleep: deps.sleep,
    }),
    frontier: new Frontier({
      host,
      crawlId: input.crawlId,
      store: deps.store,
      config: input.site.config,
    }),
    inbound: new Map(),
    navLinked: new Set(),
    sitemapPaths: new Set(),
    fetched: rows.filter((page) => page.status === "fetched").length,
    outOfBudget: false,
    failure: undefined,
  };

  await deps.store.updateCrawl(host, input.crawlId, {
    phase: rows.length === 0 ? "discovery" : "fetching",
  });
  context.frontier.resume(rows);
  await restoreLinkGraph(context, rows);
  await seed(context);
  await deps.store.updateCrawl(host, input.crawlId, { phase: "fetching" });
  return context;
}

async function refreshRobots(input: CrawlInput, deps: CrawlDeps) {
  const cached = input.site.robots;
  const now = deps.now();
  const age = cached
    ? now.getTime() - Date.parse(cached.fetchedAt)
    : Number.POSITIVE_INFINITY;
  if (cached && age < TIMING.robotsMaxAgeMs) return cached;

  const text = await fetchRobotsTxt(input, deps);
  const robots: RobotsRules = {
    ...parseRobotsTxt(text ?? "", input.userAgent),
    fetchedAt: now.toISOString(),
  };
  await deps.store.updateSite(input.site.host, { robots });
  return robots;
}

/** A missing or broken robots.txt means the whole site is allowed. */
async function fetchRobotsTxt(input: CrawlInput, deps: CrawlDeps) {
  try {
    const response = await deps.fetch(`${input.site.origin}/robots.txt`, {
      headers: { "User-Agent": input.userAgent, Accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Runs every invocation: the sitemap set is not stored, re-queuing is free. */
async function seed(context: CrawlContext) {
  const { input, deps } = context;
  const sitemapUrls = await collectSitemapUrls({
    seeds: [
      ...(context.robots?.sitemaps ?? []),
      `${context.origin}/sitemap.xml`,
    ],
    host: context.host,
    userAgent: input.userAgent,
    fetch: deps.fetch,
  });

  const fromSitemap: string[] = [];
  for (const url of sitemapUrls) {
    const normalized = normalizeLink(url, context.origin, context.host);
    if (!normalized) continue;
    context.sitemapPaths.add(pagePathFromUrl(normalized));
    fromSitemap.push(normalized);
  }

  // A long sitemap must not eat the whole page cap before the homepage's turn.
  const seedCap = Math.floor(context.config.pageCap / 2);
  const queued =
    (await context.frontier.discover([`${context.origin}/`], 0)) +
    (await context.frontier.discover(fromSitemap.slice(0, seedCap), 1));
  await bumpQueued(context, queued);
}

/** Rebuilt from stored HTML so ranking sees the site, not one invocation. */
async function restoreLinkGraph(context: CrawlContext, rows: readonly Page[]) {
  for (const page of rows) {
    if (page.status !== "fetched" || !page.htmlKey) continue;
    const html = await context.deps.files.getHtmlGz(page.htmlKey);
    if (!html) continue;
    recordLinks(context, page.path, extract(html, { url: page.url }).links);
  }
}

async function fetchAll(context: CrawlContext) {
  const inFlight = new Set<Promise<void>>();
  while (context.failure === undefined) {
    if (context.fetched >= context.config.pageCap) break;
    const next = context.frontier.take();
    if (!next) {
      if (inFlight.size === 0) break;
      await Promise.race(inFlight);
      continue;
    }
    if (context.deps.now().getTime() >= context.deadlineAt) {
      context.frontier.requeue(next);
      context.outOfBudget = true;
      break;
    }
    const task = processPage(context, next)
      .catch((error: unknown) => {
        if (context.failure === undefined) context.failure = error;
      })
      .finally(() => {
        inFlight.delete(task);
      });
    inFlight.add(task);
    if (inFlight.size >= context.config.concurrency) {
      await Promise.race(inFlight);
    }
  }
  await Promise.all(inFlight);
  if (context.failure !== undefined) throw context.failure;
}

async function processPage(context: CrawlContext, item: DiscoveredPage) {
  if (!isAllowed(context.robots, item.path)) {
    await markSkipped(context, item.path, "robots");
    return;
  }
  while (true) {
    const outcome = await context.limiter.run(() =>
      fetchPage({
        url: item.url,
        host: context.host,
        userAgent: context.input.userAgent,
        fetch: context.deps.fetch,
        sleep: context.deps.sleep,
        now: context.deps.now,
      }),
    );
    if (outcome.kind === "rate-limited") {
      // Throws once the host has held us off too many times in a row.
      await context.limiter.pause(outcome.retryAfterSeconds);
      continue;
    }
    context.limiter.noteSuccess();
    await apply(context, item, outcome);
    return;
  }
}

async function apply(
  context: CrawlContext,
  item: DiscoveredPage,
  outcome: FetchOutcome,
) {
  if (outcome.kind === "failed") {
    await markFailed(context, item.path, outcome.status);
    return;
  }
  if (outcome.kind === "skipped") {
    await markSkipped(context, item.path, outcome.reason, outcome.status);
    return;
  }
  if (outcome.kind === "ok") await storePage(context, item, outcome);
}

async function storePage(
  context: CrawlContext,
  item: DiscoveredPage,
  outcome: Extract<FetchOutcome, { kind: "ok" }>,
) {
  const path = await resolveRedirect(context, item, outcome);
  if (path === null) return;

  const { store, files } = context.deps;
  const previous = await store.getPage(context.host, path);
  const page = extract(outcome.html, {
    url: outcome.url,
    ...(outcome.xRobotsTag === undefined
      ? {}
      : { xRobotsTag: outcome.xRobotsTag }),
  });
  const key = htmlKey(context.host, context.crawlId, path);
  await files.putHtmlGz(key, outcome.html);

  const seenAt = context.deps.now().toISOString();
  const changed =
    previous?.contentHash !== undefined &&
    previous.contentHash !== page.contentHash;
  const patch: PagePatch = {
    status: "fetched",
    httpStatus: outcome.status,
    htmlKey: key,
    contentHash: page.contentHash,
    wordCount: page.wordCount,
    noindex: page.noindex,
    lastSeenAt: seenAt,
    // An explicit undefined removes whatever an earlier crawl left here.
    skipReason: undefined,
  };
  if (page.title) patch.title = page.title;
  if (page.description) patch.description = page.description;
  if (page.lang) patch.lang = page.lang;
  if (page.canonicalUrl) patch.canonicalUrl = page.canonicalUrl;
  if (outcome.etag) patch.etag = outcome.etag;
  if (outcome.lastModified) patch.lastModified = outcome.lastModified;
  if (changed) patch.lastChangedAt = seenAt;
  await store.updatePage(context.host, path, patch);

  context.fetched += 1;
  await store.addCrawlCounters(context.host, context.crawlId, {
    pagesFetched: 1,
    ...(changed ? { pagesChanged: 1 } : {}),
  });

  const targets = recordLinks(context, path, page.links);
  await bumpQueued(
    context,
    await context.frontier.discover(targets, item.depth + 1),
  );
}

/** The landing URL is normalized like a link, so /x and /x/ stay one page. */
async function resolveRedirect(
  context: CrawlContext,
  item: DiscoveredPage,
  outcome: Extract<FetchOutcome, { kind: "ok" }>,
) {
  const url = normalizeLink(outcome.url, context.origin, context.host);
  const finalPath = url === null ? item.path : pagePathFromUrl(url);
  if (url === null || finalPath === item.path) return item.path;
  await markSkipped(context, item.path, "redirect", outcome.status);
  if (context.frontier.has(finalPath)) return null;
  await context.frontier.claim({ url, path: finalPath, depth: item.depth });
  return finalPath;
}

function recordLinks(
  context: CrawlContext,
  from: string,
  links: readonly ExtractedLink[],
) {
  const targets = new Map<string, boolean>();
  for (const link of links) {
    const url = normalizeLink(link.url, context.origin, context.host);
    if (!url) continue;
    targets.set(url, (targets.get(url) ?? false) || link.nav);
  }
  for (const [url, nav] of targets) {
    const path = pagePathFromUrl(url);
    if (path === from) continue;
    let sources = context.inbound.get(path);
    if (!sources) {
      sources = new Set();
      context.inbound.set(path, sources);
    }
    sources.add(from);
    if (nav) context.navLinked.add(path);
  }
  return [...targets.keys()];
}

async function markSkipped(
  context: CrawlContext,
  path: string,
  reason: string,
  status?: number,
) {
  const patch: PagePatch = {
    status: "skipped",
    skipReason: reason,
    eligible: false,
    lastSeenAt: context.deps.now().toISOString(),
  };
  if (status !== undefined) patch.httpStatus = status;
  await context.deps.store.updatePage(context.host, path, patch);
}

async function markFailed(
  context: CrawlContext,
  path: string,
  status: number | undefined,
) {
  const patch: PagePatch = {
    status: "failed",
    eligible: false,
    lastSeenAt: context.deps.now().toISOString(),
  };
  if (status !== undefined) patch.httpStatus = status;
  await context.deps.store.updatePage(context.host, path, patch);
  await context.deps.store.addCrawlCounters(context.host, context.crawlId, {
    pagesFailed: 1,
  });
}

async function bumpQueued(context: CrawlContext, queued: number) {
  if (queued <= 0) return;
  await context.deps.store.addCrawlCounters(context.host, context.crawlId, {
    pagesQueued: queued,
  });
}

async function classify(context: CrawlContext) {
  const { store } = context.deps;
  await store.updateCrawl(context.host, context.crawlId, {
    phase: "extracting",
  });
  const rows = await store.listPagesByCrawl(context.crawlId);
  const siteName = siteNameFrom(rows, context.host);
  const result = classifyPages(
    rows.map((page) => toClassifiable(context, page)),
    { siteName },
  );

  const decisions = new Map(result.pages.map((page) => [page.path, page]));
  const pages: Page[] = [];
  for (const row of rows) {
    const decision = decisions.get(row.path);
    if (!decision) {
      pages.push(row);
      continue;
    }
    pages.push(
      await store.updatePage(context.host, row.path, {
        section: decision.section,
        rank: decision.rank,
        eligible: decision.eligible,
      }),
    );
  }
  return { pages, sections: result.sections };
}

async function writeSnapshot(
  context: CrawlContext,
  classified: { pages: readonly Page[]; sections: readonly string[] },
) {
  const { store, files } = context.deps;
  await store.updateCrawl(context.host, context.crawlId, {
    phase: "generating",
  });
  const [sitePages, crawlRow, landingText] = await Promise.all([
    store.listPages(context.host),
    store.getCrawl(context.host, context.crawlId),
    readLandingText(context, classified.pages),
  ]);
  await retireMissingPages(context, sitePages);
  const snapshot = buildSnapshot({
    site: { host: context.host, origin: context.origin },
    crawlId: context.crawlId,
    generatedAt: context.deps.now().toISOString(),
    pages: classified.pages,
    sitePages,
    sections: classified.sections,
    startedAt: context.startedAt,
    changed: crawlRow?.pagesChanged ?? 0,
    landingText,
  });

  const key = snapshotKey(context.host, context.crawlId);
  await files.putJson(key, snapshot);
  await store.updateCrawl(context.host, context.crawlId, { snapshotKey: key });
  return snapshot;
}

/** Read back from S3: the landing may have been fetched by an earlier invocation. */
async function readLandingText(context: CrawlContext, pages: readonly Page[]) {
  const landing = landingOf(pages);
  if (!landing?.htmlKey) return "";
  const html = await context.deps.files.getHtmlGz(landing.htmlKey);
  return html ? extract(html, { url: landing.url }).mainText : "";
}

/** A page this crawl never reached is gone, so it leaves the file. */
async function retireMissingPages(
  context: CrawlContext,
  sitePages: readonly Page[],
) {
  for (const page of sitePages) {
    if (page.crawlId === context.crawlId || !page.eligible) continue;
    await context.deps.store.updatePage(context.host, page.path, {
      eligible: false,
    });
  }
}

function toClassifiable(context: CrawlContext, page: Page) {
  const item: ClassifiablePage = {
    url: page.url,
    path: page.path,
    depth: page.depth,
    status: page.status,
    noindex: page.noindex ?? false,
    allowed: isAllowed(context.robots, page.path),
    inboundLinks: context.inbound.get(page.path)?.size ?? 0,
    navLinked: context.navLinked.has(page.path),
    inSitemap: context.sitemapPaths.has(page.path),
  };
  if (page.canonicalUrl) item.canonicalUrl = page.canonicalUrl;
  if (page.contentHash) item.contentHash = page.contentHash;
  return item;
}
