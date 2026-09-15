import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { SQSClient } from "@aws-sdk/client-sqs";
import { requireEnv, TIMING } from "@llms-txt/core";
import { DynamoStore, S3FileStore, SqsQueue } from "@llms-txt/core/aws";
import { OpenRouterEnricher } from "@llms-txt/llms-txt";
import { USER_AGENT, WORKER_ENV } from "./env.js";
import type { JobDeps } from "./job.js";

/** Built once per container; the enricher waits for its secret on first use. */
export async function runtimeDeps(): Promise<JobDeps> {
  const enricher = await loadEnricher();
  return {
    ...baseDeps(),
    ...(enricher ? { enricher } : {}),
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    userAgent: USER_AGENT,
    budgetMs: TIMING.workerBudgetMs,
  };
}

export function baseDeps() {
  return {
    store: new DynamoStore({
      client: new DynamoDBClient({}),
      tableName: requireEnv(WORKER_ENV.tableName),
    }),
    files: new S3FileStore({
      client: new S3Client({}),
      bucket: requireEnv(WORKER_ENV.bucketName),
    }),
    queue: new SqsQueue({
      client: new SQSClient({}),
      queueUrl: requireEnv(WORKER_ENV.queueUrl),
    }),
    now: () => new Date(),
    log,
  };
}

export function log(message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ message, ...fields }));
}

async function loadEnricher() {
  const apiKey =
    process.env[WORKER_ENV.openRouterApiKey] ?? (await readSecret());
  if (!apiKey) {
    log("no OpenRouter key configured, files are written without the model");
    return null;
  }
  const model = process.env[WORKER_ENV.openRouterModel];
  return new OpenRouterEnricher({ apiKey, ...(model ? { model } : {}) });
}

async function readSecret() {
  const secretId = process.env[WORKER_ENV.openRouterSecretArn];
  if (!secretId) return null;
  const result = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  const value = result.SecretString?.trim();
  // The stack creates the secret with a placeholder until the real key is set.
  return value && !value.startsWith("placeholder") ? value : null;
}
