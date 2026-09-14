import { App } from "aws-cdk-lib";
import { LlmsTxtStack } from "../lib/llms-txt-stack.ts";

const app = new App();
const { CDK_DEFAULT_ACCOUNT: account, CDK_DEFAULT_REGION: region } =
  process.env;
new LlmsTxtStack(app, "LlmsTxt", {
  env: {
    ...(account ? { account } : {}),
    ...(region ? { region } : {}),
  },
});
