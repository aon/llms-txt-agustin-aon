/**
 * Blob storage for things too large or too numerous for a table row: raw
 * HTML, crawl snapshots and generated llms.txt files. S3 in production.
 */
export interface FileStore {
  putObject(
    key: string,
    body: Uint8Array | string,
    contentType: string,
  ): Promise<void>;
  getObject(key: string): Promise<Uint8Array | null>;
  putHtmlGz(key: string, html: string): Promise<void>;
  getHtmlGz(key: string): Promise<string | null>;
  putJson(key: string, value: unknown): Promise<void>;
  getJson<T = unknown>(key: string): Promise<T | null>;
}
