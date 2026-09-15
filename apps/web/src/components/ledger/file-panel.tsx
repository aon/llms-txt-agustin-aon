"use client";

import { useState } from "react";
import { RelativeTime } from "./local-time";

/** The deliverable: the file itself, with copy, download, and the raw URL. */
export function FilePanel({
  text,
  writtenAt,
  rawHref,
}: {
  text: string;
  writtenAt: string;
  rawHref: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[12px] text-dim uppercase tracking-[0.08em]">
        <span>
          llms.txt · {text.split("\n").length} lines · written{" "}
          <RelativeTime iso={writtenAt} />
        </span>
        <span className="flex gap-4 text-brand">
          <button
            type="button"
            onClick={async () => {
              await copyText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="uppercase hover:underline"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => downloadText(text)}
            className="uppercase hover:underline"
          >
            Download
          </button>
          <a href={rawHref} className="uppercase hover:underline">
            Raw
          </a>
        </span>
      </div>
      <pre className="mt-2 max-h-[440px] overflow-y-auto overflow-x-hidden whitespace-pre-wrap border-line border-y py-4 pr-4 [scrollbar-width:thin] font-mono text-[12.5px] leading-[1.6] [overflow-wrap:anywhere]">
        {text}
      </pre>
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard is unavailable over plain http and in some embeds; the text is still on screen.
  }
}

function downloadText(text: string, filename = "llms.txt") {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
