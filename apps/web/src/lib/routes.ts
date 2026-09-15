export function siteHref(host: string) {
  return `/sites/${encodeURIComponent(host)}`;
}

export function crawlHref(host: string, crawlId: string) {
  return `${siteHref(host)}/crawls/${encodeURIComponent(crawlId)}`;
}

/** The stable URL tools fetch; always the file of the last successful crawl. */
export function rawHref(host: string) {
  return `${siteHref(host)}/llms.txt`;
}
