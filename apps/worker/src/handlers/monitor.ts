import type { Handler } from "aws-lambda";
import { sweep } from "../monitor.js";
import { baseDeps, log } from "../runtime.js";

const deps = baseDeps();

export const handler: Handler = async () => {
  const enqueued = await sweep(deps);
  log("monitor sweep done", { enqueued });
};
