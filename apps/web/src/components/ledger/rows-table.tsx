"use client";

import { useId, useState } from "react";

/** A ledger table that shows its first rows and expands to all of them on demand. */
export function RowsTable({ rows }: { rows: readonly React.ReactNode[] }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const collapsible = rows.length > COLLAPSED_ROWS;
  return (
    <div className="mt-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-line border-y font-mono text-[12px]">
          <tbody id={id}>
            {expanded ? rows : rows.slice(0, COLLAPSED_ROWS)}
          </tbody>
        </table>
      </div>
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="mt-2 font-mono text-[12px] text-brand uppercase tracking-[0.08em] hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {expanded
            ? `Show first ${COLLAPSED_ROWS}`
            : `Show all ${rows.length} pages`}
        </button>
      )}
    </div>
  );
}

const COLLAPSED_ROWS = 5;
