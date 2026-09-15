import type { Page } from "@llms-txt/core";
import { skipLabel } from "@/lib/format";
import { pageChange } from "@/lib/pages";
import { RowsTable } from "./rows-table";

/** One row per page the crawl touched, in path order so rows never jump while it runs. Sections wait for the classify phase; until then a row still carries the previous crawl's. */
export function PagesTable({
  pages,
  startedAt,
  classified,
}: {
  pages: readonly Page[];
  startedAt: string | undefined;
  classified: boolean;
}) {
  const rows = pages.map((page, index) => {
    const queued = page.status === "queued";
    const change = pageChange(page, startedAt);
    return (
      <tr
        key={page.path}
        className={`border-line border-t ${queued ? "text-ghost" : ""}`}
      >
        <td className="w-[3ch] py-1.5 pr-3 text-dim">
          {String(index + 1).padStart(2, "0")}
        </td>
        <td className="py-1.5 pr-3">{page.path}</td>
        <td className="py-1.5 pr-3 font-sans text-[13px]">
          {page.status === "fetched" && page.title}
          {page.status === "skipped" && (
            <span className="text-dim">{skipLabel(page.skipReason)}</span>
          )}
          {page.status === "failed" && (
            <span className="text-dim">
              {page.httpStatus ? `HTTP ${page.httpStatus}` : "Unreachable"}
            </span>
          )}
        </td>
        <td className="py-1.5 pr-3 text-dim uppercase">
          {classified && page.status === "fetched" && page.section}
          {change && <span className="ml-2 lowercase">{change}</span>}
          {classified && page.status === "fetched" && !page.eligible && (
            <span className="ml-2 lowercase">not in file</span>
          )}
        </td>
        <td
          className={`py-1.5 text-right ${
            page.status === "skipped"
              ? "text-warn"
              : page.status === "failed"
                ? "text-err"
                : ""
          }`}
        >
          {queued ? "" : (page.httpStatus ?? "—")}
        </td>
      </tr>
    );
  });
  return <RowsTable rows={rows} />;
}
