import { fileURLToPath } from "node:url";
import { TABLE, TIMING } from "@llms-txt/core";
import { WORKER_ENV } from "@llms-txt/worker";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import { LambdaInvoke } from "aws-cdk-lib/aws-scheduler-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

/** Removal policy destroy: this is a testing application, so nothing survives a stack deletion. */
const REMOVAL_POLICY = RemovalPolicy.DESTROY;
/** How often the monitor looks for sites due for a re-crawl. */
const SWEEP_EVERY = Duration.hours(24);

export class LlmsTxtStack extends Stack {
  readonly table: dynamodb.Table;
  readonly bucket: s3.Bucket;
  readonly queue: sqs.Queue;
  readonly deadLetterQueue: sqs.Queue;
  readonly openRouterSecret: secretsmanager.Secret;
  readonly crawlFunction: nodejs.NodejsFunction;
  readonly monitorFunction: nodejs.NodejsFunction;
  readonly deadLetterFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------------
    // DynamoDB Table
    // ------------------------------------------------------------------------
    this.table = new dynamodb.Table(this, "Table", {
      partitionKey: {
        name: TABLE.partitionKey,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: TABLE.sortKey, type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: REMOVAL_POLICY,
    });
    for (const index of [TABLE.gsi1, TABLE.gsi2]) {
      this.table.addGlobalSecondaryIndex({
        indexName: index.name,
        partitionKey: {
          name: index.partitionKey,
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: { name: index.sortKey, type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    // ------------------------------------------------------------------------
    // S3 Bucket
    // ------------------------------------------------------------------------
    this.bucket = new s3.Bucket(this, "Bucket", {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: REMOVAL_POLICY,
      autoDeleteObjects: true,
    });

    // ------------------------------------------------------------------------
    // SQS Queues
    // ------------------------------------------------------------------------
    this.deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });
    const visibilityTimeout = Duration.seconds(TIMING.leaseTtlSeconds);
    this.queue = new sqs.Queue(this, "CrawlJobs", {
      visibilityTimeout,
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: 3 },
    });

    // ------------------------------------------------------------------------
    // Secrets Manager
    // ------------------------------------------------------------------------
    this.openRouterSecret = new secretsmanager.Secret(
      this,
      "OpenRouterApiKey",
      {
        description:
          "OpenRouter API key the crawl worker uses to write llms.txt prose",
        secretStringValue: SecretValue.unsafePlainText("placeholder-set-me"),
      },
    );

    // ------------------------------------------------------------------------
    // Lambda Functions
    // ------------------------------------------------------------------------
    const environment = {
      [WORKER_ENV.tableName]: this.table.tableName,
      [WORKER_ENV.bucketName]: this.bucket.bucketName,
      [WORKER_ENV.queueUrl]: this.queue.queueUrl,
      [WORKER_ENV.openRouterSecretArn]: this.openRouterSecret.secretArn,
    };

    this.crawlFunction = this.workerFunction("CrawlWorker", {
      entry: handlerEntry("crawl-job"),
      // Platform maximum; the crawl itself stops at TIMING.workerBudgetMs and continues in a new job.
      timeout: Duration.minutes(15),
      memorySize: 1024,
      environment,
    });
    this.crawlFunction.addEventSource(
      new SqsEventSource(this.queue, { batchSize: 1 }),
    );
    this.table.grantReadWriteData(this.crawlFunction);
    this.bucket.grantReadWrite(this.crawlFunction);
    this.queue.grantSendMessages(this.crawlFunction);
    this.openRouterSecret.grantRead(this.crawlFunction);

    this.monitorFunction = this.workerFunction("MonitorSweep", {
      entry: handlerEntry("monitor"),
      timeout: Duration.minutes(1),
      memorySize: 256,
      environment,
    });
    this.table.grantReadWriteData(this.monitorFunction);
    this.queue.grantSendMessages(this.monitorFunction);

    this.deadLetterFunction = this.workerFunction("DeadLetterHandler", {
      entry: handlerEntry("dead-letter"),
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment,
    });
    this.deadLetterFunction.addEventSource(
      new SqsEventSource(this.deadLetterQueue, { batchSize: 1 }),
    );
    this.table.grantReadWriteData(this.deadLetterFunction);

    // ------------------------------------------------------------------------
    // EventBridge Scheduler
    // ------------------------------------------------------------------------
    new scheduler.Schedule(this, "MonitorSchedule", {
      schedule: scheduler.ScheduleExpression.rate(SWEEP_EVERY),
      target: new LambdaInvoke(this.monitorFunction),
      description: "Enqueue crawls for sites whose re-crawl is due",
    });

    // ------------------------------------------------------------------------
    // Outputs
    // ------------------------------------------------------------------------
    new CfnOutput(this, "TableName", { value: this.table.tableName });
    new CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "QueueUrl", { value: this.queue.queueUrl });
    new CfnOutput(this, "OpenRouterSecretArn", {
      value: this.openRouterSecret.secretArn,
    });
  }

  private workerFunction(
    id: string,
    props: Pick<
      nodejs.NodejsFunctionProps,
      "entry" | "timeout" | "memorySize" | "environment"
    >,
  ) {
    return new nodejs.NodejsFunction(this, id, {
      ...props,
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "handler",
      projectRoot: repoRoot(),
      depsLockFilePath: fileURLToPath(
        new URL("../../pnpm-lock.yaml", import.meta.url),
      ),
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: REMOVAL_POLICY,
      }),
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node24",
        mainFields: ["module", "main"],
        // Pinned SDK versions travel with the code instead of whatever the runtime ships.
        externalModules: [],
        sourceMap: true,
        minify: false,
        // Bundled CommonJS dependencies still call require().
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
  }
}

function repoRoot() {
  return fileURLToPath(new URL("../..", import.meta.url));
}

function handlerEntry(name: string) {
  return fileURLToPath(
    new URL(`../../apps/worker/src/handlers/${name}.ts`, import.meta.url),
  );
}
