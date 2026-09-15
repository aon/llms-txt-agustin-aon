import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as amplify from "@aws-cdk/aws-amplify-alpha";
import { RESOURCE_ENV, TABLE, TIMING } from "@llms-txt/core";
import { WORKER_ENV } from "@llms-txt/worker";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
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
/** Amplify pulls the web app from this GitHub branch; the secret holds a PAT with admin:repo_hook. */
const WEB_SOURCE = {
  owner: "aon",
  repository: "llms-txt-agustin-aon",
  branch: "main",
  tokenSecret: "llms-txt/github-token",
};
const WEB_APP_ROOT = "apps/web";
/** DNS lives outside Route 53, so the certificate and subdomain records are added by hand from the outputs. */
const WEB_DOMAIN = { name: "agustinaon.com", prefix: "llms-txt" };
const NODE_VERSION = "24";

export class LlmsTxtStack extends Stack {
  readonly table: dynamodb.Table;
  readonly bucket: s3.Bucket;
  readonly queue: sqs.Queue;
  readonly deadLetterQueue: sqs.Queue;
  readonly openRouterSecret: secretsmanager.Secret;
  readonly crawlFunction: nodejs.NodejsFunction;
  readonly monitorFunction: nodejs.NodejsFunction;
  readonly deadLetterFunction: nodejs.NodejsFunction;
  readonly webApp: amplify.App;
  readonly webBranch: amplify.Branch;

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
    // Amplify Hosting (web app)
    // ------------------------------------------------------------------------
    const webComputeRole = new iam.Role(this, "WebComputeRole", {
      assumedBy: new iam.ServicePrincipal("amplify.amazonaws.com"),
      description: "Runtime role of the web app's server-side rendering",
    });
    this.table.grantReadWriteData(webComputeRole);
    this.bucket.grantRead(webComputeRole);
    this.queue.grantSendMessages(webComputeRole);

    this.webApp = new amplify.App(this, "WebApp", {
      platform: amplify.Platform.WEB_COMPUTE,
      sourceCodeProvider: new GitHubAppSource({
        owner: WEB_SOURCE.owner,
        repository: WEB_SOURCE.repository,
        accessToken: SecretValue.secretsManager(WEB_SOURCE.tokenSecret),
      }),
      computeRole: webComputeRole,
      buildSpec: codebuild.BuildSpec.fromObjectToYaml(webBuildSpec()),
      environmentVariables: {
        AMPLIFY_MONOREPO_APP_ROOT: WEB_APP_ROOT,
        [RESOURCE_ENV.tableName]: this.table.tableName,
        [RESOURCE_ENV.bucketName]: this.bucket.bucketName,
        [RESOURCE_ENV.queueUrl]: this.queue.queueUrl,
      },
    });
    this.webBranch = this.webApp.addBranch(WEB_SOURCE.branch, {
      stage: "PRODUCTION",
    });
    const webDomain = this.webApp.addDomain(WEB_DOMAIN.name, {
      subDomains: [{ branch: this.webBranch, prefix: WEB_DOMAIN.prefix }],
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
    new CfnOutput(this, "WebUrl", {
      value: `https://${this.webBranch.branchName}.${this.webApp.defaultDomain}`,
    });
    new CfnOutput(this, "WebDomainUrl", {
      value: `https://${WEB_DOMAIN.prefix}.${WEB_DOMAIN.name}`,
    });
    new CfnOutput(this, "WebDomainCname", {
      value: `${WEB_DOMAIN.prefix} CNAME ${this.webBranch.branchName}.${this.webApp.defaultDomain}`,
    });
    new CfnOutput(this, "WebCertificateRecord", {
      value: webDomain.certificateRecord,
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

/** The Amplify GitHub App flow: the app is installed on the repo and the PAT only lets Amplify register its webhook. */
class GitHubAppSource implements amplify.ISourceCodeProvider {
  readonly #props: GitHubAppSourceProps;

  constructor(props: GitHubAppSourceProps) {
    this.#props = props;
  }

  bind(): amplify.SourceCodeProviderConfig {
    return {
      repository: `https://github.com/${this.#props.owner}/${this.#props.repository}`,
      accessToken: this.#props.accessToken,
    };
  }
}

interface GitHubAppSourceProps {
  owner: string;
  repository: string;
  accessToken: SecretValue;
}

function webBuildSpec() {
  const runtimeEnv = Object.values(RESOURCE_ENV)
    .map((name) => `-e '^${name}='`)
    .join(" ");
  return {
    version: 1,
    applications: [
      {
        appRoot: WEB_APP_ROOT,
        frontend: {
          buildPath: "/",
          phases: {
            preBuild: {
              commands: [
                `nvm install ${NODE_VERSION} && nvm use ${NODE_VERSION}`,
                `npm install -g ${packageManager()}`,
                // Amplify's Next.js bundler cannot follow pnpm's isolated layout; pnpm 12 reads the linker from the workspace file, Amplify's monorepo detection from .npmrc.
                "echo node-linker=hoisted > .npmrc",
                "printf '\\nnodeLinker: hoisted\\n' >> pnpm-workspace.yaml",
                "pnpm install --frozen-lockfile",
              ],
            },
            build: {
              commands: [
                // Build-time variables reach the SSR runtime only through Next's env file.
                `env | grep ${runtimeEnv} >> ${WEB_APP_ROOT}/.env.production`,
                "pnpm turbo run build --filter=@llms-txt/web",
              ],
            },
          },
          artifacts: {
            baseDirectory: `${WEB_APP_ROOT}/.next`,
            files: ["**/*"],
          },
          cache: { paths: ["node_modules/**/*"] },
        },
      },
    ],
  };
}

function packageManager() {
  const root: { packageManager: string } = createRequire(import.meta.url)(
    "../../package.json",
  );
  return root.packageManager;
}
