import { ulid } from "ulid";
import { z } from "zod";

/**
 * User input to a site origin. Defaults to https when no scheme is given,
 * lowercases the host, strips default ports, and drops everything after the
 * host. The host drops a leading www so both spellings name one site; the
 * origin keeps it, so the crawl enters where the user pointed. Requires a
 * public domain name: localhost and IP addresses are rejected. Usable
 * directly in a form; `normalizeOrigin` wraps it for callers that prefer an
 * exception.
 */
export const originSchema = z
  .string()
  .trim()
  .min(1, "URL is empty")
  .transform(withDefaultScheme)
  .pipe(z.httpUrl({ error: "Not a valid http or https URL" }))
  .transform((href) => new URL(href))
  .refine((url) => url.username === "" && url.password === "", {
    message: "Credentials in the URL are not supported",
  })
  .transform((url) => ({ host: bareHost(url.host), origin: url.origin }));

export type NormalizedOrigin = z.output<typeof originSchema>;

export function normalizeOrigin(input: string) {
  const result = originSchema.safeParse(input);
  if (!result.success) {
    throw new InvalidUrlError(result.error.issues[0]?.message ?? "Invalid URL");
  }
  return result.data;
}

export class InvalidUrlError extends Error {
  override readonly name = "InvalidUrlError";
}

/** "example.com" becomes "https://example.com"; anything with "://" is kept. */
function withDefaultScheme(input: string) {
  return input.includes("://") ? input : `https://${input}`;
}

/** Path plus query, without the fragment. An empty path becomes "/". */
export function pagePathFromUrl(input: string | URL) {
  const url = typeof input === "string" ? new URL(input) : input;
  const path = url.pathname === "" ? "/" : url.pathname;
  return `${path}${url.search}`;
}

/** www and the bare domain are one site; a redirect between them is not offsite. */
export function sameSite(hostA: string, hostB: string) {
  return bareHost(hostA) === bareHost(hostB);
}

function bareHost(host: string) {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Time-sortable crawl id. */
export function newCrawlId() {
  return ulid();
}

export function nowIso() {
  return new Date().toISOString();
}
