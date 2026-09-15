import { RESOURCE_ENV } from "@llms-txt/core";

/** Environment the CDK stack sets on every worker function. */
export const WORKER_ENV = {
  ...RESOURCE_ENV,
  openRouterSecretArn: "OPENROUTER_SECRET_ARN",
  openRouterApiKey: "OPENROUTER_API_KEY",
  openRouterModel: "OPENROUTER_MODEL",
} as const;

export const USER_AGENT =
  "llms-txt-generator/0.1 (+https://github.com/agustinaon/llms-txt-agustin-aon)";
