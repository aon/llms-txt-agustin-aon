import type { CrawlSnapshot, SnapshotPage } from "@llms-txt/core";
import { z } from "zod";
import {
  collapse,
  MAX_ABOUT_LENGTH,
  MAX_ABOUT_PARAGRAPHS,
  MAX_LABEL_LENGTH,
  MAX_SUMMARY_LENGTH,
  truncate,
} from "./text.js";

export const enrichmentSchema = z.object({
  summary: z.string().optional(),
  /** Free paragraphs between the summary and the link sections. */
  about: z.array(z.string()).default([]),
  sectionLabels: z.record(z.string(), z.string()).default({}),
});

export type Enrichment = z.output<typeof enrichmentSchema>;

const BLOCK_MARKERS = /^[\s#>*-]+/;

export const enrichmentRequestSchema = z.object({
  site: z.object({
    host: z.string(),
    origin: z.string(),
    title: z.string(),
    description: z.string().optional(),
    brand: z.string().optional(),
    landingText: z.string().optional(),
  }),
  sections: z.array(z.string()),
  pages: z.array(
    z.object({
      path: z.string(),
      url: z.string(),
      title: z.string(),
      section: z.string(),
      description: z.string().optional(),
    }),
  ),
});

export type EnrichmentRequest = z.output<typeof enrichmentRequestSchema>;

export const EMPTY_ENRICHMENT: Enrichment = Object.freeze({
  about: [],
  sectionLabels: {},
});

/** The LLM only ever answers with words; it never sees or picks a URL. */
export interface Enricher {
  enrich(request: EnrichmentRequest): Promise<unknown>;
}

export interface BuildEnrichmentRequestOptions {
  maxPages?: number;
}

/** The landing is the one page the model reads; the rest is titles and paths. */
export function buildEnrichmentRequest(
  snapshot: CrawlSnapshot,
  options: BuildEnrichmentRequestOptions = {},
) {
  const sections: string[] = [];
  const pages: EnrichmentRequest["pages"] = [];
  for (const section of snapshot.sections) {
    const inFile = section.pages.filter((page) => page.inFile);
    if (inFile.length === 0) continue;
    sections.push(section.name);
    for (const page of inFile) pages.push(toRequestPage(page, section.name));
  }
  const request: EnrichmentRequest = {
    site: siteOf(snapshot),
    sections,
    pages:
      options.maxPages === undefined ? pages : pages.slice(0, options.maxPages),
  };
  return request;
}

export function sanitizeEnrichment(raw: unknown, request: EnrichmentRequest) {
  const parsed = enrichmentSchema.safeParse(raw);
  if (!parsed.success) return emptyEnrichment();

  const sections = new Set(request.sections);
  const enrichment: Enrichment = {
    about: paragraphsOf(parsed.data.about),
    sectionLabels: pick(parsed.data.sectionLabels, sections, MAX_LABEL_LENGTH),
  };
  const summary = shorten(parsed.data.summary, MAX_SUMMARY_LENGTH);
  if (summary) enrichment.summary = summary;
  return enrichment;
}

function toRequestPage(page: SnapshotPage, section: string) {
  const item: EnrichmentRequest["pages"][number] = {
    path: page.path,
    url: page.url,
    title: page.title,
    section,
  };
  if (page.description) item.description = page.description;
  return item;
}

function siteOf(snapshot: CrawlSnapshot) {
  const site: EnrichmentRequest["site"] = {
    host: snapshot.host,
    origin: snapshot.origin,
    title: snapshot.siteTitle,
  };
  if (snapshot.siteDescription) site.description = snapshot.siteDescription;
  if (snapshot.brand) site.brand = snapshot.brand;
  if (snapshot.landingText) site.landingText = snapshot.landingText;
  return site;
}

/** A heading, quote or list here would change what the file says: prose only. */
function paragraphsOf(about: readonly string[]) {
  const paragraphs: string[] = [];
  let room = MAX_ABOUT_LENGTH;
  for (const block of about) {
    if (paragraphs.length >= MAX_ABOUT_PARAGRAPHS || room <= 0) break;
    const paragraph = truncate(
      collapse(block.replace(BLOCK_MARKERS, "")),
      room,
    );
    if (!paragraph) continue;
    paragraphs.push(paragraph);
    room -= paragraph.length;
  }
  return paragraphs;
}

function pick(
  values: Readonly<Record<string, string>>,
  allowed: ReadonlySet<string>,
  max: number,
) {
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    const shortened = shorten(value, max);
    if (shortened) picked[key] = shortened;
  }
  return picked;
}

function shorten(value: string | undefined, max: number) {
  return value === undefined ? "" : truncate(collapse(value), max);
}

function emptyEnrichment() {
  const enrichment: Enrichment = { about: [], sectionLabels: {} };
  return enrichment;
}
