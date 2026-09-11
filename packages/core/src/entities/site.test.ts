import { describe, expect, it } from "vitest";
import { siteGsi2Keys, siteKeys } from "./site.js";

describe("site keys", () => {
  it("lives under the site partition with a fixed sort key", () => {
    expect(siteKeys("example.com")).toEqual({
      pk: "SITE#example.com",
      sk: "SITE",
    });
  });

  it("builds GSI2 keys under the schedule partition", () => {
    expect(siteGsi2Keys("2026-09-12T00:00:00.000Z", "example.com")).toEqual({
      gsi2pk: "SCHEDULE",
      gsi2sk: "2026-09-12T00:00:00.000Z#example.com",
    });
  });
});
