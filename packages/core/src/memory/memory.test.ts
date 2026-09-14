import { describe, expect, it } from "vitest";
import { describeStoreContract } from "../test/store-contract.js";
import { MemoryFileStore, MemoryQueue, MemoryStore } from "./index.js";

const HOST = "example.com";

describe("memory store", () => {
  describeStoreContract(async () => new MemoryStore());
});

describe("memory file store", () => {
  it("round-trips gzipped html and json", async () => {
    const files = new MemoryFileStore();
    await files.putHtmlGz("h", "<html>héllo</html>");
    await files.putJson("j", { a: 1 });
    expect(await files.getHtmlGz("h")).toBe("<html>héllo</html>");
    expect(await files.getJson<{ a: number }>("j")).toEqual({ a: 1 });
    expect(files.objects.get("h")?.contentType).toBe("application/gzip");
    expect(await files.getObject("missing")).toBeNull();
  });
});

describe("memory queue", () => {
  it("records messages with their delay", async () => {
    const queue = new MemoryQueue();
    const message = { siteId: HOST, crawlId: "01A", reason: "user" as const };
    await queue.enqueue(message);
    await queue.enqueue(
      { ...message, continuation: true },
      { delaySeconds: 60 },
    );
    expect(queue.messages).toEqual([
      { message, delaySeconds: 0 },
      { message: { ...message, continuation: true }, delaySeconds: 60 },
    ]);
  });
});
