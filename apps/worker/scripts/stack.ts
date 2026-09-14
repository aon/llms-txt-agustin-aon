import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { DynamoStore, S3FileStore, SqsQueue } from "@llms-txt/core/aws";

const STACK_NAME = process.env.STACK_NAME ?? "LlmsTxt";

/** Clients against the deployed stack, located through its CloudFormation outputs. */
export async function deployedStack() {
  const outputs = await stackOutputs();
  return {
    outputs,
    store: new DynamoStore({
      client: new DynamoDBClient({}),
      tableName: outputs.TableName,
    }),
    files: new S3FileStore({
      client: new S3Client({}),
      bucket: outputs.BucketName,
    }),
    queue: new SqsQueue({
      client: new SQSClient({}),
      queueUrl: outputs.QueueUrl,
    }),
  };
}

async function stackOutputs() {
  const result = await new CloudFormationClient({}).send(
    new DescribeStacksCommand({ StackName: STACK_NAME }),
  );
  const outputs: Record<string, string> = {};
  for (const output of result.Stacks?.[0]?.Outputs ?? []) {
    if (output.OutputKey && output.OutputValue) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }
  for (const key of ["TableName", "BucketName", "QueueUrl"] as const) {
    if (!outputs[key]) {
      throw new Error(
        `Stack ${STACK_NAME} has no output ${key}; is it deployed?`,
      );
    }
  }
  return outputs as Record<"TableName" | "BucketName" | "QueueUrl", string> &
    Record<string, string>;
}
