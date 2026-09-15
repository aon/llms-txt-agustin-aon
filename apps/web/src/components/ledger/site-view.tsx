import Link from "next/link";
import { crawlHref, rawHref } from "@/lib/routes";
import type { SitePageData } from "@/lib/site-data";
import { Block } from "./block";
import { FilePanel } from "./file-panel";
import { History } from "./history";
import { LocalTime } from "./local-time";
import { MonitorToggle } from "./monitor-toggle";
import { RowsTable } from "./rows-table";

/** The site's standing page: the current file, what is in it, and how it stays current. */
export function SiteView({ data }: { data: SitePageData }) {
  const { site, history, pages, file, current, running } = data;
  return (
    <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        {running && (
          <p className="mb-8 border-brand border-t pt-4 font-mono text-[12px] uppercase tracking-[0.08em]">
            <span className="text-brand">
              {running.status === "queued" ? "Crawl queued" : "Crawl running"}
            </span>
            <span className="text-dim"> · </span>
            <Link
              href={crawlHref(site.host, running.crawlId)}
              className="text-brand hover:underline"
            >
              Follow it
            </Link>
          </p>
        )}

        {file && current ? (
          <FilePanel
            text={file}
            writtenAt={current.finishedAt ?? current.createdAt}
            rawHref={rawHref(site.host)}
          />
        ) : (
          <p className="font-mono text-[12px] text-dim uppercase tracking-[0.08em]">
            No file yet
            {history[0] && !running && " · the last crawl failed"}
          </p>
        )}

        {pages.length > 0 && (
          <div className="mt-10">
            <div className="flex items-baseline justify-between font-mono text-[12px] text-dim uppercase tracking-[0.08em]">
              <span>Pages in file</span>
              <span>{pages.length}</span>
            </div>
            <RowsTable
              rows={pages.map((page, index) => (
                <tr key={page.path} className="border-line border-t">
                  <td className="w-[3ch] py-1.5 pr-3 text-dim">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td className="py-1.5 pr-3">{page.path}</td>
                  <td className="py-1.5 pr-3 font-sans text-[13px]">
                    {page.title}
                  </td>
                  <td className="py-1.5 text-right text-dim uppercase">
                    {page.section}
                  </td>
                </tr>
              ))}
            />
          </div>
        )}
      </div>

      <aside className="font-mono text-[12px]">
        <Block title="Monitor">
          <MonitorToggle
            host={site.host}
            enabled={site.monitoring}
            nextRunAt={site.nextRunAt}
          />
        </Block>
        <Block title="Raw URL">
          <a
            href={rawHref(site.host)}
            className="break-all text-brand hover:underline"
          >
            {rawHref(site.host)}
          </a>
        </Block>
        {current?.finishedAt && (
          <Block title="Last crawl">
            <div>
              <LocalTime iso={current.finishedAt} time />
            </div>
          </Block>
        )}
        <Block title="History">
          <History host={site.host} crawls={history} />
        </Block>
      </aside>
    </div>
  );
}
