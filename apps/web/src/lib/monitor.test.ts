import { describe, expect, it } from "vitest";
import { minutesUntilRecrawl, recrawlOpensAt } from "./monitor";

const WRITTEN = "2026-09-14T10:00:00.000Z";

describe("recrawl cooldown", () => {
  it("opens an hour after the file was written", () => {
    expect(recrawlOpensAt(WRITTEN)).toBe("2026-09-14T11:00:00.000Z");
  });

  it("rounds the wait up to whole minutes and stops at zero", () => {
    const opensAt = recrawlOpensAt(WRITTEN);
    expect(
      minutesUntilRecrawl(opensAt, Date.parse("2026-09-14T10:12:30.000Z")),
    ).toBe(48);
    expect(
      minutesUntilRecrawl(opensAt, Date.parse("2026-09-14T10:59:59.000Z")),
    ).toBe(1);
    expect(
      minutesUntilRecrawl(opensAt, Date.parse("2026-09-14T11:00:00.000Z")),
    ).toBe(0);
    expect(
      minutesUntilRecrawl(opensAt, Date.parse("2026-09-15T00:00:00.000Z")),
    ).toBe(0);
  });
});
