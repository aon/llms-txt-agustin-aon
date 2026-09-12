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
