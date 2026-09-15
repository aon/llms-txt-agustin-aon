/** The one schedule the UI offers: a weekly re-crawl. */
export const MONITOR_HOURS = 24 * 7;

/** A file this fresh would come back nearly identical, and anyone can press the button, so user re-crawls wait this long. */
export const RECRAWL_COOLDOWN_MS = 60 * 60 * 1000;

export function recrawlOpensAt(writtenAt: string) {
  return new Date(Date.parse(writtenAt) + RECRAWL_COOLDOWN_MS).toISOString();
}

/** Whole minutes until a re-crawl opens, or 0 once it is open. */
export function minutesUntilRecrawl(opensAt: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(opensAt) - now) / 60_000));
}
