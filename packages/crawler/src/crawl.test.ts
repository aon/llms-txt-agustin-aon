import type { Page, SiteConfig } from "@llms-txt/core";
import { htmlKey, MemoryFileStore, snapshotKey } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import { crawl } from "./crawl.js";
import { RateLimitedError } from "./fetch/limiter.js";
import {
  type FakeRoutes,
  FakeSite,
  FIXTURE_HOST,
  FIXTURE_ORIGIN,
  FIXTURE_USER_AGENT,
  fakeClock,
  fixtureRoutes,
  newCrawl,
  page,
  seedStore,
} from "./test/fake-site.js";

const CRAWL = "01CRAWLONE";
const FULL_BUDGET = 10 * 60 * 1000;

describe("crawl: one pass over a whole site", () => {
  it("visits the site and reports every page it decided about", async () => {
    const site = await harness();
    const result = await site.run();

    expect(result.finished).toBe(true);
    expect(await site.statuses()).toEqual({
      "/": "fetched",
      "/about": "fetched",
      "/blog": "fetched",
      "/blog/hello": "fetched",
      "/contact": "fetched",
      "/docs": "fetched",
      "/docs/api": "fetched",
      "/docs/getting-started": "fetched",
      "/dup-of-about": "fetched",
      "/flaky": "fetched",
      "/legacy": "skipped",
      "/noindex": "fetched",
      "/old": "skipped",
      "/private": "skipped",
      "/slow": "fetched",
    });
  });

  it("records why each page was skipped", async () => {
    const site = await harness();
    await site.run();
    const rows = await site.rows();
    expect(reasons(rows)).toEqual({
      "/legacy": "redirect",
      "/old": "offsite-redirect",
      "/private": "robots",
    });
  });

  it("never queues links that are not pages of this site", async () => {
    const site = await harness();
    await site.run();
    const paths = (await site.rows()).map((row) => row.path);
    expect(paths).not.toContain("/big.pdf");
    expect(paths).not.toContain("/x");
    expect(site.web.countOf("https://other.example/x")).toBe(0);
  });

  it("folds a tracking parameter into the page it decorates", async () => {
    const site = await harness();
    await site.run();
    const paths = (await site.rows()).map((row) => row.path);
    expect(paths.filter((path) => path.startsWith("/blog/hello"))).toEqual([
      "/blog/hello",
    ]);
  });

  it("leaves duplicates, noindex and unreachable pages out of the file", async () => {
    const site = await harness();
    await site.run();
    const rows = await site.rows();
    expect(inFile(rows)).toEqual([
      "/",
      "/about",
      "/blog",
      "/blog/hello",
      "/contact",
      "/docs",
      "/docs/api",
      "/docs/getting-started",
      "/flaky",
      "/slow",
    ]);
  });

  it("puts pages in sections and ranks the homepage first", async () => {
    const site = await harness();
    const result = await site.run();
    if (!result.finished) throw new Error("the crawl did not finish");
    const { snapshot } = result;

    expect(snapshot.sections[0]?.name).toBe("Acme");
    expect(sectionOf(snapshot.sections, "/")).toBe("Acme");
    expect(sectionOf(snapshot.sections, "/about")).toBe("Acme");
    for (const path of ["/docs", "/docs/api", "/docs/getting-started"]) {
      expect(sectionOf(snapshot.sections, path)).toBe("Docs");
    }
    expect(sectionOf(snapshot.sections, "/blog/hello")).toBe("Blog");

    expect(snapshot.pages[0]?.path).toBe("/");
    expect(snapshot.pages[0]?.rank).toBe(0);
    for (const section of snapshot.sections) {
      const ranks = section.pages.map((item) => item.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("stores the raw HTML of every fetched page", async () => {
    const site = await harness();
    await site.run();
    for (const row of await site.rows()) {
      if (row.status !== "fetched") {
        expect(row.htmlKey).toBeUndefined();
        continue;
      }
      expect(row.htmlKey).toBe(htmlKey(FIXTURE_HOST, CRAWL, row.path));
      expect(await site.files.getHtmlGz(row.htmlKey ?? "")).toContain("<html");
    }
  });

  it("writes the snapshot and points the crawl row at it", async () => {
    const site = await harness();
    const result = await site.run();
    if (!result.finished) throw new Error("the crawl did not finish");

    const key = snapshotKey(FIXTURE_HOST, CRAWL);
    expect(await site.files.getJson(key)).toEqual(result.snapshot);
    expect((await site.crawlRow()).snapshotKey).toBe(key);
    expect(result.snapshot).toMatchObject({
      host: FIXTURE_HOST,
      origin: FIXTURE_ORIGIN,
      crawlId: CRAWL,
      siteTitle: "Acme",
      siteDescription:
        "Acme builds small tools that do one job and stay out of the way.",
      stats: { fetched: 12, failed: 0, skipped: 3 },
    });
  });

  it("counts what it did on the crawl row", async () => {
    const site = await harness();
    await site.run();
    expect(await site.crawlRow()).toMatchObject({
      status: "running",
      phase: "generating",
      invocations: 1,
      pagesFetched: 12,
      pagesFailed: 0,
      pagesChanged: 0,
      pagesQueued: 15,
    });
  });

  it("retries a flaky page and waits out a rate limit", async () => {
    const site = await harness();
    await site.run();
    expect(site.web.countOf(`${FIXTURE_ORIGIN}/flaky`)).toBe(3);
    expect(site.web.countOf(`${FIXTURE_ORIGIN}/slow`)).toBe(2);
    // 250 and 1000 are the two retry backoffs, 1000 also the Retry-After.
    expect(site.sleeps).toContain(250);
    expect(
      site.sleeps.filter((ms) => ms === 1000).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("leaves the crawl for the worker to finish", async () => {
    const site = await harness();
    await site.run();
    const row = await site.crawlRow();
    expect(row.status).toBe("running");
    expect(row.finishedAt).toBeUndefined();
    expect(row.llmsTxtKey).toBeUndefined();
    expect((await site.store.getSite(FIXTURE_HOST))?.lease).toBeUndefined();
  });
});

describe("crawl: handing off and resuming", () => {
  it("stops on the budget and finishes on the next invocation", async () => {
    const site = await harness({ concurrency: 1 });

    const first = await site.run(CRAWL, 2500);
    expect(first.finished).toBe(false);
    const partial = await site.rows();
    expect(partial.filter((row) => row.status === "fetched").length).toBe(4);
    expect(
      partial.filter((row) => row.status === "queued").length,
    ).toBeGreaterThan(0);

    const second = await site.run(CRAWL);
    expect(second.finished).toBe(true);
    expect(
      (await site.rows()).filter((row) => row.status === "queued"),
    ).toEqual([]);
    expect((await site.crawlRow()).invocations).toBe(2);

    const refetched = Object.keys(fixtureRoutes()).filter(
      (url) =>
        url.startsWith(FIXTURE_ORIGIN) &&
        !RETRIED.has(url) &&
        site.web.countOf(url) > 1,
    );
    expect(refetched).toEqual([]);
  });
});

describe("crawl: crawling a site twice", () => {
  it("reports what was added, changed and removed", async () => {
    const site = await harness();
    await site.run();
    // The store stamps rows with the wall clock, so let it move on.
    await new Promise((resolve) => setTimeout(resolve, 5));

    site.web.set(`${FIXTURE_ORIGIN}/about`, {
      body: page("About | Acme", "A new paragraph about a company that grew."),
    });
    site.web.set(`${FIXTURE_ORIGIN}/pricing`, {
      body: page("Pricing | Acme", "What the tools cost and what you get."),
    });
    site.web.set(`${FIXTURE_ORIGIN}/sitemap.xml`, {
      headers: { "content-type": "application/xml" },
      body: `<urlset><url><loc>${FIXTURE_ORIGIN}/docs/api</loc></url><url><loc>${FIXTURE_ORIGIN}/pricing</loc></url></urlset>`,
    });

    await site.store.putCrawl(FIXTURE_HOST, newCrawl(SECOND));
    const result = await site.run(SECOND);
    if (!result.finished) throw new Error("the crawl did not finish");

    expect(result.snapshot.diff).toMatchObject({
      added: 1,
      changed: 1,
      removed: 1,
    });
    expect(result.snapshot.diff.samples).toContain("/about");
    expect(result.snapshot.diff.samples).toContain("/pricing");
    expect((await site.crawlRow(SECOND)).pagesChanged).toBe(1);
    expect(
      (await site.store.getPage(FIXTURE_HOST, "/about"))?.lastChangedAt,
    ).toBeDefined();
  });
});

describe("crawl: redirects and stale rows", () => {
  it("follows the homepage onto the www host and keeps crawling there", async () => {
    const www = `https://www.${FIXTURE_HOST}`;
    const site = await harness(
      {},
      minimalRoutes({
        [`${FIXTURE_ORIGIN}/`]: { redirectTo: `${www}/` },
        [`${www}/`]: { body: links("/about") },
        [`${www}/about`]: { body: page("About | Acme", "We moved to www.") },
      }),
    );

    const result = await site.run();
    expect(result.finished).toBe(true);
    expect(await site.statuses()).toEqual({
      "/": "fetched",
      "/about": "fetched",
    });
    expect((await site.store.getPage(FIXTURE_HOST, "/about"))?.url).toBe(
      `${www}/about`,
    );
  });

  it("treats a redirect that only adds a trailing slash as the same page", async () => {
    const site = await harness(
      {},
      minimalRoutes({
        [`${FIXTURE_ORIGIN}/`]: { body: links("/docs") },
        [`${FIXTURE_ORIGIN}/docs`]: { redirectTo: `${FIXTURE_ORIGIN}/docs/` },
        [`${FIXTURE_ORIGIN}/docs/`]: {
          body: page("Docs | Acme", "The documentation lives behind a slash."),
        },
      }),
    );
    await site.run();
    expect(await site.statuses()).toEqual({
      "/": "fetched",
      "/docs": "fetched",
    });
  });

  it("drops a page that disappeared out of the file", async () => {
    const site = await harness();
    await site.run();
    expect((await site.store.getPage(FIXTURE_HOST, "/contact"))?.inFile).toBe(
      true,
    );

    site.web.remove(`${FIXTURE_ORIGIN}/contact`);
    site.web.remove(`${FIXTURE_ORIGIN}/sitemap.xml`);
    await site.store.putCrawl(FIXTURE_HOST, newCrawl(SECOND));
    const result = await site.run(SECOND);
    if (!result.finished) throw new Error("the crawl did not finish");

    expect(result.snapshot.diff.removed).toBe(1);
    expect(await site.store.getPage(FIXTURE_HOST, "/contact")).toMatchObject({
      inFile: false,
      crawlId: CRAWL,
    });
  });

  it("clears the skip reason when a page starts answering", async () => {
    const site = await harness();
    await site.run();
    expect(
      (await site.store.getPage(FIXTURE_HOST, "/legacy"))?.skipReason,
    ).toBe("redirect");

    site.web.set(`${FIXTURE_ORIGIN}/legacy`, {
      body: page("Legacy | Acme", "The old page has content of its own now."),
    });
    await site.store.putCrawl(FIXTURE_HOST, newCrawl(SECOND));
    await site.run(SECOND);

    const legacy = await site.store.getPage(FIXTURE_HOST, "/legacy");
    expect(legacy?.status).toBe("fetched");
    expect(legacy?.skipReason).toBeUndefined();
  });
});

describe("crawl: limits", () => {
  it("stops at the page cap", async () => {
    const site = await harness({ pageCap: 5, concurrency: 1 });
    const result = await site.run();
    expect(result.finished).toBe(true);
    const rows = await site.rows();
    expect(rows).toHaveLength(5);
    expect(rows.filter((row) => row.status === "fetched")).toHaveLength(5);
    expect((await site.crawlRow()).pagesFetched).toBe(5);
  });

  it("leaves the page cap room for the homepage's own links", async () => {
    const sitemapUrls = Array.from(
      { length: 20 },
      (_, i) => `${FIXTURE_ORIGIN}/s${i}`,
    );
    const site = await harness(
      { pageCap: 7, concurrency: 1 },
      minimalRoutes({
        [`${FIXTURE_ORIGIN}/`]: { body: links("/about", "/docs", "/blog") },
        [`${FIXTURE_ORIGIN}/sitemap.xml`]: {
          headers: { "content-type": "application/xml" },
          body: `<urlset>${sitemapUrls
            .map((url) => `<url><loc>${url}</loc></url>`)
            .join("")}</urlset>`,
        },
        ...Object.fromEntries(
          ["/about", "/docs", "/blog", ...sitemapUrls.map(pathOf)].map(
            (path) => [
              `${FIXTURE_ORIGIN}${path}`,
              {
                body: page(`${path} | Acme`, "A page with a few words on it."),
              },
            ],
          ),
        ),
      }),
    );

    const result = await site.run();
    expect(result.finished).toBe(true);
    const statuses = await site.statuses();
    expect(statuses["/about"]).toBe("fetched");
    expect(statuses["/docs"]).toBe("fetched");
    expect(statuses["/blog"]).toBe("fetched");
  });

  it("pauses once for a burst of rate-limited responses", async () => {
    const paths = ["/a", "/b", "/c", "/d"];
    const site = await harness(
      { concurrency: 4 },
      minimalRoutes({
        [`${FIXTURE_ORIGIN}/`]: { body: links(...paths) },
        ...Object.fromEntries(
          paths.map((path) => [
            `${FIXTURE_ORIGIN}${path}`,
            [
              { status: 429, headers: { "retry-after": "3" }, body: "wait" },
              { body: page(`${path} | Acme`, "It answered after one wait.") },
            ],
          ]),
        ),
      }),
    );

    const result = await site.run();
    expect(result.finished).toBe(true);
    expect(Object.values(await site.statuses())).toEqual(
      Array.from({ length: 5 }, () => "fetched"),
    );
    expect(site.sleeps.filter((ms) => ms === 3000)).toEqual([3000]);
  });

  it("gives up when the host keeps rate limiting it", async () => {
    const site = await harness(
      {},
      { [`${FIXTURE_ORIGIN}/`]: { status: 429, body: "no" } },
    );
    await expect(site.run()).rejects.toThrow(RateLimitedError);
    expect(site.sleeps).toEqual([2000, 4000, 8000]);
  });
});

const SECOND = "01CRAWLTWO";
const RETRIED = new Set([
  `${FIXTURE_ORIGIN}/robots.txt`,
  `${FIXTURE_ORIGIN}/sitemap.xml`,
  `${FIXTURE_ORIGIN}/flaky`,
  `${FIXTURE_ORIGIN}/slow`,
]);

async function harness(
  config: Partial<SiteConfig> = {},
  routes: FakeRoutes = fixtureRoutes(),
) {
  const { store } = await seedStore(CRAWL, config);
  const files = new MemoryFileStore();
  const web = new FakeSite(routes);

  const sleeps: number[] = [];

  return {
    store,
    files,
    web,
    sleeps,
    async run(crawlId = CRAWL, budgetMs = FULL_BUDGET) {
      const site = await store.getSite(FIXTURE_HOST);
      if (!site) throw new Error("the site was not seeded");
      // A fresh clock per invocation, comparable with the store's wall clock.
      const clock = fakeClock();
      return await crawl(
        { site, crawlId, budgetMs, userAgent: FIXTURE_USER_AGENT },
        {
          store,
          files,
          fetch: web.fetch,
          now: clock.now,
          sleep: async (ms) => {
            sleeps.push(ms);
            clock.advance(ms);
          },
        },
      );
    },
    rows: () => store.listPages(FIXTURE_HOST),
    async statuses() {
      const rows = await store.listPages(FIXTURE_HOST);
      return Object.fromEntries(rows.map((row) => [row.path, row.status]));
    },
    async crawlRow(crawlId = CRAWL) {
      const row = await store.getCrawl(FIXTURE_HOST, crawlId);
      if (!row) throw new Error("the crawl row disappeared");
      return row;
    },
  };
}

function minimalRoutes(routes: FakeRoutes): FakeRoutes {
  return {
    [`${FIXTURE_ORIGIN}/robots.txt`]: {
      body: "User-agent: *\nDisallow:\n",
      headers: { "content-type": "text/plain" },
    },
    ...routes,
  };
}

function links(...paths: readonly string[]) {
  const anchors = paths.map((path) => `<a href="${path}">${path}</a>`).join("");
  return `<!doctype html><html lang="en"><head><title>Acme</title></head><body><nav>${anchors}</nav><main><p>A home page with a paragraph long enough to describe it.</p></main></body></html>`;
}

function pathOf(url: string) {
  return url.slice(FIXTURE_ORIGIN.length);
}

function reasons(rows: readonly Page[]) {
  return Object.fromEntries(
    rows
      .filter((row) => row.skipReason !== undefined)
      .map((row) => [row.path, row.skipReason]),
  );
}

function inFile(rows: readonly Page[]) {
  return rows.filter((row) => row.inFile).map((row) => row.path);
}

function sectionOf(
  sections: readonly { name: string; pages: readonly { path: string }[] }[],
  path: string,
) {
  return sections.find((section) =>
    section.pages.some((item) => item.path === path),
  )?.name;
}
