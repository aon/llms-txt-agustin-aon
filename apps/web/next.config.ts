import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Core ships ESM with Node built-ins and the AWS SDK; Node loads it directly instead of the bundler.
  serverExternalPackages: ["@llms-txt/core"],
  // Dev only: any IPv4 host on the LAN may open the dev server; Next rejects a bare "*".
  allowedDevOrigins: ["*.*.*.*"],
};

export default nextConfig;
