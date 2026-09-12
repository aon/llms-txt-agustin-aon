import { sameSite } from "@llms-txt/core";

export const SITEMAP_LIMITS = Object.freeze({
  maxFiles: 5,
  maxUrls: 2000,
});

export interface CollectSitemapOptions {
  seeds: readonly string[];
  host: string;
  userAgent: string;
  fetch: typeof globalThis.fetch;
}

/** Anything unreachable or unparsable is ignored: a sitemap is a hint, never a requirement. */
export async function collectSitemapUrls(options: CollectSitemapOptions) {
  const queue = [...new Set(options.seeds)];
  const visited = new Set<string>();
  const urls = new Set<string>();
  let files = 0;

  while (queue.length > 0 && files < SITEMAP_LIMITS.maxFiles) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    visited.add(next);
    const xml = await fetchSitemap(next, options);
    if (xml === null) continue;
    files += 1;
    const { isIndex, locs } = parseSitemap(xml);
    for (const loc of locs) {
      if (isIndex) {
        queue.push(loc);
        continue;
      }
      if (urls.size >= SITEMAP_LIMITS.maxUrls) break;
      if (onHost(loc, options.host)) urls.add(loc);
    }
  }

  return [...urls];
}

export function parseSitemap(xml: string) {
  const isIndex = /<(?:\w+:)?sitemapindex[\s>]/i.test(xml);
  const locs: string[] = [];
  for (const match of xml.matchAll(/<(?:\w+:)?loc[^>]*>([\s\S]*?)<\//gi)) {
    const value = decodeXmlText(match[1] ?? "").trim();
    if (value) locs.push(value);
  }
  return { isIndex, locs };
}

async function fetchSitemap(url: string, options: CollectSitemapOptions) {
  try {
    const response = await options.fetch(url, {
      headers: { "User-Agent": options.userAgent, Accept: "application/xml" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function onHost(url: string, host: string) {
  try {
    return sameSite(new URL(url).host, host);
  } catch {
    return false;
  }
}

const XML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
});

function decodeXmlText(raw: string) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (whole, name: string) => XML_ENTITIES[name] ?? whole,
    );
}
