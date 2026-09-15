import type { Crawl } from "@llms-txt/core";
import Link from "next/link";
import { crawlHref } from "@/lib/routes";
import { LocalTime } from "./local-time";

export function History({
  host,
  crawls,
  currentId,
}: {
  host: string;
  crawls: readonly Crawl[];
  currentId?: string;
}) {
  if (crawls.length === 0) return <div className="text-dim">No crawls yet</div>;
  return (
    <ul className="space-y-1.5">
      {crawls.map((crawl) => (
        <li key={crawl.crawlId} className="flex justify-between gap-3">
          <span className="truncate">
            <Link
              href={crawlHref(host, crawl.crawlId)}
              aria-current={crawl.crawlId === currentId ? "page" : undefined}
              className="hover:underline aria-[current]:text-brand"
            >
              <LocalTime iso={crawl.createdAt} />
            </Link>
            <span className="ml-2 text-dim uppercase">{crawl.reason}</span>
          </span>
          <span className="shrink-0 text-dim">{summary(crawl)}</span>
        </li>
      ))}
    </ul>
  );
}

function summary(crawl: Crawl) {
  if (crawl.status === "done" && crawl.diff) {
    return `+${crawl.diff.added} −${crawl.diff.removed} ~${crawl.diff.changed}`;
  }
  return crawl.status.toUpperCase();
}
