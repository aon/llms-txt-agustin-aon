import type { CrawlSnapshot } from "@llms-txt/core";
import {
  buildEnrichmentRequest,
  EMPTY_ENRICHMENT,
  type Enricher,
  sanitizeEnrichment,
} from "./enrichment.js";
import { type RenderOptions, render } from "./render.js";

export interface GenerateOptions {
  enricher?: Enricher;
  limits?: RenderOptions["limits"];
  /** Called when the model fails; the file is still written from the crawl. */
  onEnrichError?: (error: unknown) => void;
}

/** Generates a standard llms.txt file. */
export async function generateLlmsTxt(
  snapshot: CrawlSnapshot,
  options: GenerateOptions = {},
) {
  const enrichment = options.enricher
    ? await enrich(snapshot, options.enricher, options.onEnrichError)
    : EMPTY_ENRICHMENT;
  const renderOptions: RenderOptions = { enrichment };
  if (options.limits) renderOptions.limits = options.limits;
  return render(snapshot, renderOptions);
}

async function enrich(
  snapshot: CrawlSnapshot,
  enricher: Enricher,
  onError: GenerateOptions["onEnrichError"],
) {
  const request = buildEnrichmentRequest(snapshot);
  try {
    return sanitizeEnrichment(await enricher.enrich(request), request);
  } catch (error) {
    onError?.(error);
    return EMPTY_ENRICHMENT;
  }
}
