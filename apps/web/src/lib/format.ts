/** Without a locale or time zone, Intl uses the runtime's own: the viewer's, when this runs in the browser. */
export function formatLocalDate(
  iso: string,
  options: { time?: boolean; locale?: string; timeZone?: string } = {},
) {
  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: "medium",
    ...(options.time ? { timeStyle: "short" } : {}),
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(new Date(iso));
}

/** Weekday, date, time to the second and time zone name, in the runtime's locale. */
export function formatFullDate(
  iso: string,
  options: { locale?: string; timeZone?: string } = {},
) {
  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: "full",
    timeStyle: "long",
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(new Date(iso));
}

/** Always English, like the rest of the UI; the largest whole unit wins, so "yesterday" beats "36 hours ago". */
export function formatRelative(iso: string, now: number) {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  const unit = RELATIVE_UNITS.find(([, size]) => seconds >= size);
  if (!unit) return "just now";
  const [name, size] = unit;
  return RELATIVE.format(-Math.floor(seconds / size), name);
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365.25 * 86_400],
  ["month", 30.4375 * 86_400],
  ["week", 7 * 86_400],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** https is what the form assumes, so only an http origin keeps its scheme on screen. */
export function formatOrigin(origin: string) {
  return origin.replace(/^https:\/\//, "");
}

export function formatDuration(ms: number) {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

const SKIP_LABELS: Readonly<Record<string, string>> = {
  redirect: "Redirects elsewhere",
  "offsite-redirect": "Redirects off-site",
  robots: "Disallowed by robots.txt",
  "content-type": "Not HTML",
  "too-large": "Too large",
};

export function skipLabel(reason: string | undefined) {
  if (!reason) return "Skipped";
  return SKIP_LABELS[reason] ?? `Skipped: ${reason}`;
}
