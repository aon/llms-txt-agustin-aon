import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

const IMAGE = "amazon/dynamodb-local:latest";

declare module "vitest" {
  export interface ProvidedContext {
    dynamodbEndpoint: string | null;
  }
}

/**
 * Starts DynamoDB Local in Docker for the store contract tests. Honors an
 * existing DYNAMODB_ENDPOINT, and provides null when Docker is missing so
 * those tests skip instead of failing.
 */
export default function setup(project: TestProject) {
  const preset = process.env.DYNAMODB_ENDPOINT;
  if (preset) {
    project.provide("dynamodbEndpoint", preset);
    return;
  }
  let container: string;
  try {
    container = docker("run", "-d", "--rm", "-p", "127.0.0.1::8000", IMAGE);
  } catch {
    console.warn("DynamoDB Local unavailable (no Docker): skipping its tests");
    project.provide("dynamodbEndpoint", null);
    return;
  }
  const port = docker("port", container, "8000/tcp").split(":").at(-1);
  project.provide("dynamodbEndpoint", `http://127.0.0.1:${port}`);
  return () => {
    docker("stop", container);
  };
}

function docker(...args: string[]) {
  return execFileSync("docker", args, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}
