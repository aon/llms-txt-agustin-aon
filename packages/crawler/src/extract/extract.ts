import { sha256Hex } from "@llms-txt/core";
import { type CheerioAPI, load } from "cheerio";

const BOILERPLATE =
  "script, style, noscript, template, svg, nav, header, footer, aside";
const NAV_CONTAINERS = "nav, header, footer";
const MAX_DESCRIPTION_LENGTH = 300;
const MIN_PARAGRAPH_LENGTH = 40;

export interface ExtractedLink {
  url: string;
  /** Tracked because a chrome link makes its target a section candidate. */
  nav: boolean;
}

export interface ExtractedPage {
  title?: string;
  description?: string;
  lang?: string;
  canonicalUrl?: string;
  noindex: boolean;
  links: ExtractedLink[];
  mainText: string;
  wordCount: number;
  contentHash: string;
}

export interface ExtractOptions {
  url: string;
  xRobotsTag?: string;
}

export function extract(html: string, options: ExtractOptions) {
  const $ = load(html);
  const mainText = readMainText($);
  const page: ExtractedPage = {
    noindex: isNoindex($, options.xRobotsTag),
    links: readLinks($, options.url),
    mainText,
    wordCount: countWords(mainText),
    contentHash: sha256Hex(mainText),
  };

  const title = readTitle($);
  if (title) page.title = title;
  const description = readDescription($);
  if (description) page.description = description;
  const lang = $("html").attr("lang")?.trim();
  if (lang) page.lang = lang;
  const canonical = resolve($("link[rel=canonical]").attr("href"), options.url);
  if (canonical) page.canonicalUrl = canonical;
  return page;
}

function readTitle($: CheerioAPI) {
  return (
    clean($("title").first().text()) ||
    clean($("meta[property='og:title']").attr("content")) ||
    clean($("h1").first().text())
  );
}

function readDescription($: CheerioAPI) {
  const meta =
    clean($("meta[name=description]").attr("content")) ||
    clean($("meta[property='og:description']").attr("content"));
  if (meta) return truncate(meta);

  const paragraphs = $("p").toArray();
  for (const element of paragraphs) {
    const text = clean($(element).text());
    if (text.length >= MIN_PARAGRAPH_LENGTH) return truncate(text);
  }
  return "";
}

function isNoindex($: CheerioAPI, xRobotsTag: string | undefined) {
  const meta = $("meta[name=robots]").attr("content") ?? "";
  return /\bnoindex\b/i.test(meta) || /\bnoindex\b/i.test(xRobotsTag ?? "");
}

function readLinks($: CheerioAPI, base: string) {
  const links = new Map<string, ExtractedLink>();
  for (const element of $("a[href]").toArray()) {
    const node = $(element);
    const url = resolve(node.attr("href"), base);
    if (!url) continue;
    const nav = node.closest(NAV_CONTAINERS).length > 0;
    const existing = links.get(url);
    if (existing) {
      existing.nav = existing.nav || nav;
      continue;
    }
    links.set(url, { url, nav });
  }
  return [...links.values()];
}

function readMainText($: CheerioAPI) {
  const root = $.root().clone();
  root.find(BOILERPLATE).remove();
  // Cheerio joins text with nothing, so a heading would run into its paragraph.
  root.find("*").after(" ");
  const body = root.find("body");
  return clean(body.length > 0 ? body.text() : root.text());
}

function countWords(text: string) {
  return text ? text.split(" ").length : 0;
}

function clean(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(text: string) {
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  return `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

function resolve(href: string | undefined, base: string) {
  const trimmed = href?.trim();
  if (!trimmed || trimmed.startsWith("#")) return "";
  if (/^(mailto|tel|javascript|data):/i.test(trimmed)) return "";
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return "";
  }
}
