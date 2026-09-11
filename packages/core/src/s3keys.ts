import { sha256Hex } from "./hash.js";

export function snapshotKey(host: string, crawlId: string) {
  return `sites/${host}/crawls/${crawlId}/snapshot.json`;
}

export function llmsTxtKey(host: string) {
  return `sites/${host}/llms.txt`;
}

export function crawlLlmsTxtKey(host: string, crawlId: string) {
  return `sites/${host}/crawls/${crawlId}/llms.txt`;
}

export function htmlKey(host: string, crawlId: string, path: string) {
  return `sites/${host}/crawls/${crawlId}/html/${sha256Hex(path)}.html.gz`;
}
