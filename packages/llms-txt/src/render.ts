import type { CrawlSnapshot } from "@llms-txt/core";
import type { Enrichment } from "./enrichment.js";
import {
  type Link,
  OPTIONAL_SECTION,
  RENDER_LIMITS,
  type RenderLimits,
  selectLinks,
} from "./select.js";
import {
  cleanLine,
  MAX_LABEL_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
} from "./text.js";

export interface RenderOptions {
  enrichment?: Enrichment;
  limits?: Partial<RenderLimits>;
}

export function render(snapshot: CrawlSnapshot, options: RenderOptions = {}) {
  const limits = { ...RENDER_LIMITS, ...options.limits };
  const selection = selectLinks(snapshot, limits);
  const blocks = [`# ${headingOf(snapshot)}`];

  const summary = summaryOf(snapshot, options.enrichment);
  if (summary) blocks.push(`> ${summary}`);
  blocks.push(...(options.enrichment?.about ?? []));
  const taken = new Set<string>();
  for (const section of selection.sections) {
    blocks.push(
      block(labelOf(section.name, options.enrichment, taken), section.links),
    );
  }
  if (selection.optional.length > 0) {
    blocks.push(block(OPTIONAL_SECTION, selection.optional));
  }
  return `${blocks.join("\n\n")}\n`;
}

function headingOf(snapshot: CrawlSnapshot) {
  return cleanLine(snapshot.siteTitle, MAX_TITLE_LENGTH) || snapshot.host;
}

function summaryOf(
  snapshot: CrawlSnapshot,
  enrichment: Enrichment | undefined,
) {
  const raw = enrichment?.summary ?? snapshot.siteDescription;
  return raw ? cleanLine(raw, MAX_SUMMARY_LENGTH) : "";
}

/** A label that repeats or takes the spec's keyword would break the file. */
function labelOf(
  name: string,
  enrichment: Enrichment | undefined,
  taken: Set<string>,
) {
  const crawled = cleanLine(name, MAX_LABEL_LENGTH);
  const label = cleanLine(
    enrichment?.sectionLabels[name] ?? name,
    MAX_LABEL_LENGTH,
  );
  const chosen =
    !label || label === OPTIONAL_SECTION || taken.has(label) ? crawled : label;
  taken.add(chosen);
  return chosen;
}

function block(name: string, links: readonly Link[]) {
  const lines = links.map(
    (link) =>
      `- [${link.title}](${link.url})${link.note ? `: ${link.note}` : ""}`,
  );
  return `## ${name}\n\n${lines.join("\n")}`;
}
