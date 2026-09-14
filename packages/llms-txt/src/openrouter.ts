import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Enricher, EnrichmentRequest } from "./enrichment.js";
import {
  MAX_ABOUT_PARAGRAPHS,
  MAX_LABEL_LENGTH,
  MAX_SUMMARY_LENGTH,
} from "./text.js";

export const OPENROUTER_MODEL = "openai/gpt-5.6-luna";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 60_000;

/** Strict mode allows no optional keys and no free-form records, hence the pairs. */
const answerSchema = z.object({
  summary: z.string(),
  about: z.array(z.string()),
  sectionLabels: z.array(z.object({ section: z.string(), label: z.string() })),
});

export interface OpenRouterOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export class OpenRouterEnricher implements Enricher {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenRouterOptions) {
    this.model = options.model ?? OPENROUTER_MODEL;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: OPENROUTER_BASE_URL,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async enrich(request: EnrichmentRequest): Promise<unknown> {
    const completion = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(request) },
      ],
      response_format: zodResponseFormat(answerSchema, "enrichment"),
    });
    const answer = completion.choices[0]?.message.parsed;
    if (!answer) throw new Error("OpenRouter answered without an enrichment");
    return {
      summary: answer.summary,
      about: answer.about,
      sectionLabels: Object.fromEntries(
        answer.sectionLabels.map(({ section, label }) => [section, label]),
      ),
    };
  }
}

const SYSTEM_PROMPT = `You write the prose of an llms.txt file, the Markdown index a website publishes so that language models know what the site is and where to look.

You receive one JSON object: the site (host, title, meta description, brand, and landingText, the main text of the landing page) plus the list of sections and the pages in each one, with titles and meta descriptions. The landing text is your main source. Do not invent facts that are not in the input.

Answer with:
- summary: one sentence, at most ${MAX_SUMMARY_LENGTH} characters, saying what the site is and who it is for.
- about: up to ${MAX_ABOUT_PARAGRAPHS} short paragraphs of plain prose about the site itself: what the product or organisation is, who it is for, and what each part of the site covers. Talk about the site, never about this file, its sections or its structure, and do not tell the reader what to read first. No headings, no lists, no links, no Markdown. An empty array is fine.
- sectionLabels: pairs of a section name exactly as given and a label of one to three words, at most ${MAX_LABEL_LENGTH} characters. Rename a section only when its name is a URL slug or would mislead a reader. A name that is already a clear word stays as it is, so most of the time this array is empty.

Write in the language the site is written in. Never mention that you are a model or that this file was generated.`;
