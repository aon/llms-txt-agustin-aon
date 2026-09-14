import { describe, expect, it } from "vitest";
import {
  cleanLine,
  cleanNote,
  cleanTitle,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
} from "./text.js";

describe("cleanTitle", () => {
  it("strips every brand separator a site uses", () => {
    expect(cleanTitle("About | Acme", "Acme")).toBe("About");
    expect(cleanTitle("About - Acme", "Acme")).toBe("About");
    expect(cleanTitle("About – Acme", "Acme")).toBe("About");
    expect(cleanTitle("About — Acme", "Acme")).toBe("About");
  });

  it("leaves a title that does not end with the brand alone", () => {
    expect(cleanTitle("Acme | About", "Acme")).toBe("Acme | About");
    expect(cleanTitle("About | Other", "Acme")).toBe("About | Other");
    expect(cleanTitle("About|Acme", "Acme")).toBe("About|Acme");
  });

  it("keeps a title that is only the brand", () => {
    expect(cleanTitle("Acme", "Acme")).toBe("Acme");
    expect(cleanTitle("Acme | Acme", "Acme")).toBe("Acme");
  });

  it("collapses whitespace and escapes brackets", () => {
    expect(cleanTitle("  Getting\n  started  ", undefined)).toBe(
      "Getting started",
    );
    expect(cleanTitle("Config [beta]", undefined)).toBe("Config \\[beta\\]");
    expect(cleanTitle("A \\ B", undefined)).toBe("A \\\\ B");
  });

  it("strips the section name left behind by the brand", () => {
    expect(cleanTitle("Getting Started | Guide | Acme", "Acme", "Guide")).toBe(
      "Getting Started",
    );
    expect(cleanTitle("Browser Mode - guide", "Acme", "Guide")).toBe(
      "Browser Mode",
    );
    expect(cleanTitle("Guide | Acme", "Acme", "Guide")).toBe("Guide");
  });

  it("caps a long title at a word boundary", () => {
    const title = cleanTitle(`${"word ".repeat(40)}end`, undefined);
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(title.endsWith(" word…")).toBe(true);
  });
});

describe("cleanNote", () => {
  it("drops an empty, missing or title-equal note", () => {
    expect(cleanNote(undefined, "Docs")).toBeUndefined();
    expect(cleanNote("   ", "Docs")).toBeUndefined();
    expect(cleanNote("docs", "Docs")).toBeUndefined();
  });

  it("drops cookie and consent boilerplate", () => {
    expect(
      cleanNote("We use cookies to improve your visit.", "Support"),
    ).toBeUndefined();
    expect(
      cleanNote("Manage your consent preferences here.", "Support"),
    ).toBeUndefined();
  });

  it("keeps the word cookie when it is what the page is about", () => {
    const late = `${"a".repeat(70)} cookies`;
    expect(cleanNote(late, "Recipes")).toBe(late);
  });

  it("caps a long note at a word boundary", () => {
    const note = cleanNote(`${"word ".repeat(80)}end`, "Docs") ?? "";
    expect(note.length).toBeLessThanOrEqual(MAX_NOTE_LENGTH);
    expect(note.endsWith("…")).toBe(true);
  });

  it("ends a long note on the last full sentence that fits", () => {
    const first = `${"word ".repeat(30)}end.`;
    const note = cleanNote(`${first} ${"more ".repeat(40)}tail.`, "Docs");
    expect(note).toBe(first);
  });

  it("falls back to a word cut when the only sentence end is too early", () => {
    const note = cleanNote(`Short. ${"word ".repeat(80)}end`, "Docs") ?? "";
    expect(note.startsWith("Short. word")).toBe(true);
    expect(note.endsWith("…")).toBe(true);
  });
});

describe("cleanLine", () => {
  it("keeps a short line untouched", () => {
    expect(cleanLine(" one  two ", 100)).toBe("one two");
  });

  it("cuts mid-word only when there is no space to cut at", () => {
    expect(cleanLine("a".repeat(20), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
