"use client";

import { useSyncExternalStore } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatFullDate, formatLocalDate, formatRelative } from "@/lib/format";

/** The server knows neither the viewer's locale nor their time zone, so the text only fills in once the browser renders it. */
export function LocalTime({
  iso,
  time = false,
}: {
  iso: string;
  time?: boolean;
}) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <FullDateTooltip iso={iso} ready={inBrowser}>
      {formatLocalDate(iso, {
        time,
        ...(inBrowser ? {} : { timeZone: "UTC" }),
      })}
    </FullDateTooltip>
  );
}

/** "5 minutes ago", kept current while the page stays open. */
export function RelativeTime({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribeToClock, clockBucket, () => null);
  return (
    <FullDateTooltip iso={iso} ready={now !== null}>
      {formatRelative(iso, now ?? Date.parse(iso))}
    </FullDateTooltip>
  );
}

/** Short dates drop the time and zone; hovering shows all of it in the viewer's locale. */
function FullDateTooltip({
  iso,
  ready,
  children,
}: {
  iso: string;
  ready: boolean;
  children: string;
}) {
  const text = (
    <time dateTime={iso} className={ready ? "" : "invisible"}>
      {children}
    </time>
  );
  if (!ready) return text;
  return (
    <Tooltip>
      <TooltipTrigger delay={200} render={text} />
      <TooltipContent>{formatFullDate(iso)}</TooltipContent>
    </Tooltip>
  );
}

function subscribe() {
  return () => {};
}

function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, CLOCK_MS);
  return () => clearInterval(id);
}

/** A snapshot must stay equal between ticks, so the clock reads in whole steps. */
function clockBucket() {
  return Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS;
}

const CLOCK_MS = 15_000;
