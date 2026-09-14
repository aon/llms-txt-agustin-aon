import type { SQSHandler } from "aws-lambda";
import { giveUp } from "../dead-letter.js";
import { baseDeps } from "../runtime.js";

const deps = baseDeps();

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    await giveUp(record.body, deps);
  }
};
