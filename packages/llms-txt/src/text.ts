import { humanize } from "@llms-txt/core";

export const MAX_SUMMARY_LENGTH = 300;
export const MAX_TITLE_LENGTH = 120;
export const MAX_NOTE_LENGTH = 250;
export const MAX_LABEL_LENGTH = 80;
export const MAX_ABOUT_LENGTH = 1200;
export const MAX_ABOUT_PARAGRAPHS = 2;

/** The separators a site puts between a page title and the name after it. */
const BRAND_SEPARATORS = [" | ", " - ", " – ", " — "];
const BOILERPLATE = /\b(cookies?|consent)\b/i;
const BOILERPLATE_WINDOW = 60;
const SENTENCE_END = /[.!?](?=\s)/g;

export function cleanTitle(
  raw: string,
  brand: string | undefined,
  section?: string,
) {
  const named = stripSuffix(collapse(raw), brand);
  return cleanLine(stripSuffix(named, section), MAX_TITLE_LENGTH);
}

/** Undefined means the link carries no note at all. */
export function cleanNote(raw: string | undefined, title: string) {
  const collapsed = collapse(raw ?? "");
  if (!collapsed) return undefined;
  if (BOILERPLATE.test(collapsed.slice(0, BOILERPLATE_WINDOW)))
    return undefined;
  const note = escapeInline(truncateAtSentence(collapsed, MAX_NOTE_LENGTH));
  if (!note || restatesTitle(note, title)) return undefined;
  return note;
}

/** The last path segment as words, for a page whose title says nothing on its own. */
export function titleFromPath(path: string) {
  const segments = path.split("?")[0]?.split("/").filter(Boolean) ?? [];
  return cleanLine(humanize(segments.at(-1) ?? ""), MAX_TITLE_LENGTH);
}

/** A note the title already contains, or the title plus a word or two, adds nothing. */
function restatesTitle(note: string, title: string) {
  const lowerNote = note.toLowerCase();
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes(lowerNote)) return true;
  if (!lowerNote.includes(lowerTitle)) return false;
  return wordCount(lowerNote) - wordCount(lowerTitle) <= 2;
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

/** A note that ends on a full stop reads better than one cut mid-clause. */
export function truncateAtSentence(value: string, max: number) {
  if (value.length <= max) return value;
  let end = -1;
  for (const match of value.matchAll(SENTENCE_END)) {
    if (match.index >= max) break;
    end = match.index;
  }
  if (end + 1 < max / 2) return truncate(value, max);
  return value.slice(0, end + 1);
}

export function cleanLine(raw: string, max: number) {
  return escapeInline(truncate(collapse(raw), max));
}

export function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  const head = value.slice(0, max - 1);
  const cut = head.lastIndexOf(" ");
  return `${(cut > 0 ? head.slice(0, cut) : head).trimEnd()}…`;
}

export function escapeInline(value: string) {
  return value.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

export function unescapeInline(value: string) {
  return value.replace(/\\([\\[\]])/g, "$1");
}

/** Some sites append the brand twice, so this strips until nothing matches. */
function stripSuffix(title: string, name: string | undefined) {
  if (!name) return title;
  let current = title;
  while (true) {
    const stripped = stripOnce(current, name);
    if (stripped === current) return current;
    current = stripped;
  }
}

function stripOnce(title: string, name: string) {
  const lower = title.toLowerCase();
  for (const separator of BRAND_SEPARATORS) {
    const tail = `${separator}${name}`.toLowerCase();
    if (!lower.endsWith(tail)) continue;
    const stripped = title.slice(0, -tail.length).trim();
    if (stripped) return stripped;
  }
  return title;
}
