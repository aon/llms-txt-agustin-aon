import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { beforeAll, describe, inject } from "vitest";
import { TABLE } from "../entities/table.js";
import { describeStoreContract } from "../test/store-contract.js";
import { DynamoStore } from "./dynamo-store.js";

const endpoint = inject("dynamodbEndpoint");

describe.skipIf(endpoint === null)("dynamo store", () => {
  const client = new DynamoDBClient({
    endpoint: endpoint ?? "http://unused",
    region: "local",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  });
  let counter = 0;

  beforeAll(async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await createTable(client, "warmup");
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error(`DynamoDB Local at ${endpoint} never answered`);
  });

  describeStoreContract(async () => {
    counter += 1;
    const tableName = `llms-txt-test-${process.pid}-${counter}`;
    await createTable(client, tableName);
    return new DynamoStore({ client, tableName });
  });
});

async function createTable(client: DynamoDBClient, tableName: string) {
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        TABLE.partitionKey,
        TABLE.sortKey,
        TABLE.gsi1.partitionKey,
        TABLE.gsi1.sortKey,
        TABLE.gsi2.partitionKey,
        TABLE.gsi2.sortKey,
      ].map((name) => ({ AttributeName: name, AttributeType: "S" })),
      KeySchema: [
        { AttributeName: TABLE.partitionKey, KeyType: "HASH" },
        { AttributeName: TABLE.sortKey, KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [TABLE.gsi1, TABLE.gsi2].map((index) => ({
        IndexName: index.name,
        KeySchema: [
          { AttributeName: index.partitionKey, KeyType: "HASH" },
          { AttributeName: index.sortKey, KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      })),
    }),
  );
}
