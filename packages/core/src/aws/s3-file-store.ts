import { gunzipSync, gzipSync } from "node:zlib";
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { FileStore } from "../store/index.js";

export interface S3FileStoreOptions {
  client: S3Client;
  bucket: string;
}

export class S3FileStore implements FileStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(options: S3FileStoreOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
  }

  async putObject(
    key: string,
    body: Uint8Array | string,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return result.Body ? await result.Body.transformToByteArray() : null;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
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
