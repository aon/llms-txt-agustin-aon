/** Environment the CDK stack sets on every worker function. */
export const WORKER_ENV = {
  tableName: "TABLE_NAME",
  bucketName: "BUCKET_NAME",
  queueUrl: "QUEUE_URL",
  openRouterSecretArn: "OPENROUTER_SECRET_ARN",
  openRouterApiKey: "OPENROUTER_API_KEY",
  openRouterModel: "OPENROUTER_MODEL",
} as const;

export const USER_AGENT =
  "llms-txt-generator/0.1 (+https://github.com/agustinaon/llms-txt-agustin-aon)";

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
