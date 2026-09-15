import { describe, expect, it } from "vitest";
import { countByStatus, isThin, pageChange, sectionCount } from "./pages";

const START = "2026-09-14T10:00:00.000Z";

describe("pageChange", () => {
  it("is added when first seen by this crawl, changed when its text moved", () => {
    expect(pageChange({ status: "fetched", firstSeenAt: START }, START)).toBe(
      "added",
    );
    expect(
      pageChange(
        {
          status: "fetched",
          firstSeenAt: "2026-09-01T00:00:00.000Z",
          lastChangedAt: "2026-09-14T10:00:05.000Z",
        },
        START,
      ),
    ).toBe("changed");
    expect(
      pageChange(
        { status: "fetched", firstSeenAt: "2026-09-01T00:00:00.000Z" },
        START,
      ),
    ).toBeUndefined();
    expect(pageChange({ status: "skipped", firstSeenAt: START }, START)).toBe(
      undefined,
    );
  });
});

describe("counts", () => {
  it("tallies statuses and sections", () => {
    const pages = [
      { status: "fetched", eligible: true, section: "Docs", wordCount: 500 },
      { status: "fetched", eligible: true, section: "Docs", wordCount: 10 },
      { status: "fetched", eligible: false, section: "Blog", wordCount: 90 },
      { status: "skipped", eligible: false, wordCount: 0 },
      { status: "queued", eligible: false },
    ] as const;
    expect(countByStatus(pages)).toEqual({
      queued: 1,
      fetched: 3,
      skipped: 1,
      failed: 0,
    });
    expect(sectionCount(pages)).toBe(1);
    expect(isThin(pages)).toBe(false);
  });

  it("flags a site whose every page is nearly empty", () => {
    expect(
      isThin([
        { status: "fetched", wordCount: 3 },
        { status: "fetched", wordCount: 0 },
      ]),
    ).toBe(true);
    expect(isThin([])).toBe(false);
  });
});
