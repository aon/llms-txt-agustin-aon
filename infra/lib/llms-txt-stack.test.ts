import { TABLE, TIMING } from "@llms-txt/core";
import { WORKER_ENV } from "@llms-txt/worker";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { LlmsTxtStack } from "./llms-txt-stack.ts";

/** Bundling is skipped so the test needs neither esbuild nor a built worker. */
function synth() {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new LlmsTxtStack(app, "Test");
  return Template.fromStack(stack);
}

describe("LlmsTxtStack", () => {
  const template = synth();

  it("creates the single table with both sparse indexes", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: TABLE.partitionKey, KeyType: "HASH" },
        { AttributeName: TABLE.sortKey, KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: TABLE.gsi1.name }),
        Match.objectLike({ IndexName: TABLE.gsi2.name }),
      ]),
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it("gives the job queue a visibility timeout matching the site lease and a three-strike DLQ", () => {
    template.hasResourceProperties("AWS::SQS::Queue", {
      VisibilityTimeout: TIMING.leaseTtlSeconds,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 3 }),
    });
    template.hasResourceProperties("AWS::SQS::Queue", {
      MessageRetentionPeriod: 14 * 24 * 60 * 60,
    });
  });

  it("runs the crawl worker one message at a time for the full fifteen minutes", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs24.x",
      Timeout: 900,
      MemorySize: 1024,
      Environment: {
        Variables: Match.objectLike({
          [WORKER_ENV.tableName]: Match.anyValue(),
          [WORKER_ENV.bucketName]: Match.anyValue(),
          [WORKER_ENV.queueUrl]: Match.anyValue(),
          [WORKER_ENV.openRouterSecretArn]: Match.anyValue(),
        }),
      },
    });
    // The bucket's auto-delete custom resource is a fourth function without the worker environment.
    template.resourcePropertiesCountIs(
      "AWS::Lambda::Function",
      {
        Environment: {
          Variables: Match.objectLike({
            [WORKER_ENV.tableName]: Match.anyValue(),
          }),
        },
      },
      3,
    );
    template.resourcePropertiesCountIs(
      "AWS::Lambda::EventSourceMapping",
      { BatchSize: 1 },
      2,
    );
  });

  it("sweeps for due sites every hour", () => {
    template.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "rate(1 hour)",
    });
  });

  it("keeps the bucket private and versioned", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      VersioningConfiguration: { Status: "Enabled" },
      PublicAccessBlockConfiguration: Match.objectLike({
        BlockPublicAcls: true,
        RestrictPublicBuckets: true,
      }),
    });
  });
});
