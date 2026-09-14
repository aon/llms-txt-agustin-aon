import { describe, expect, it, vi } from "vitest";
import type { Enricher } from "./enrichment.js";
import { generateLlmsTxt } from "./generate.js";
import { render } from "./render.js";
import { loadFixture } from "./test/snapshot.js";

const snapshot = loadFixture("docs-site");

describe("generateLlmsTxt", () => {
  it("writes the file from the crawl alone when there is no enricher", async () => {
    expect(await generateLlmsTxt(snapshot)).toBe(render(snapshot));
  });

  it("hands the model the landing and writes what it answered", async () => {
    const enricher = fake(async (request) => ({
      summary: `About ${request.site.title}.`,
      about: ["Read the docs first."],
      sectionLabels: { Docs: "Documentation" },
    }));
    const text = await generateLlmsTxt(snapshot, { enricher });
    expect(text).toContain("> About Acme.");
    expect(text).toContain("\n\nRead the docs first.\n\n");
    expect(text).toContain("## Documentation");
    expect(enricher.enrich).toHaveBeenCalledOnce();
    expect(enricher.enrich.mock.calls[0]?.[0].site.landingText).toContain(
      "Acme builds small tools",
    );
  });

  it("still writes the file when the model throws", async () => {
    const onEnrichError = vi.fn();
    const enricher = fake(async () => {
      throw new Error("timeout");
    });
    const text = await generateLlmsTxt(snapshot, { enricher, onEnrichError });
    expect(text).toBe(render(snapshot));
    expect(onEnrichError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("still writes the file when the model answers nonsense", async () => {
    const enricher = fake(async () => "not even an object");
    expect(await generateLlmsTxt(snapshot, { enricher })).toBe(
      render(snapshot),
    );
  });
});

function fake(enrich: Enricher["enrich"]) {
  return { enrich: vi.fn(enrich) };
}
