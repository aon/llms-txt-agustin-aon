import type { Crawl, Site } from "@llms-txt/core";
import { DEFAULT_SITE_CONFIG, MemoryStore } from "@llms-txt/core";

export interface FakeRoute {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  redirectTo?: string;
}

export type FakeRoutes = Record<string, FakeRoute | FakeRoute[]>;

export class FakeSite {
  constructor(routes: FakeRoutes) {
    this.routes = { ...routes };
  }

  readonly requests: string[] = [];

  readonly fetch: typeof globalThis.fetch = async (input) => {
    const requested = urlOf(input);
    this.requests.push(requested);
    let current = requested;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      const route = this.take(current);
      if (!route) return respond(current, NOT_FOUND);
      if (route.redirectTo === undefined) return respond(current, route);
      current = route.redirectTo;
    }
    return respond(current, NOT_FOUND);
  };

  countOf(url: string) {
    return this.requests.filter((requested) => requested === url).length;
  }

  set(url: string, route: FakeRoute | FakeRoute[]) {
    this.routes[url] = route;
    this.sequence.delete(url);
  }

  remove(url: string) {
    delete this.routes[url];
  }

  private readonly routes: FakeRoutes;
  private readonly sequence = new Map<string, number>();

  private take(url: string) {
    const route = this.routes[url];
    if (!route) return undefined;
    if (!Array.isArray(route)) return route;
    const index = Math.min(this.sequence.get(url) ?? 0, route.length - 1);
    this.sequence.set(url, index + 1);
    return route[index];
  }
}

export function fakeClock(startMs = Date.now()) {
  let current = startMs;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

export function recordingSleep(clock: ReturnType<typeof fakeClock>) {
  const calls: number[] = [];
  return {
    calls,
    sleep: async (ms: number) => {
      calls.push(ms);
      clock.advance(ms);
    },
  };
}

export const FIXTURE_HOST = "example.com";
export const FIXTURE_ORIGIN = `https://${FIXTURE_HOST}`;
export const FIXTURE_USER_AGENT = "TestBot/1.0 (+https://example.test/bot)";

/** Holds one of each thing that should and should not end up in the file. */
export function fixtureRoutes(): FakeRoutes {
  return {
    [`${FIXTURE_ORIGIN}/robots.txt`]: { body: ROBOTS, headers: TEXT },
    [`${FIXTURE_ORIGIN}/sitemap.xml`]: { body: SITEMAP, headers: XML },
    [`${FIXTURE_ORIGIN}/`]: { body: HOME },
    [`${FIXTURE_ORIGIN}/about`]: { body: page("About | Acme", ABOUT_BODY) },
    [`${FIXTURE_ORIGIN}/dup-of-about`]: {
      body: page("About | Acme", ABOUT_BODY),
    },
    [`${FIXTURE_ORIGIN}/docs`]: { body: DOCS },
    [`${FIXTURE_ORIGIN}/docs/getting-started`]: {
      body: page(
        "Getting Started | Acme",
        "Install the package and run it once to see what it does for you.",
      ),
    },
    [`${FIXTURE_ORIGIN}/docs/api`]: {
      body: page(
        "API | Acme",
        "Every endpoint the service exposes, with its parameters spelled out.",
      ),
    },
    [`${FIXTURE_ORIGIN}/blog`]: { body: BLOG },
    [`${FIXTURE_ORIGIN}/blog/hello`]: {
      body: page(
        "Hello | Acme",
        "The first post on this blog, written to say hello to everyone.",
      ),
    },
    [`${FIXTURE_ORIGIN}/contact`]: {
      body: page(
        "Contact | Acme",
        "Ways to reach the team, none of which are linked from anywhere.",
      ),
    },
    [`${FIXTURE_ORIGIN}/private`]: { body: page("Private | Acme", "Secret.") },
    [`${FIXTURE_ORIGIN}/noindex`]: { body: NOINDEX },
    [`${FIXTURE_ORIGIN}/legacy`]: { redirectTo: `${FIXTURE_ORIGIN}/about` },
    [`${FIXTURE_ORIGIN}/old`]: { redirectTo: "https://other.example/x" },
    "https://other.example/x": { body: page("Elsewhere", "Another site.") },
    [`${FIXTURE_ORIGIN}/flaky`]: [
      { status: 500, body: "boom" },
      { status: 500, body: "boom" },
      {
        body: page(
          "Flaky | Acme",
          "This page finally answered after two failures in a row.",
        ),
      },
    ],
    [`${FIXTURE_ORIGIN}/slow`]: [
      { status: 429, headers: { "retry-after": "1" }, body: "slow down" },
      {
        body: page(
          "Slow | Acme",
          "This page asked the crawler to wait a second and then answered.",
        ),
      },
    ],
  };
}

export async function seedStore(
  crawlId: string,
  config: Partial<Site["config"]> = {},
) {
  const store = new MemoryStore();
  const site = await store.putSiteIfAbsent({
    host: FIXTURE_HOST,
    origin: FIXTURE_ORIGIN,
    config: { ...DEFAULT_SITE_CONFIG, ...config },
  });
  await store.putCrawl(FIXTURE_HOST, newCrawl(crawlId));
  return { store, site };
}

export function newCrawl(crawlId: string): Crawl {
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
    createdAt: "2026-09-12T00:00:00.000Z",
  };
}

