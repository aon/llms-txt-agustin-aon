import { z } from "zod";

export const crawlJobMessageSchema = z.object({
  /** The site host. */
  siteId: z.string().min(1),
  crawlId: z.string().min(1),
  reason: z.enum(["user", "scheduled"]),
  /** Set by the worker when it re-enqueues itself after spending its time budget. */
  continuation: z.literal(true).optional(),
});

export type CrawlJobMessage = z.infer<typeof crawlJobMessageSchema>;

export function parseCrawlJobMessage(body: string) {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new InvalidMessageError("Message body is not valid JSON");
  }
  const result = crawlJobMessageSchema.safeParse(json);
  if (!result.success) {
    throw new InvalidMessageError(
      `Message body does not match schema: ${result.error.message}`,
    );
  }
  return result.data;
}

export function serializeCrawlJobMessage(message: CrawlJobMessage) {
  return JSON.stringify(crawlJobMessageSchema.parse(message));
}

export class InvalidMessageError extends Error {
  override readonly name = "InvalidMessageError";
}
