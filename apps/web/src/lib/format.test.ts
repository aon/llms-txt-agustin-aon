import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatFullDate,
  formatLocalDate,
  formatOrigin,
  formatRelative,
  skipLabel,
} from "./format";

describe("format", () => {
  it("formats dates in the given locale and time zone", () => {
    const iso = "2026-09-14T21:58:17.123Z";
    expect(formatLocalDate(iso, { locale: "en-US", timeZone: "UTC" })).toBe(
      "Sep 14, 2026",
    );
    expect(
      formatLocalDate(iso, {
        time: true,
        locale: "en-US",
        timeZone: "America/Argentina/Buenos_Aires",
      }),
    ).toContain("6:58");
  });

  it("spells out the full date, time and zone", () => {
    expect(
      formatFullDate("2026-09-14T21:58:17.123Z", {
        locale: "en-US",
        timeZone: "UTC",
      }),
    ).toMatch(/^Monday, September 14, 2026 at 9:58:17\s?PM UTC$/);
  });

  it("says how long ago in English, in the largest whole unit", () => {
    const now = Date.parse("2026-09-14T12:00:00Z");
    const ago = (seconds: number) =>
      formatRelative(new Date(now - seconds * 1000).toISOString(), now);
    expect(ago(20)).toBe("just now");
    expect(ago(-30)).toBe("just now");
    expect(ago(5 * 60)).toBe("5 minutes ago");
    expect(ago(59 * 60 + 59)).toBe("59 minutes ago");
    expect(ago(3 * 3_600)).toBe("3 hours ago");
    expect(ago(36 * 3_600)).toBe("yesterday");
    expect(ago(15 * 86_400)).toBe("2 weeks ago");
    expect(ago(400 * 86_400)).toBe("last year");
  });

  it("drops the https scheme but keeps http", () => {
    expect(formatOrigin("https://cloudflare.com")).toBe("cloudflare.com");
    expect(formatOrigin("http://example.com:8080")).toBe(
      "http://example.com:8080",
    );
  });

  it("formats durations under and over a minute", () => {
    expect(formatDuration(6_140)).toBe("6.1s");
    expect(formatDuration(125_400)).toBe("2m 05s");
  });

  it("names known skip reasons and echoes unknown ones", () => {
    expect(skipLabel("robots")).toBe("Disallowed by robots.txt");
    expect(skipLabel("weird")).toBe("Skipped: weird");
    expect(skipLabel(undefined)).toBe("Skipped");
  });
});
