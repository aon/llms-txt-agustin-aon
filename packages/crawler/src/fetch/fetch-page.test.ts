import { describe, expect, it } from "vitest";
import { type FakeRoutes, FakeSite } from "../test/fake-site.js";
import { fetchPage } from "./fetch-page.js";

const URL_ = "https://example.com/a";
const HOST = "example.com";

async function run(routes: FakeRoutes, url = URL_) {
  const site = new FakeSite(routes);
  const sleeps: number[] = [];
  const outcome = await fetchPage({
    url,
    host: HOST,
    userAgent: "TestBot/1.0",
    fetch: site.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { outcome, sleeps, site };
}

describe("fetchPage", () => {
  it("returns the body of an HTML page", async () => {
    const { outcome } = await run({
      [URL_]: {
        body: "<html><body>hi</body></html>",
        headers: {
          etag: 'W/"1"',
          "last-modified": "Mon, 01 Jan 2029 00:00:00 GMT",
        },
      },
    });
    expect(outcome).toEqual({
      kind: "ok",
      url: URL_,
      status: 200,
      html: "<html><body>hi</body></html>",
      etag: 'W/"1"',
      lastModified: "Mon, 01 Jan 2029 00:00:00 GMT",
    });
  });

  it("sends our user agent and asks for HTML", async () => {
    const site = new FakeSite({ [URL_]: { body: "<html></html>" } });
    let headers: Headers | undefined;
    await fetchPage({
      url: URL_,
      host: HOST,
      userAgent: "TestBot/1.0",
      sleep: async () => {},
      fetch: async (input, init) => {
        headers = new Headers(init?.headers);
        return site.fetch(input, init);
      },
    });
    expect(headers?.get("user-agent")).toBe("TestBot/1.0");
    expect(headers?.get("accept")).toBe("text/html,application/xhtml+xml");
  });

  it("skips anything that is not HTML", async () => {
    const { outcome } = await run({
      [URL_]: { body: "{}", headers: { "content-type": "application/json" } },
    });
    expect(outcome).toMatchObject({ kind: "skipped", reason: "content-type" });
  });

  it("skips a body that declares itself too large", async () => {
    const { outcome } = await run({
      [URL_]: {
        body: "<html></html>",
        headers: { "content-length": "9999999" },
      },
    });
    expect(outcome).toMatchObject({ kind: "skipped", reason: "too-large" });
  });

  it("skips a body that turns out to be too large while reading", async () => {
    const site = new FakeSite({});
    const outcome = await fetchPage({
      url: URL_,
      host: HOST,
      userAgent: "TestBot/1.0",
      fetch: async () => streamed("x".repeat(5000)),
      sleep: async () => {},
      maxBytes: 1000,
    });
    expect(site.requests).toEqual([]);
    expect(outcome).toMatchObject({ kind: "skipped", reason: "too-large" });
  });

  it("skips a redirect that leaves the host", async () => {
    const { outcome } = await run({
      [URL_]: { redirectTo: "https://other.example/x" },
      "https://other.example/x": { body: "<html></html>" },
    });
    expect(outcome).toEqual({
      kind: "skipped",
      url: URL_,
      status: 200,
      reason: "offsite-redirect",
    });
  });

  it("follows a redirect onto the www host", async () => {
    const { outcome } = await run({
      [URL_]: { redirectTo: "https://www.example.com/a" },
      "https://www.example.com/a": { body: "<html>a</html>" },
    });
    expect(outcome).toMatchObject({
      kind: "ok",
      url: "https://www.example.com/a",
    });
  });

  it("reports the URL it landed on after a same-host redirect", async () => {
    const { outcome } = await run({
      [URL_]: { redirectTo: "https://example.com/b" },
      "https://example.com/b": { body: "<html>b</html>" },
    });
    expect(outcome).toMatchObject({ kind: "ok", url: "https://example.com/b" });
  });

  it("retries a 5xx twice and then fails with the status", async () => {
    const { outcome, sleeps, site } = await run({
      [URL_]: { status: 500, body: "boom" },
    });
    expect(sleeps).toEqual([250, 1000]);
    expect(site.countOf(URL_)).toBe(3);
    expect(outcome).toEqual({ kind: "failed", status: 500, error: "HTTP 500" });
  });

  it("retries a 5xx that recovers", async () => {
    const { outcome, sleeps } = await run({
      [URL_]: [{ status: 500, body: "boom" }, { body: "<html>ok</html>" }],
    });
    expect(sleeps).toEqual([250]);
    expect(outcome).toMatchObject({ kind: "ok", html: "<html>ok</html>" });
  });

  it("retries a transport error and then fails without a status", async () => {
    const sleeps: number[] = [];
    const outcome = await fetchPage({
      url: URL_,
      host: HOST,
      userAgent: "TestBot/1.0",
      fetch: async () => {
        throw new Error("socket hang up");
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([250, 1000]);
    expect(outcome).toEqual({ kind: "failed", error: "socket hang up" });
  });

  it("fails a 4xx without retrying", async () => {
    const { outcome, sleeps, site } = await run({
      [URL_]: { status: 404, body: "gone" },
    });
    expect(sleeps).toEqual([]);
    expect(site.countOf(URL_)).toBe(1);
    expect(outcome).toEqual({ kind: "failed", status: 404, error: "HTTP 404" });
  });

  it("hands 429 and 503 back with Retry-After", async () => {
    const limited = await run({
      [URL_]: { status: 429, headers: { "retry-after": "3" }, body: "slow" },
    });
    expect(limited.outcome).toEqual({
      kind: "rate-limited",
      status: 429,
      retryAfterSeconds: 3,
    });
    const unavailable = await run({ [URL_]: { status: 503, body: "later" } });
    expect(unavailable.outcome).toEqual({ kind: "rate-limited", status: 503 });
  });
});

/** A response whose body only arrives in chunks, to exercise the size cap. */
function streamed(body: string) {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += 100) {
        controller.enqueue(bytes.slice(at, at + 100));
      }
      controller.close();
    },
  });
  const response = new Response(stream, {
    headers: { "content-type": "text/html" },
  });
  Object.defineProperty(response, "url", { value: URL_ });
  return response;
}
