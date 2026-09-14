import { sameSite } from "@llms-txt/core";

/** Normalizing here is what keeps `/blog/hello` and `/blog/hello?utm_source=x` a single page row. */
export function normalizeLink(href: string, base: string, host: string) {
  const url = parseUrl(href, base);
  if (!url) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!sameSite(url.host, host)) return null;
  if (hasNonHtmlExtension(url.pathname)) return null;
  url.hash = "";
  stripTrackingParams(url.searchParams);
  url.searchParams.sort();
  url.pathname = trimTrailingSlash(url.pathname);
  // Re-serialize so an empty query does not leave a dangling "?".
  return url.toString();
}

/** A first segment like "de-de" or "pt-br": a translated copy of the site, not a section. */
export function localeSegmentOf(path: string) {
  const first = path.split("?")[0]?.split("/").filter(Boolean)[0];
  if (!first || !LOCALE_SHAPE.test(first)) return undefined;
  return isKnownLocale(first) ? first.toLowerCase() : undefined;
}

const LOCALE_SHAPE = /^[a-z]{2,3}-[a-z]{2,4}$/i;
const LOCALE_NAMES = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "none",
});

/** ICU names every real language and region, so "how-to" and "no-go" name nothing. */
function isKnownLocale(tag: string) {
  try {
    return LOCALE_NAMES.of(tag) !== undefined;
  } catch {
    return false;
  }
}

/** Query keys that only identify a campaign, never a different page. */
export const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

export const NON_HTML_EXTENSIONS: ReadonlySet<string> = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "rtf",
  "csv",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "ico",
  "bmp",
  "tiff",
  "zip",
  "gz",
  "tgz",
  "bz2",
  "rar",
  "7z",
  "tar",
  "dmg",
  "exe",
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "css",
  "js",
  "mjs",
  "map",
  "json",
  "xml",
  "rss",
  "atom",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
]);

function parseUrl(href: string, base: string) {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  try {
    return new URL(trimmed, base);
  } catch {
    return null;
  }
}

function hasNonHtmlExtension(pathname: string) {
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0) return false;
  return NON_HTML_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase());
}

function stripTrackingParams(params: URLSearchParams) {
  for (const key of [...params.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      params.delete(key);
    }
  }
}

function trimTrailingSlash(pathname: string) {
  if (!pathname.endsWith("/")) return pathname === "" ? "/" : pathname;
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}
