import { writeFile } from "node:fs/promises";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { RESOURCE_ENV } from "@llms-txt/core";

const STACK_NAME = process.env.STACK_NAME ?? "LlmsTxt";
const ENV_FILE = new URL("../.env.local", import.meta.url);

/** Writes .env.local from the deployed stack so `next dev` talks to the real table, bucket and queue. */
async function main() {
  const client = new CloudFormationClient({});
  const result = await client.send(
    new DescribeStacksCommand({ StackName: STACK_NAME }),
  );
  const outputs = new Map(
    (result.Stacks?.[0]?.Outputs ?? []).map((output) => [
      output.OutputKey,
      output.OutputValue,
    ]),
  );
  const lines = [
    `AWS_REGION=${await client.config.region()}`,
    ...Object.entries({
      [RESOURCE_ENV.tableName]: "TableName",
      [RESOURCE_ENV.bucketName]: "BucketName",
      [RESOURCE_ENV.queueUrl]: "QueueUrl",
    }).map(([name, outputKey]) => {
      const value = outputs.get(outputKey);
      if (!value) {
        throw new Error(
          `Stack ${STACK_NAME} has no output ${outputKey}; is it deployed?`,
        );
      }
      return `${name}=${value}`;
    }),
  ];
  await writeFile(ENV_FILE, `${lines.join("\n")}\n`);
  process.stdout.write(
    `Wrote ${lines.length} variables to apps/web/.env.local\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
