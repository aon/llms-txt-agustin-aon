import {
  ConditionalCheckFailedException,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  type NativeAttributeValue,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { DEFAULT_SITE_CONFIG } from "../defaults.js";
import type { Crawl } from "../entities/crawl.js";
import { crawlKeys } from "../entities/crawl.js";
import type { Page, PageStatus } from "../entities/page.js";
import { pageGsi1Keys, pageKeys } from "../entities/page.js";
import type { Site } from "../entities/site.js";
import {
  SCHEDULE_PARTITION,
  siteGsi2Keys,
  siteKeys,
  sitePk,
} from "../entities/site.js";
import { TABLE } from "../entities/table.js";
import { NotFoundError } from "../store/errors.js";
import type {
  CrawlCounters,
  CrawlPatch,
  DiscoveredPage,
  FinishCrawlInput,
  ListPagesOptions,
  NewSite,
  PagePatch,
  SitePatch,
  Store,
} from "../store/index.js";
import { nowIso } from "../url.js";

export interface DynamoStoreOptions {
  client: DynamoDBClient;
  tableName: string;
}

/**
 * Single-table Store on the raw document client. Semantics mirror
 * MemoryStore: the lease is re-entrant for its holder, queued rows are never
 * downgraded, and an undefined patch value removes the attribute.
 */
export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;
  private readonly table: string;

  constructor(options: DynamoStoreOptions) {
    this.doc = DynamoDBDocumentClient.from(options.client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.table = options.tableName;
  }

  async getSite(host: string): Promise<Site | null> {
    const item = await this.get(siteKeys(host));
    return item ? toSite(item) : null;
  }

  async putSiteIfAbsent(input: NewSite): Promise<Site> {
    const now = nowIso();
    const site: Site = {
      host: input.host,
      origin: input.origin,
      config: input.config ?? { ...DEFAULT_SITE_CONFIG },
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...siteKeys(input.host), type: "SITE", ...site },
          ConditionExpression: `attribute_not_exists(${TABLE.partitionKey})`,
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      );
      return site;
    } catch (error) {
      const existing = conditionFailedItem(error);
      if (!existing) throw error;
      return toSite(existing);
    }
  }

  async updateSite(host: string, patch: SitePatch): Promise<Site> {
    const item = await this.update(siteKeys(host), {
      ...patch,
      updatedAt: nowIso(),
    });
    return toSite(item);
  }

  async acquireLease(
    host: string,
    crawlId: string,
    ttlSeconds: number,
    nowEpochSeconds?: number,
  ): Promise<boolean> {
    const now = nowEpochSeconds ?? Math.floor(Date.now() / 1000);
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: siteKeys(host),
          UpdateExpression: "SET #lease = :lease, #updatedAt = :updatedAt",
          ConditionExpression:
            `attribute_exists(${TABLE.partitionKey}) AND ` +
            "(attribute_not_exists(#lease) OR #lease.#expiresAt < :now OR #lease.#crawlId = :crawlId)",
          ExpressionAttributeNames: {
            "#lease": "lease",
            "#expiresAt": "expiresAt",
            "#crawlId": "crawlId",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":lease": { crawlId, expiresAt: now + ttlSeconds },
            ":now": now,
            ":crawlId": crawlId,
            ":updatedAt": nowIso(),
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      );
      return true;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      if (!conditionFailedItem(error)) {
        throw new NotFoundError(`Site not found: ${host}`);
      }
      return false;
    }
  }

  async releaseLease(host: string, crawlId: string): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: siteKeys(host),
          UpdateExpression: "REMOVE #lease SET #updatedAt = :updatedAt",
          ConditionExpression: "#lease.#crawlId = :crawlId",
          ExpressionAttributeNames: {
            "#lease": "lease",
            "#crawlId": "crawlId",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":crawlId": crawlId,
            ":updatedAt": nowIso(),
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
    }
  }

  async setSchedule(host: string, nextRunAt: string | null): Promise<void> {
    await this.update(siteKeys(host), {
      ...scheduleAttributes(host, nextRunAt),
      updatedAt: nowIso(),
    });
  }

  async listDueSites(nowIsoTime: string, limit: number): Promise<Site[]> {
    const items = await this.query(
      {
        IndexName: TABLE.gsi2.name,
        KeyConditionExpression: "#pk = :pk AND #sk <= :upper",
        ExpressionAttributeNames: {
          "#pk": TABLE.gsi2.partitionKey,
          "#sk": TABLE.gsi2.sortKey,
        },
        // "~" sorts after every hostname character, so sites due exactly now are included.
        ExpressionAttributeValues: {
          ":pk": SCHEDULE_PARTITION,
          ":upper": `${nowIsoTime}#~`,
        },
      },
      limit,
    );
    return items.map(toSite);
  }

  async putCrawl(host: string, crawl: Crawl): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...crawlKeys(host, crawl.crawlId), type: "CRAWL", ...crawl },
      }),
    );
  }

  async getCrawl(host: string, crawlId: string): Promise<Crawl | null> {
    const item = await this.get(crawlKeys(host, crawlId));
    return item ? toCrawl(item) : null;
  }

  async listCrawls(host: string, limit: number): Promise<Crawl[]> {
    const items = await this.query(
      {
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
        ExpressionAttributeNames: {
          "#pk": TABLE.partitionKey,
          "#sk": TABLE.sortKey,
        },
        ExpressionAttributeValues: { ":pk": sitePk(host), ":prefix": "CRAWL#" },
        ScanIndexForward: false,
      },
      limit,
    );
    return items.map(toCrawl);
  }

  async updateCrawl(
    host: string,
    crawlId: string,
    patch: CrawlPatch,
  ): Promise<Crawl> {
    return toCrawl(await this.update(crawlKeys(host, crawlId), patch));
  }

  async addCrawlCounters(
    host: string,
    crawlId: string,
    counters: CrawlCounters,
  ): Promise<Crawl> {
    const entries = Object.entries(counters).filter(
      (entry): entry is [string, number] => entry[1] !== undefined,
    );
    if (entries.length === 0) {
      const crawl = await this.getCrawl(host, crawlId);
      if (!crawl)
        throw new NotFoundError(`Crawl not found: ${host}/${crawlId}`);
      return crawl;
    }
    const names: Record<string, string> = {};
    const values: Record<string, NativeAttributeValue> = {};
    const adds = entries.map(([name, value], index) => {
      names[`#c${index}`] = name;
      values[`:c${index}`] = value;
      return `#c${index} :c${index}`;
    });
    try {
      const result = await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: crawlKeys(host, crawlId),
          UpdateExpression: `ADD ${adds.join(", ")}`,
          ConditionExpression: `attribute_exists(${TABLE.partitionKey})`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: "ALL_NEW",
        }),
      );
      return toCrawl(result.Attributes ?? {});
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new NotFoundError(`Crawl not found: ${host}/${crawlId}`);
      }
      throw error;
    }
  }

  async upsertQueuedPages(
    host: string,
    crawlId: string,
    pages: DiscoveredPage[],
  ): Promise<number> {
    // BatchWrite cannot carry the "not already touched by this crawl" condition, so one update per row.
    const results = await Promise.all(
      pages.map((page) => this.queuePage(host, crawlId, page)),
    );
    return results.filter(Boolean).length;
  }

  async getPage(host: string, path: string): Promise<Page | null> {
    const item = await this.get(pageKeys(host, path));
    return item ? toPage(item) : null;
  }

  async updatePage(
    host: string,
    path: string,
    patch: PagePatch,
  ): Promise<Page> {
    const gsi: Record<string, string> = {};
    if (patch.crawlId !== undefined || patch.status !== undefined) {
      const current =
        patch.crawlId === undefined || patch.status === undefined
          ? await this.getPage(host, path)
          : null;
      const crawlId = patch.crawlId ?? current?.crawlId;
      const status = patch.status ?? current?.status;
      if (crawlId === undefined || status === undefined) {
        throw new NotFoundError(`Page not found: ${host} ${path}`);
      }
      Object.assign(gsi, pageGsi1Keys(crawlId, status, path));
    }
    const item = await this.update(pageKeys(host, path), { ...patch, ...gsi });
    return toPage(item);
  }

  async listPages(
    host: string,
    options: ListPagesOptions = {},
  ): Promise<Page[]> {
    const input: QueryInput = {
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
      ExpressionAttributeNames: {
        "#pk": TABLE.partitionKey,
        "#sk": TABLE.sortKey,
      },
      ExpressionAttributeValues: { ":pk": sitePk(host), ":prefix": "PAGE#" },
    };
    if (options.eligible !== undefined) {
      input.FilterExpression = "#eligible = :eligible";
      input.ExpressionAttributeNames = {
        ...input.ExpressionAttributeNames,
        "#eligible": "eligible",
      };
      input.ExpressionAttributeValues = {
        ...input.ExpressionAttributeValues,
        ":eligible": options.eligible,
      };
    }
    const items = await this.query(input);
    return items.map(toPage).sort(byPath);
  }

  async listPagesByCrawl(
    crawlId: string,
    status?: PageStatus,
  ): Promise<Page[]> {
    const input: QueryInput = {
      IndexName: TABLE.gsi1.name,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": TABLE.gsi1.partitionKey },
      ExpressionAttributeValues: { ":pk": `CRAWL#${crawlId}` },
    };
    if (status !== undefined) {
      input.KeyConditionExpression += " AND begins_with(#sk, :prefix)";
      input.ExpressionAttributeNames = {
        ...input.ExpressionAttributeNames,
        "#sk": TABLE.gsi1.sortKey,
      };
      input.ExpressionAttributeValues = {
        ...input.ExpressionAttributeValues,
        ":prefix": `${status}#`,
      };
    }
    const items = await this.query(input);
    return items.map(toPage).sort(byPath);
  }

  async finishCrawl(
    host: string,
    crawlId: string,
    input: FinishCrawlInput,
  ): Promise<void> {
    const crawlUpdate = buildUpdate({
      status: "done",
      phase: "generating",
      snapshotKey: input.snapshotKey,
      llmsTxtKey: input.llmsTxtKey,
      diff: input.diff,
      finishedAt: input.finishedAt,
    });
    const siteUpdate = buildUpdate({
      lastDoneCrawlId: crawlId,
      currentLlmsTxtKey: input.llmsTxtKey,
      ...scheduleAttributes(host, input.nextRunAt),
      updatedAt: nowIso(),
    });
    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: this.table,
              Key: crawlKeys(host, crawlId),
              ConditionExpression: `attribute_exists(${TABLE.partitionKey})`,
              ...crawlUpdate,
            },
          },
          {
            Update: {
              TableName: this.table,
              Key: siteKeys(host),
              ConditionExpression: `attribute_exists(${TABLE.partitionKey})`,
              ...siteUpdate,
            },
          },
        ],
      }),
    );
    // Outside the transaction because a lease held by someone else must not fail the finish.
    await this.releaseLease(host, crawlId);
  }

  private async queuePage(host: string, crawlId: string, page: DiscoveredPage) {
    const now = nowIso();
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: pageKeys(host, page.path),
          UpdateExpression:
            "SET #type = :type, #crawlId = :crawlId, #status = :queued, #depth = :depth, #lastSeenAt = :now, " +
            "#gsi1pk = :gsi1pk, #gsi1sk = :gsi1sk, " +
            "#url = if_not_exists(#url, :url), #path = if_not_exists(#path, :path), " +
            "#eligible = if_not_exists(#eligible, :false), #firstSeenAt = if_not_exists(#firstSeenAt, :now)",
          ConditionExpression:
            "attribute_not_exists(#crawlId) OR #crawlId <> :crawlId",
          ExpressionAttributeNames: {
            "#type": "type",
            "#crawlId": "crawlId",
            "#status": "status",
            "#depth": "depth",
            "#lastSeenAt": "lastSeenAt",
            "#gsi1pk": TABLE.gsi1.partitionKey,
            "#gsi1sk": TABLE.gsi1.sortKey,
            "#url": "url",
            "#path": "path",
            "#eligible": "eligible",
            "#firstSeenAt": "firstSeenAt",
          },
          ExpressionAttributeValues: {
            ":type": "PAGE",
            ":crawlId": crawlId,
            ":queued": "queued",
            ":depth": page.depth,
            ":now": now,
            ":gsi1pk": pageGsi1Keys(crawlId, "queued", page.path).gsi1pk,
            ":gsi1sk": pageGsi1Keys(crawlId, "queued", page.path).gsi1sk,
            ":url": page.url,
            ":path": page.path,
            ":false": false,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  private async get(key: Record<string, string>) {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: key }),
    );
    return result.Item ?? null;
  }

  private async update(
    key: Record<string, string>,
    patch: Record<string, unknown>,
  ) {
    const expression = buildUpdate(patch);
    try {
      const result = await this.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: key,
          ConditionExpression: `attribute_exists(${TABLE.partitionKey})`,
          ...expression,
          ReturnValues: "ALL_NEW",
        }),
      );
      return result.Attributes ?? {};
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new NotFoundError(`Item not found: ${key.pk} ${key.sk}`);
      }
      throw error;
    }
  }

  private async query(input: QueryInput, limit?: number) {
    const items: Record<string, NativeAttributeValue>[] = [];
    let startKey: QueryCommandInput["ExclusiveStartKey"];
    do {
      const result = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          ...input,
          ...(limit === undefined ? {} : { Limit: limit - items.length }),
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      items.push(...(result.Items ?? []));
      startKey = result.LastEvaluatedKey;
    } while (startKey && (limit === undefined || items.length < limit));
    return items;
  }
}

