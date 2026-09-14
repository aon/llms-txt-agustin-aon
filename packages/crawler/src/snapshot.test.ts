import type { Page } from "@llms-txt/core";
import { describe, expect, it } from "vitest";
import { buildSnapshot, siteNameFrom } from "./snapshot.js";

describe("the site name", () => {
  it("is the brand the page titles repeat", () => {
    expect(
      nameOf("www.acme.dev", [
        ["/", "Acme: build for the agent era"],
        ["/docs", "Docs | Acme"],
        ["/blog", "Blog | Acme"],
      ]),
    ).toBe("Acme");
  });

  it("is the segment the homepage tagline hangs off", () => {
    expect(nameOf("acme.dev", [["/", "Acme: build for the agent era"]])).toBe(
      "Acme",
    );
    expect(
      nameOf("vitest.dev", [
        ["/", "Vitest | Next Generation testing framework"],
      ]),
    ).toBe("Vitest");
  });

  it("skips a generic lead segment for the name after it", () => {
    expect(nameOf("acme.dev", [["/", "Home | Acme"]])).toBe("Acme");
    expect(nameOf("acme.dev", [["/", "Welcome: Acme"]])).toBe("Acme");
  });

  it("falls back to the humanized host", () => {
    expect(nameOf("my-small-site.example.com", [["/docs", ""]])).toBe(
      "My Small Site",
    );
  });

  it("is what the snapshot calls the site", () => {
    const snapshot = buildSnapshot({
      site: { host: "acme.dev", origin: "https://acme.dev" },
      crawlId: "01TEST",
      generatedAt: "2026-09-12T10:00:00.000Z",
      pages: pages("acme.dev", [
        ["/", "Acme: build for the agent era"],
        ["/docs", "Docs | Acme"],
        ["/blog", "Blog | Acme"],
      ]),
      sitePages: [],
      sections: [],
      startedAt: "2026-09-12T09:00:00.000Z",
      changed: 0,
    });
    expect(snapshot.siteTitle).toBe("Acme");
    expect(snapshot.brand).toBe("Acme");
  });
});

function nameOf(host: string, titles: ReadonlyArray<[string, string]>) {
  return siteNameFrom(pages(host, titles), host);
}

function pages(host: string, titles: ReadonlyArray<[string, string]>) {
  return titles.map(([path, title]): Page => {
    const page: Page = {
      url: `https://${host}${path}`,
      path,
      depth: path === "/" ? 0 : 1,
      crawlId: "01TEST",
      status: "fetched",
      eligible: true,
      firstSeenAt: "2026-09-12T09:00:00.000Z",
      lastSeenAt: "2026-09-12T10:00:00.000Z",
    };
    if (title) page.title = title;
    return page;
  });
}