export function page(title: string, body: string, extraHead = "") {
  return `<!doctype html><html lang="en"><head><title>${title}</title>${extraHead}</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

const MAX_REDIRECTS = 5;
const TEXT = { "content-type": "text/plain; charset=utf-8" };
const XML = { "content-type": "application/xml" };
const NOT_FOUND: FakeRoute = { status: 404, body: "not found", headers: TEXT };

function urlOf(input: Parameters<typeof globalThis.fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function respond(url: string, route: FakeRoute) {
  const status = route.status ?? 200;
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    ...route.headers,
  });
  const response = new Response(route.body ?? "", { status, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

const ROBOTS = `# Everyone else stays out.
User-agent: *
Disallow: /
Crawl-delay: 5

User-agent: testbot
Disallow: /private
Crawl-delay: 0.5

Sitemap: ${FIXTURE_ORIGIN}/sitemap.xml
`;

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${FIXTURE_ORIGIN}/docs/api</loc></url>
  <url><loc>${FIXTURE_ORIGIN}/contact</loc></url>
</urlset>
`;

const NAV = `<nav><a href="/about">About</a><a href="/docs">Docs</a><a href="/blog">Blog</a></nav>`;

const HOME = `<!doctype html><html lang="en"><head><title>Acme</title>
<meta name="description" content="Acme builds small tools that do one job and stay out of the way.">
</head><body>${NAV}<main><h1>Acme</h1>
<p>Acme builds small tools that do one job and stay out of the way of the people using them.</p>
<a href="/dup-of-about">Same as about</a>
<a href="/noindex">Hidden</a>
<a href="/private">Private</a>
<a href="/legacy">Legacy</a>
<a href="/old">Old</a>
<a href="/flaky">Flaky</a>
<a href="/slow">Slow</a>
<a href="/big.pdf">Brochure</a>
<a href="https://other.example/x">Elsewhere</a>
<a href="mailto:hi@example.com">Mail</a>
<a href="tel:+123">Call</a>
<a href="javascript:void(0)">Nothing</a>
</main></body></html>`;

const ABOUT_BODY =
  "Acme has been making small tools since the day it was founded by two people.";

const DOCS = `<!doctype html><html lang="en"><head><title>Docs | Acme</title></head><body>${NAV}
<main><h1>Docs</h1><p>Everything you need to know about running the tools we make.</p>
<a href="/docs/getting-started">Getting started</a>
<a href="/docs/api">API</a>
</main></body></html>`;

const BLOG = `<!doctype html><html lang="en"><head><title>Blog | Acme</title></head><body>${NAV}
<main><h1>Blog</h1><p>Notes about the things we changed and why we changed them.</p>
<a href="/blog/hello">Hello</a>
<a href="/blog/hello?utm_source=x">Hello again</a>
</main></body></html>`;

const NOINDEX = page(
  "Noindex | Acme",
  "This page exists but asks every crawler to leave it out of the index.",
  '<meta name="robots" content="noindex, follow">',
);
