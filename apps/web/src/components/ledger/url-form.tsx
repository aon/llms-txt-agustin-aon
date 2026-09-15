"use client";

import { ArrowRight } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { lookupSite, startCrawl } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { formatOrigin } from "@/lib/format";
import { minutesUntilRecrawl } from "@/lib/monitor";
import type { SiteMatch } from "@/lib/site-data";
import { RelativeTime } from "./local-time";

export type FormState = "idle" | "running" | "finished";

const BUTTON =
  "mb-2 h-8 gap-2 rounded px-4 py-1.5 has-data-[icon=inline-start]:pl-4 font-mono text-[12px] font-normal uppercase tracking-[0.08em] [&_svg:not([class*='size-'])]:size-3.5";

/** How long typing has to pause before the host is looked up; fast typists leave 100 to 200 ms between keys. */
const LOOKUP_DELAY_MS = 250;

/** A lookup faster than this goes straight to its answer, without the checking state. */
const CHECKING_DELAY_MS = 150;

/** Once the checking state shows, it holds this long so the button does not flash. */
const CHECKING_MIN_MS = 500;

/** Input that arrives whole, so there are no more keys to wait for. */
const WHOLE_INPUT = new Set([
  "insertFromPaste",
  "insertFromDrop",
  "insertReplacementText",
]);

/** The form looks the typed host up as you go: a known site becomes a link to its page, and re-crawling it is the explicit second choice. */
export function UrlForm({
  origin = "",
  state,
}: {
  origin?: string;
  state: FormState;
}) {
  const [result, action, pending] = useActionState(startCrawl, {});
  const [input, setInput] = useState({
    value: formatOrigin(origin),
    whole: false,
  });
  const { value } = input;
  const { match, answered, failed, looking, flush } = useSiteMatch(
    input,
    state,
  );
  const ownSite = origin !== "" && sameSite(value, origin);
  const checking = looking && !ownSite;
  const unverified = value.trim() !== "" && !answered && !ownSite;
  const wait = match?.file
    ? minutesUntilRecrawl(match.file.recrawlOpensAt, Date.now())
    : 0;
  const opens = Boolean((match?.file || match?.running) && !ownSite);
  const label = labelFor({
    pending,
    checking,
    unverified,
    opens,
    ownSite,
    state,
    match,
  });
  const arrow = opens || label === null;
  const busy = pending || checking || (state === "running" && ownSite);
  return (
    <form action={action}>
      <div className="flex items-end border-ink border-b">
        {/* mirrors the button so the field's text sits centred in the rule */}
        <Button
          render={<span />}
          nativeButton={false}
          aria-hidden
          variant="brand"
          loading={busy}
          className={`${BUTTON} invisible hidden md:inline-flex`}
        >
          {label}
          {arrow && <ArrowRight aria-hidden />}
        </Button>
        <input
          name="url"
          type="text"
          value={value}
          onChange={(event) =>
            setInput({
              value: event.target.value,
              whole:
                !(event.nativeEvent instanceof InputEvent) ||
                WHOLE_INPUT.has(event.nativeEvent.inputType),
            })
          }
          onBlur={flush}
          aria-label="Website URL"
          aria-invalid={result.error ? true : undefined}
          className="min-w-0 flex-1 bg-transparent pb-3 text-center font-mono text-[16px] outline-none placeholder:text-ghost md:text-[22px]"
          placeholder="example.com"
          autoComplete="url"
          spellCheck={false}
          required
        />
        <Button
          type="submit"
          name="intent"
          value={ownSite ? "recrawl" : "open"}
          variant="brand"
          loading={busy}
          disabled={ownSite && wait > 0}
          aria-label={label === null ? "Continue" : undefined}
          className={BUTTON}
        >
          {label}
          {arrow && <ArrowRight aria-hidden />}
        </Button>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="mt-3 flex min-h-[1.5em] flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono text-[12px]"
      >
        {result.error ? (
          <span className="text-err">{result.error}</span>
        ) : (
          answered &&
          !failed && (
            <MatchLine
              match={match}
              ownSite={ownSite}
              wait={wait}
              disabled={pending}
            />
          )
        )}
      </div>
    </form>
  );
}

