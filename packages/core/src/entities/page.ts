import { sha256Hex } from "../hash.js";
import { sitePk } from "./site.js";

export type PageStatus = "queued" | "fetched" | "skipped" | "failed";

export interface Page {
  url: string;
  path: string;
  depth: number;
  crawlId: string;
  status: PageStatus;
  title?: string;
  description?: string;
  lang?: string;
  canonicalUrl?: string;
  section?: string;
  rank?: number;
  /** False for duplicates, noindex and disallowed pages. */
  eligible: boolean;
  /** Words in the extracted main text, set when the page was fetched. */
  wordCount?: number;
  /** The page asked not to be indexed, by meta robots or X-Robots-Tag. */
  noindex?: boolean;
  contentHash?: string;
  htmlKey?: string;
  etag?: string;
  lastModified?: string;
  httpStatus?: number;
  skipReason?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt?: string;
}

/** DynamoDB allows sort keys up to 1024 bytes; we hash well before that. */
export const MAX_PAGE_SK_BYTES = 900;

export function pageSk(path: string) {
  const sk = `PAGE#${path}`;
  if (Buffer.byteLength(sk, "utf8") <= MAX_PAGE_SK_BYTES) {
    return sk;
  }
  return `PAGE#sha256:${sha256Hex(path)}`;
}

export function pageKeys(host: string, path: string) {
  return { pk: sitePk(host), sk: pageSk(path) };
}

/**
 * GSI1 keys for resuming a crawl: all pages a crawl touched under one
 * partition, sorted by status then path, so the frontier is one Query on
 * the "queued#" prefix and the visited set one on "fetched#".
 */
export function pageGsi1Keys(
  crawlId: string,
  status: PageStatus,
  path: string,
) {
  return { gsi1pk: `CRAWL#${crawlId}`, gsi1sk: `${status}#${path}` };
}
