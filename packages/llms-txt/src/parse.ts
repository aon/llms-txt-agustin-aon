import { unescapeInline } from "./text.js";

const H1 = /^#\s*(.*)$/;
const H2 = /^##\s*(.*)$/;
const DEEP_HEADING = /^#{3,}/;
const BLOCKQUOTE = /^>\s?(.*)$/;
const LIST_ITEM = /^-\s+(.*)$/;
const LINK_ITEM = /^\[((?:\\.|[^\\\]])*)\]\((\S+?)\)(?::\s+(.*))?$/;

export interface ParsedSection {
  name: string;
  links: Array<{ title: string; url: string; note?: string }>;
}

export interface ParsedLlmsTxt {
  title: string;
  summary?: string;
  /** The prose between the summary and the first section, paragraph by paragraph. */
  about: string[];
  sections: ParsedSection[];
}

/** Strict on purpose: it is the oracle the renderer is tested against. */
export function parseLlmsTxt(text: string) {
  const parsed: ParsedLlmsTxt = { title: "", about: [], sections: [] };
  const summary: string[] = [];
  let seenH1 = false;
  let quotable = false;
  let section: ParsedSection | undefined;

  for (const line of text.split(/\r?\n/)) {
    if (DEEP_HEADING.test(line))
      throw new LlmsTxtFormatError("Heading deeper than H2");
    const trimmed = line.trimEnd();
    if (trimmed === "") continue;

    const h2 = H2.exec(trimmed)?.[1]?.trim();
    if (h2 !== undefined) {
      if (!seenH1) throw new LlmsTxtFormatError("A section before the H1");
      if (!h2) throw new LlmsTxtFormatError("An H2 with no name");
      quotable = false;
      section = { name: unescapeInline(h2), links: [] };
      parsed.sections.push(section);
      continue;
    }

    const h1 = H1.exec(trimmed)?.[1]?.trim();
    if (h1 !== undefined) {
      if (seenH1) throw new LlmsTxtFormatError("More than one H1");
      if (!h1) throw new LlmsTxtFormatError("An H1 with no name");
      parsed.title = unescapeInline(h1);
      seenH1 = true;
      quotable = true;
      continue;
    }
    if (!seenH1) throw new LlmsTxtFormatError("The file must start with an H1");

    const quoted = BLOCKQUOTE.exec(trimmed)?.[1];
    if (quoted !== undefined) {
      if (!quotable)
        throw new LlmsTxtFormatError("A blockquote away from the H1");
      summary.push(quoted.trim());
      continue;
    }
    quotable = false;

    const item = LIST_ITEM.exec(trimmed)?.[1];
    if (section === undefined) {
      if (item === undefined) parsed.about.push(trimmed.trim());
      continue;
    }
    if (item !== undefined) section.links.push(parseLink(item));
  }

  if (!seenH1) throw new LlmsTxtFormatError("The file has no H1");
  const joined = summary.join(" ").trim();
  if (joined) parsed.summary = unescapeInline(joined);
  return parsed;
}

export class LlmsTxtFormatError extends Error {
  override readonly name = "LlmsTxtFormatError";
}

function parseLink(item: string) {
  const match = LINK_ITEM.exec(item);
  if (!match) throw new LlmsTxtFormatError(`Not a link item: - ${item}`);
  const [, title = "", url = "", note] = match;
  const link: ParsedSection["links"][number] = {
    title: unescapeInline(title),
    url,
  };
  if (note !== undefined) link.note = unescapeInline(note);
  return link;
}
