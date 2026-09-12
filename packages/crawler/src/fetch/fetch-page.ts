import { sameSite } from "@llms-txt/core";

export const FETCH_DEFAULTS = Object.freeze({
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  retryBackoffMs: [250, 1000] as readonly number[],
  accept: "text/html,application/xhtml+xml",
});

const HTML_TYPES: ReadonlySet<string> = new Set([
  "text/html",
  "application/xhtml+xml",
]);

export type SkipReason =
  | "robots"
  | "content-type"
  | "too-large"
  | "offsite-redirect"
  | "redirect";

export interface FetchPageOptions {
  url: string;
  host: string;
  userAgent: string;
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  /** Only used to read an absolute Retry-After date; defaults to the wall clock. */
  now?: () => Date;
  timeoutMs?: number;
  maxBytes?: number;
  retryBackoffMs?: readonly number[];
}

export type FetchOutcome =
  | {
      kind: "ok";
      url: string;
      status: number;
      html: string;
      etag?: string;
      lastModified?: string;
      xRobotsTag?: string;
    }
  | { kind: "skipped"; url: string; status: number; reason: SkipReason }
  | { kind: "failed"; status?: number; error: string }
  | { kind: "rate-limited"; status: number; retryAfterSeconds?: number };

/** The return type is stated because inference would widen `kind` to `string` and collapse the union. */
export async function fetchPage(
  options: FetchPageOptions,
): Promise<FetchOutcome> {
  const backoff = options.retryBackoffMs ?? FETCH_DEFAULTS.retryBackoffMs;
  let status: number | undefined;
  let error = "Request failed";

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await request(options);
      if (response.status === 429 || response.status === 503) {
        await response.body?.cancel();
        return rateLimited(response, options);
      }
      if (response.status >= 500) {
        await response.body?.cancel();
        status = response.status;
        error = `HTTP ${response.status}`;
      } else if (!response.ok) {
        await response.body?.cancel();
        return {
          kind: "failed",
          status: response.status,
          error: `HTTP ${response.status}`,
        };
      } else {
        return await readPage(response, options);
      }
    } catch (cause) {
      status = undefined;
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const wait = backoff[attempt];
    if (wait === undefined) {
      return status === undefined
        ? { kind: "failed", error }
        : { kind: "failed", status, error };
    }
    await options.sleep(wait);
  }
}

function request(options: FetchPageOptions) {
  return options.fetch(options.url, {
    redirect: "follow",
    headers: {
      "User-Agent": options.userAgent,
      Accept: FETCH_DEFAULTS.accept,
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_DEFAULTS.timeoutMs),
  });
}

function rateLimited(
  response: Response,
  options: FetchPageOptions,
): FetchOutcome {
  const seconds = retryAfterSeconds(
    response.headers.get("retry-after"),
    options.now?.() ?? new Date(),
  );
  return seconds === undefined
    ? { kind: "rate-limited", status: response.status }
    : {
        kind: "rate-limited",
        status: response.status,
        retryAfterSeconds: seconds,
      };
}

/** Retry-After is either a count of seconds or an HTTP date. */
function retryAfterSeconds(header: string | null, now: Date) {
  if (!header) return undefined;
  const seconds = Number.parseFloat(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, (at - now.getTime()) / 1000);
}

async function readPage(
  response: Response,
  options: FetchPageOptions,
): Promise<FetchOutcome> {
  const finalUrl = response.url || options.url;
  if (!sameHost(finalUrl, options.host)) {
    await response.body?.cancel();
    return {
      kind: "skipped",
      url: options.url,
      status: response.status,
      reason: "offsite-redirect",
    };
  }
  if (!isHtml(response.headers.get("content-type"))) {
    await response.body?.cancel();
    return {
      kind: "skipped",
      url: finalUrl,
      status: response.status,
      reason: "content-type",
    };
  }

  const maxBytes = options.maxBytes ?? FETCH_DEFAULTS.maxBytes;
  const declared = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return {
      kind: "skipped",
      url: finalUrl,
      status: response.status,
      reason: "too-large",
    };
  }

  const html = await readCapped(response, maxBytes);
  if (html === null) {
    return {
      kind: "skipped",
      url: finalUrl,
      status: response.status,
      reason: "too-large",
    };
  }

  const outcome: FetchOutcome = {
    kind: "ok",
    url: finalUrl,
    status: response.status,
    html,
  };
  const etag = response.headers.get("etag");
  if (etag) outcome.etag = etag;
  const lastModified = response.headers.get("last-modified");
  if (lastModified) outcome.lastModified = lastModified;
  const xRobotsTag = response.headers.get("x-robots-tag");
  if (xRobotsTag) outcome.xRobotsTag = xRobotsTag;
  return outcome;
}

async function readCapped(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(concat(chunks, size));
}

function concat(chunks: readonly Uint8Array[], size: number) {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isHtml(contentType: string | null) {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return HTML_TYPES.has(type);
}

function sameHost(url: string, host: string) {
  try {
    return sameSite(new URL(url).host, host);
  } catch {
    return false;
  }
}
