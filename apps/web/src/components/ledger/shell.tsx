import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { siteHref } from "@/lib/routes";
import { CrawlBackdrop } from "./crawl-backdrop";
import { LocalTime } from "./local-time";
import { RotatingWord } from "./rotating-word";
import { type FormState, UrlForm } from "./url-form";

const SUBJECTS = ["docs", "blog", "wiki", "store", "brand"];
const CLAIMS = "Spec-conformant. Re-crawled weekly. Served at a stable URL.";

/** Every page is the ledger: the same top bar and URL line; the home adds the pitch above it, other pages their content below. The top bar is a breadcrumb, so the site link only appears where there is a site. */
export function Shell({
  host,
  origin,
  crawledAt,
  state,
  children,
}: {
  host?: string;
  /** Set on a crawl page, which adds the crawl as the last crumb. */
  crawledAt?: string;
  origin?: string;
  state: FormState;
  children?: React.ReactNode;
}) {
  const hero = children === undefined;
  return (
    <div className="flex min-h-screen flex-col font-sans text-[14px] text-ink antialiased selection:bg-brand/30">
      {hero && <CrawlBackdrop />}
      <header className="h-12 shrink-0 border-line border-b">
        <div className="mx-auto flex h-full max-w-[1120px] items-center justify-between gap-6 px-6">
          <Breadcrumb
            {...(host === undefined ? {} : { host })}
            {...(crawledAt === undefined ? {} : { crawledAt })}
          />
          <nav className="flex shrink-0 gap-5 font-mono text-[12px] text-dim uppercase tracking-[0.08em]">
            <a
              href="https://llmstxt.org"
              className="flex items-center gap-0.5 hover:text-ink"
            >
              Spec
              <ArrowUpRight aria-hidden className="size-3" strokeWidth={1.5} />
            </a>
          </nav>
        </div>
      </header>

      <main
        className={`mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-6 ${hero ? "" : "pb-16"}`}
      >
        <section
          className={`mx-auto w-full max-w-[800px] text-center ${hero ? "my-auto pb-[8vh]" : "pt-16 md:pt-20"}`}
        >
          {hero && (
            <>
              <h1 className="font-semibold text-[32px] leading-[1.08] tracking-[-0.03em] md:text-[48px]">
                llms.txt for your{" "}
                <RotatingWord words={SUBJECTS} paused={state !== "idle"} />
              </h1>
              <p className="mt-5 text-[16px] text-dim md:text-[18px]">
                {CLAIMS}
              </p>
            </>
          )}
          <div className={hero ? "mt-16 md:mt-20" : ""}>
            <UrlForm
              key={origin}
              {...(origin === undefined ? {} : { origin })}
              state={state}
            />
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}

function Breadcrumb({
  host,
  crawledAt,
}: {
  host?: string;
  crawledAt?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em]">
        <li className="shrink-0">
          <Link href="/">llms.txt</Link>
        </li>
        {host && (
          <li className="flex min-w-0 items-center gap-2">
            <Separator />
            {crawledAt ? (
              <Link
                href={siteHref(host)}
                className="truncate text-dim underline-offset-4 hover:text-ink hover:underline"
              >
                {host}
              </Link>
            ) : (
              <span aria-current="page" className="truncate">
                {host}
              </span>
            )}
          </li>
        )}
        {host && crawledAt && (
          <li aria-current="page" className="flex shrink-0 items-center gap-2">
            <Separator />
            <span>
              Crawl
              {/* a phone needs the room for the host */}
              <span className="hidden sm:inline">
                {" "}
                <LocalTime iso={crawledAt} />
              </span>
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <span aria-hidden className="text-ghost">
      /
    </span>
  );
}
