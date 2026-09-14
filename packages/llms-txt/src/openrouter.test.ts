import { describe, expect, it, vi } from "vitest";
import { buildEnrichmentRequest } from "./enrichment.js";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  OpenRouterEnricher,
} from "./openrouter.js";
import { loadFixture } from "./test/snapshot.js";

const request = buildEnrichmentRequest(loadFixture("docs-site"));

describe("OpenRouterEnricher", () => {
  it("posts the request with a strict schema and maps the answer", async () => {
    const fetch = vi.fn(async () =>
      completion({
        summary: "Acme.",
        about: ["Read the docs."],
        sectionLabels: [{ section: "Docs", label: "Documentation" }],
      }),
    );
    const enricher = new OpenRouterEnricher({ apiKey: "sk-test", fetch });

    expect(await enricher.enrich(request)).toEqual({
      summary: "Acme.",
      about: ["Read the docs."],
      sectionLabels: { Docs: "Documentation" },
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${OPENROUTER_BASE_URL}/chat/completions`);
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer sk-test",
    );
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(OPENROUTER_MODEL);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(JSON.parse(body.messages[1].content)).toEqual(request);
  });

  it("throws on an HTTP error so the caller falls back", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 401 }));
    const enricher = new OpenRouterEnricher({ apiKey: "sk-test", fetch });
    await expect(enricher.enrich(request)).rejects.toThrow("401");
  });

  it("throws when the model refuses instead of answering", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        choices: [{ message: { refusal: "No.", content: null } }],
      }),
    );
    const enricher = new OpenRouterEnricher({ apiKey: "sk-test", fetch });
    await expect(enricher.enrich(request)).rejects.toThrow();
  });
});

function completion(answer: unknown) {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(answer) } }],
  });
}
