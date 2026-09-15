"use client";

import type { Crawl, Page } from "@llms-txt/core";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { countByStatus, sectionCount } from "@/lib/pages";
import { rawHref } from "@/lib/routes";
import type { CrawlPageData } from "@/lib/site-data";
import { Block } from "./block";
import { FilePanel } from "./file-panel";
import { History } from "./history";
import { LocalTime } from "./local-time";
import { MonitorToggle } from "./monitor-toggle";
import { PagesTable } from "./pages-table";

const PHASES = [
  "queued",
  "discovery",
  "fetching",
  "extracting",
  "generating",
  "done",
] as const;

export function CrawlView({ data }: { data: CrawlPageData }) {
  const { site, crawl, pages, history, file } = data;
  const live = crawl.status === "queued" || crawl.status === "running";
  const counts = countByStatus(pages);
  const elapsed = useElapsed(crawl.startedAt, crawl.finishedAt, live);
  const previous = history.find(
    (c) => c.status === "done" && c.crawlId < crawl.crawlId,
  );

  return (
    <>
      <section className="mt-16 grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <BarField pages={pages} />
          <Stepper
            crawl={crawl}
            fetched={counts.fetched}
            total={pages.length}
          />
        </div>
        <Counters crawl={crawl} pages={pages} elapsedMs={elapsed} />
      </section>

      {crawl.status === "failed" && (
        <section className="mt-8 border-err border-t pt-4 font-mono text-[12px]">
          <div className="text-err">ERROR · NO FILE WRITTEN</div>
          <p className="mt-2 max-w-[70ch] text-[13px]">
            {crawl.error ?? "The crawl failed before it could write a file."}
          </p>
          <p className="mt-1 text-[13px] text-dim">
            Check that the site serves HTML to non-browser clients, then try
            again.
          </p>
        </section>
      )}

      {data.thin && (
        <section className="mt-8 border-warn border-t pt-4 font-mono text-[12px]">
          <div className="text-warn">THIN CONTENT</div>
          <p className="mt-2 max-w-[70ch] text-[13px]">
            Every page came back with almost no text. The site is probably
            rendered by JavaScript in the browser, so the file below lists its
            pages but says little about them.
          </p>
          <p className="mt-1 text-[13px] text-dim">
            Try the docs subdomain, or a URL that serves HTML without a
            client-side app.
          </p>
        </section>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between font-mono text-[12px] text-dim uppercase tracking-[0.08em]">
            <span>Pages</span>
            <span>
              {counts.fetched} fetched · {counts.skipped} skipped ·{" "}
              {counts.failed} failed
            </span>
          </div>
          <PagesTable
            pages={pages}
            startedAt={crawl.startedAt}
            classified={crawl.status === "done"}
          />
          {file && (
            <div className="mt-10">
              <FilePanel
                text={file}
                writtenAt={crawl.finishedAt ?? crawl.createdAt}
                rawHref={rawHref(site.host)}
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

          {crawl.status === "done" && crawl.diff && (
            <Block title="Changed">
              {crawl.diff.samples.length > 0 ? (
                <ul className="space-y-1">
                  {crawl.diff.samples.map((path) => (
                    <li key={path} className="truncate">
                      ~ {path}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-dim">
                  {previous ? "Nothing changed" : "First crawl"}
                </div>
              )}
              <div className="mt-2 text-dim">
                +{crawl.diff.added} −{crawl.diff.removed} ~{crawl.diff.changed}
                {previous && (
                  <>
                    {" · SINCE "}
                    <LocalTime iso={previous.createdAt} />
                  </>
                )}
              </div>
            </Block>
          )}

          <Block title="History">
            <History
              host={site.host}
              crawls={history}
              currentId={crawl.crawlId}
            />
          </Block>
        </aside>
      </div>
    </>
  );
}

function BarField({ pages }: { pages: readonly Page[] }) {
  const dense = pages.length > 48;
  return (
    <div
      className={`flex h-[140px] items-end border-line border-b ${dense ? "gap-px" : "gap-[6px]"}`}
    >
      {pages.map((page, index) => (
        <div
          key={page.path}
          className="flex h-full flex-1 flex-col items-center justify-end"
          title={`${page.path} ${page.status}`}
        >
          <div
            className={`${BAR_HEIGHT[page.status]} ${
              dense ? "w-full" : BAR_WIDTH[page.status]
            } ${BAR_COLOR[page.status]} transition-[height] duration-150`}
          />
          {!dense && (
            <span className="mt-2 font-mono text-[10px] text-dim">
              {String(index + 1).padStart(2, "0")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const BAR_HEIGHT: Record<Page["status"], string> = {
  queued: "h-px",
  fetched: "h-full",
  skipped: "h-1/3",
  failed: "h-[6px]",
};
const BAR_WIDTH: Record<Page["status"], string> = {
  queued: "w-px",
  fetched: "w-[10px]",
  skipped: "w-[10px]",
  failed: "w-px",
};
const BAR_COLOR: Record<Page["status"], string> = {
  queued: "bg-ghost",
  fetched: "bg-ink",
  skipped: "bg-warn",
  failed: "bg-err",
};

function Stepper({
  crawl,
  fetched,
  total,
}: {
  crawl: Crawl;
  fetched: number;
  total: number;
}) {
  const current =
    crawl.status === "queued"
      ? "queued"
      : crawl.status === "done"
        ? "done"
        : crawl.phase;
  const cursor = PHASES.indexOf(current);
  const steps = [
    ["discovery", "Discover"],
    ["fetching", `Fetch ${fetched}/${total}`],
    ["extracting", "Extract"],
    ["generating", "Generate"],
    ["done", "Publish"],
  ] as const;
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] uppercase tracking-[0.08em]">
      {steps.map(([phase, label], index) => {
        const position = PHASES.indexOf(phase);
        const state =
          crawl.status === "failed" && position === cursor
            ? "text-err"
            : position < cursor || (crawl.status === "done" && phase === "done")
              ? "text-ink"
              : position === cursor
                ? "text-brand"
                : "text-ghost";
        return (
          <li key={phase} className="flex items-center gap-2">
            <span className={state}>{label}</span>
            {index < steps.length - 1 && (
              <ArrowRight aria-hidden className="size-3 text-dim" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Counters({
  crawl,
  pages,
  elapsedMs,
}: {
  crawl: Crawl;
  pages: readonly Page[];
  elapsedMs: number | null;
}) {
  const counts = countByStatus(pages);
  const done = crawl.status === "done";
  const phase = crawl.status === "running" ? crawl.phase : crawl.status;
  const rows: [string, string | number][] = [
    ["PHASE", phase.toUpperCase()],
    ["T", elapsedMs === null ? "—" : (elapsedMs / 1000).toFixed(1)],
    ["FETCHED", counts.fetched],
    ["QUEUED", counts.queued],
    ["SKIPPED", counts.skipped],
    ["FAILED", counts.failed],
    ["INV", crawl.invocations],
    ["SECTIONS", done ? sectionCount(pages) : 0],
    ["Δ+", done ? (crawl.diff?.added ?? 0) : 0],
    ["Δ−", done ? (crawl.diff?.removed ?? 0) : 0],
    ["Δ~", done ? (crawl.diff?.changed ?? 0) : 0],
  ];
  return (
    <div className="border-line border-t pt-2 font-mono text-[12px] tabular-nums md:border-t-0 md:border-l md:pt-0 md:pl-6">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between leading-[1.7]">
          <span className="text-dim">{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** Ticks on the client only, so the server render never disagrees with the browser clock. */
function useElapsed(
  from: string | undefined,
  to: string | undefined,
  live: boolean,
) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [live]);
  if (!from) return null;
  const end = to ? Date.parse(to) : now;
  return end === null ? null : Math.max(0, end - Date.parse(from));
}
