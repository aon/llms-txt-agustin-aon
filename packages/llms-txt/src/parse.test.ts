import { describe, expect, it } from "vitest";
import { LlmsTxtFormatError, parseLlmsTxt } from "./parse.js";

const FILE = `# Acme

> Small tools that do one job.

Some free prose about the site.

## Docs

- [Getting Started](https://acme.dev/docs/start): How to install it.
- [API](https://acme.dev/docs/api)

## Optional

- [Privacy](https://acme.dev/privacy): The legal one.
`;

describe("parseLlmsTxt", () => {
  it("reads the title, the summary and every section", () => {
    expect(parseLlmsTxt(FILE)).toEqual({
      title: "Acme",
      summary: "Small tools that do one job.",
      about: ["Some free prose about the site."],
      sections: [
        {
          name: "Docs",
          links: [
            {
              title: "Getting Started",
              url: "https://acme.dev/docs/start",
              note: "How to install it.",
            },
            { title: "API", url: "https://acme.dev/docs/api" },
          ],
        },
        {
          name: "Optional",
          links: [
            {
              title: "Privacy",
              url: "https://acme.dev/privacy",
              note: "The legal one.",
            },
          ],
        },
      ],
    });
  });

  it("joins a blockquote written over several lines", () => {
    expect(parseLlmsTxt("# A\n\n> one\n> two\n").summary).toBe("one two");
  });

  it("unescapes what the renderer escaped", () => {
    const parsed = parseLlmsTxt(
      "# A\n\n## S\n\n- [Config \\[beta\\]](https://a.dev/c): A \\[note\\].\n",
    );
    expect(parsed.sections[0]?.links[0]).toEqual({
      title: "Config [beta]",
      url: "https://a.dev/c",
      note: "A [note].",
    });
  });

  it("reads a title that escapes a bracket right before a paren", () => {
    const parsed = parseLlmsTxt(
      "# A\n\n## S\n\n- [Arrays \\[0\\](1)](https://a.dev/x): note\n",
    );
    expect(parsed.sections[0]?.links[0]).toEqual({
      title: "Arrays [0](1)",
      url: "https://a.dev/x",
      note: "note",
    });
  });

  it("rejects a file with no H1", () => {
    expect(() => parseLlmsTxt("## Docs\n")).toThrow(LlmsTxtFormatError);
    expect(() => parseLlmsTxt("")).toThrow(LlmsTxtFormatError);
  });

  it("rejects a second H1", () => {
    expect(() => parseLlmsTxt("# A\n\n# B\n")).toThrow(LlmsTxtFormatError);
  });

  it("rejects a heading deeper than H2", () => {
    expect(() => parseLlmsTxt("# A\n\n## S\n\n### Deep\n")).toThrow(
      LlmsTxtFormatError,
    );
  });

  it("rejects a blockquote away from the H1", () => {
    expect(() => parseLlmsTxt("# A\n\n## S\n\n> late\n")).toThrow(
      LlmsTxtFormatError,
    );
    expect(() => parseLlmsTxt("# A\n\nProse.\n\n> late\n")).toThrow(
      LlmsTxtFormatError,
    );
  });

  it("rejects a list item that is not a link", () => {
    expect(() => parseLlmsTxt("# A\n\n## S\n\n- just text\n")).toThrow(
      LlmsTxtFormatError,
    );
    expect(() => parseLlmsTxt("# A\n\n## S\n\n- [Name]()\n")).toThrow(
      LlmsTxtFormatError,
    );
    expect(() =>
      parseLlmsTxt("# A\n\n## S\n\n- [Name](https://a.dev) trailing\n"),
    ).toThrow(LlmsTxtFormatError);
  });

  it("rejects an H2 with no name", () => {
    expect(() => parseLlmsTxt("# A\n\n##  \n")).toThrow(LlmsTxtFormatError);
  });
});
