import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { RESOURCE_ENV, requireEnv } from "@llms-txt/core";
import { DynamoStore, S3FileStore, SqsQueue } from "@llms-txt/core/aws";

let cached: Backend | undefined;

/** Built once per server process; the env is read on first use so a bad config fails the request, not the boot. */
export function backend() {
  cached ??= build();
  return cached;
}

export type Backend = ReturnType<typeof build>;

function build() {
  return {
    store: new DynamoStore({
      client: new DynamoDBClient({}),
      tableName: requireEnv(RESOURCE_ENV.tableName),
    }),
    files: new S3FileStore({
      client: new S3Client({}),
      bucket: requireEnv(RESOURCE_ENV.bucketName),
    }),
    queue: new SqsQueue({
      client: new SQSClient({}),
      queueUrl: requireEnv(RESOURCE_ENV.queueUrl),
    }),
  };
}
