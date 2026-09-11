import { gunzipSync, gzipSync } from "node:zlib";
import type { FileStore } from "../store/index.js";

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

/** In-memory FileStore. `objects` is exposed for assertions in tests. */
export class MemoryFileStore implements FileStore {
  readonly objects = new Map<string, StoredObject>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  async putObject(
    key: string,
    body: Uint8Array | string,
    contentType: string,
  ): Promise<void> {
    const bytes = typeof body === "string" ? this.encoder.encode(body) : body;
    this.objects.set(key, { body: new Uint8Array(bytes), contentType });
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    const object = this.objects.get(key);
    return object ? new Uint8Array(object.body) : null;
  }

  async putHtmlGz(key: string, html: string): Promise<void> {
    await this.putObject(
      key,
      gzipSync(this.encoder.encode(html)),
      "application/gzip",
    );
  }

  async getHtmlGz(key: string): Promise<string | null> {
    const bytes = await this.getObject(key);
    return bytes ? this.decoder.decode(gunzipSync(bytes)) : null;
  }

  async putJson(key: string, value: unknown): Promise<void> {
    await this.putObject(key, JSON.stringify(value), "application/json");
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const bytes = await this.getObject(key);
    return bytes ? (JSON.parse(this.decoder.decode(bytes)) as T) : null;
  }
}
