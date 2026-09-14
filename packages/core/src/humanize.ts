/** "getting-started" becomes "Getting Started"; known acronyms keep their case. */
export function humanize(segment: string) {
  const words = decodeSegment(segment)
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.map(capitalize).join(" ");
}

const ACRONYMS: Readonly<Record<string, string>> = Object.freeze({
  api: "API",
  faq: "FAQ",
  sdk: "SDK",
  cli: "CLI",
  ui: "UI",
});

/** A path segment may hold a bare percent sign, which is not valid escaping. */
function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function capitalize(word: string) {
  const lower = word.toLowerCase();
  return ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}