type Item = Record<string, NativeAttributeValue>;
type QueryInput = Omit<QueryCommandInput, "TableName">;

/** SET for defined values, REMOVE for explicit undefined. */
function buildUpdate(patch: Record<string, unknown>) {
  const names: Record<string, string> = {};
  const values: Record<string, NativeAttributeValue> = {};
  const sets: string[] = [];
  const removes: string[] = [];
  Object.entries(patch).forEach(([name, value], index) => {
    names[`#a${index}`] = name;
    if (value === undefined) {
      removes.push(`#a${index}`);
    } else {
      values[`:v${index}`] = value;
      sets.push(`#a${index} = :v${index}`);
    }
  });
  const clauses = [
    sets.length > 0 ? `SET ${sets.join(", ")}` : "",
    removes.length > 0 ? `REMOVE ${removes.join(", ")}` : "",
  ].filter(Boolean);
  return {
    UpdateExpression: clauses.join(" "),
    ExpressionAttributeNames: names,
    ...(sets.length > 0 ? { ExpressionAttributeValues: values } : {}),
  };
}

/** nextRunAt and the GSI2 keys always travel together so the index stays sparse. */
function scheduleAttributes(host: string, nextRunAt: string | null) {
  if (nextRunAt === null) {
    return {
      nextRunAt: undefined,
      [TABLE.gsi2.partitionKey]: undefined,
      [TABLE.gsi2.sortKey]: undefined,
    };
  }
  return { nextRunAt, ...siteGsi2Keys(nextRunAt, host) };
}

/** The exception carries the raw attribute map; the document client only unmarshalls successes. */
function conditionFailedItem(error: unknown) {
  if (!(error instanceof ConditionalCheckFailedException)) return null;
  const item = error.Item;
  if (!item || Object.keys(item).length === 0) return null;
  return unmarshall(item);
}

const KEY_ATTRIBUTES = new Set<string>([
  TABLE.partitionKey,
  TABLE.sortKey,
  TABLE.gsi1.partitionKey,
  TABLE.gsi1.sortKey,
  TABLE.gsi2.partitionKey,
  TABLE.gsi2.sortKey,
  "type",
]);

function toEntity(item: Item) {
  const out: Item = {};
  for (const [name, value] of Object.entries(item)) {
    if (!KEY_ATTRIBUTES.has(name)) out[name] = value;
  }
  return out;
}

function toSite(item: Item) {
  return toEntity(item) as Site;
}

function toCrawl(item: Item) {
  return toEntity(item) as Crawl;
}

function toPage(item: Item) {
  return toEntity(item) as Page;
}

function byPath(a: Page, b: Page) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}
