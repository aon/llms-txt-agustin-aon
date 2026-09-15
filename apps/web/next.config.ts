import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Core ships ESM with Node built-ins and the AWS SDK; Node loads it directly instead of the bundler.
  serverExternalPackages: ["@llms-txt/core"],
  // Next externalizes client-s3 by default; Turbopack then links it from .next/node_modules with a path that breaks in Amplify's bundle.
  transpilePackages: ["@aws-sdk/client-s3"],
  // Dev only: any IPv4 host on the LAN may open the dev server; Next rejects a bare "*".
  allowedDevOrigins: ["*.*.*.*"],
};

export default nextConfig;