/** A new site gets a line too, so the lookup always visibly answers; on the site's own page only a held re-crawl is news. */
function MatchLine({
  match,
  ownSite,
  wait,
  disabled,
}: {
  match: SiteMatch | null;
  ownSite: boolean;
  wait: number;
  disabled: boolean;
}) {
  const hold = wait > 0 && (
    <span className="text-dim">Regenerate opens in {wait} min</span>
  );
  if (ownSite) return hold;
  if (match?.running) {
    return (
      <span className="text-brand uppercase tracking-[0.08em]">
        {match.host} · crawl {match.running.status}
      </span>
    );
  }
  if (!match?.file) {
    return (
      <>
        <span className="text-dim">
          {match?.lastFailed ? "Last attempt failed" : "Not generated yet"}
        </span>
        <span aria-hidden className="text-ghost">
          ·
        </span>
        <span className="text-dim">
          {match?.lastFailed
            ? "Generate to try again"
            : "First run takes a minute or two"}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-dim">
        llms.txt written <RelativeTime iso={match.file.writtenAt} />
      </span>
      <span aria-hidden className="text-ghost">
        ·
      </span>
      {hold || (
        <button
          type="submit"
          name="intent"
          value="recrawl"
          disabled={disabled}
          className="text-brand underline-offset-4 hover:underline"
        >
          Regenerate instead
        </button>
      )}
    </>
  );
}

/**
 * Answers per typed value, kept for the life of the form so retyping a host is instant.
 * Keys wait for typing to pause; pasted input and leaving the field look up at once.
 * The page's crawl state is part of the key, so a crawl finishing asks again.
 */
function useSiteMatch(
  { value, whole }: { value: string; whole: boolean },
  state: FormState,
) {
  const key = `${state} ${value.trim()}`;
  const [answers, setAnswers] = useState(
    () => new Map<string, SiteMatch | null | "failed">(),
  );
  const [slowKey, setSlowKey] = useState<string>();
  const flushRef = useRef<() => void>(undefined);
  const answered = answers.has(key);

  useEffect(() => {
    if (!looksLikeHost(value) || answered) return;
    let current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const send = () => {
      flushRef.current = undefined;
      const sentAt = Date.now();
      timers.push(
        setTimeout(() => current && setSlowKey(key), CHECKING_DELAY_MS),
      );
      lookupSite(value)
        .catch(() => "failed" as const)
        .then((site) => {
          const settle = () =>
            current &&
            setAnswers((previous) => new Map(previous).set(key, site));
          const elapsed = Date.now() - sentAt;
          const hold = CHECKING_DELAY_MS + CHECKING_MIN_MS - elapsed;
          if (elapsed < CHECKING_DELAY_MS || hold <= 0) settle();
          else timers.push(setTimeout(settle, hold));
        });
    };
    if (whole) {
      send();
    } else {
      const debounce = setTimeout(send, LOOKUP_DELAY_MS);
      timers.push(debounce);
      flushRef.current = () => {
        clearTimeout(debounce);
        send();
      };
    }
    return () => {
      current = false;
      flushRef.current = undefined;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [key, value, whole, answered]);

  const answer = answers.get(key);
  return {
    match: answer === "failed" ? null : (answer ?? null),
    answered,
    failed: answer === "failed",
    looking: !answered && slowKey === key,
    flush: () => flushRef.current?.(),
  };
}

function labelFor({
  pending,
  checking,
  unverified,
  opens,
  ownSite,
  state,
  match,
}: {
  pending: boolean;
  checking: boolean;
  unverified: boolean;
  opens: boolean;
  ownSite: boolean;
  state: FormState;
  match: SiteMatch | null;
}) {
  if (pending) return opens ? "Opening" : "Starting";
  if (checking) return "Checking";
  if (ownSite) return state === "running" ? "Crawling" : "Regenerate";
  if (unverified) return null;
  if (match?.running) return "Follow";
  return opens ? "Open" : "Generate";
}

/** Half-typed text like "herd" would parse as a host and read as a new site, so a lookup waits for a dot and a second label. */
function looksLikeHost(value: string) {
  return /^(https?:\/\/)?[^/\s.]+(\.[^/\s.]+)*\.[a-z0-9-]{2,}(:\d+)?(\/.*)?$/i.test(
    value.trim(),
  );
}

function sameSite(value: string, origin: string) {
  return value.trim().replace(/\/+$/, "") === formatOrigin(origin);
}
