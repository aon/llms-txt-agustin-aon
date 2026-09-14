import { SendMessageCommand, type SQSClient } from "@aws-sdk/client-sqs";
import { type CrawlJobMessage, serializeCrawlJobMessage } from "../message.js";
import type { EnqueueOptions, JobQueue } from "../store/index.js";

export interface SqsQueueOptions {
  client: SQSClient;
  queueUrl: string;
}

export class SqsQueue implements JobQueue {
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(options: SqsQueueOptions) {
    this.client = options.client;
    this.queueUrl = options.queueUrl;
  }

  async enqueue(
    message: CrawlJobMessage,
    options: EnqueueOptions = {},
  ): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: serializeCrawlJobMessage(message),
        ...(options.delaySeconds === undefined
          ? {}
          : { DelaySeconds: options.delaySeconds }),
      }),
    );
  }
}
