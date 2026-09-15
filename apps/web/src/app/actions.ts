"use server";

import { enqueueCrawl, originSchema } from "@llms-txt/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backend } from "@/lib/backend";
import { MONITOR_HOURS, minutesUntilRecrawl } from "@/lib/monitor";
import { crawlHref, siteHref } from "@/lib/routes";
import { loadSiteMatch } from "@/lib/site-data";

export interface StartCrawlState {
  error?: string;
}

/** A known site opens its page unless the submit asks to re-crawl; a crawl in flight is joined, and a fresh file holds re-crawls off. */
export async function startCrawl(
  _previous: StartCrawlState,
  formData: FormData,
): Promise<StartCrawlState> {
  const parsed = originSchema.safeParse(formData.get("url"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid URL" };
  }
  const { host, origin } = parsed.data;
  let destination: string;
  try {
    const match = await loadSiteMatch(host);
    const wait = match?.file
      ? minutesUntilRecrawl(match.file.recrawlOpensAt, Date.now())
      : 0;
    if (match?.running) {
      destination = crawlHref(host, match.running.crawlId);
    } else if (match?.file && formData.get("intent") !== "recrawl") {
      destination = siteHref(host);
    } else if (wait > 0) {
      return {
        error: `Generated under an hour ago. Regenerate opens in ${wait} min.`,
      };
    } else {
      const { store, queue } = backend();
      if (!match) await store.putSiteIfAbsent({ host, origin });
      const crawl = await enqueueCrawl(
        { store, queue },
        { host, reason: "user", now: new Date() },
      );
      destination = crawlHref(host, crawl.crawlId);
    }
  } catch (error) {
    console.error("startCrawl failed", error);
    return { error: "Could not start the crawl. Try again in a moment." };
  }
  redirect(destination);
}

/** Looks a typed URL up without creating anything, so the form can show a known site before it is submitted. */
export async function lookupSite(input: string) {
  const parsed = originSchema.safeParse(input);
  if (!parsed.success) return null;
  return loadSiteMatch(parsed.data.host);
}

/** Turns the weekly re-crawl on or off; the first scheduled run is one interval from now. */
export async function setMonitoring(host: string, enabled: boolean) {
  const { store } = backend();
  const site = await store.getSite(host);
  if (!site) return;
  const { scheduleHours: _, ...config } = site.config;
  await store.updateSite(host, {
    config: enabled ? { ...config, scheduleHours: MONITOR_HOURS } : config,
  });
  await store.setSchedule(
    host,
    enabled
      ? new Date(Date.now() + MONITOR_HOURS * 60 * 60 * 1000).toISOString()
      : null,
  );
  revalidatePath("/sites/[host]", "layout");
}
