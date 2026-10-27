import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted: build a standalone server bundle for Docker.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // ICS imports can be large.
    serverActions: { bodySizeLimit: "12mb" },
    // src/proxy.ts buffers request bodies; .ics imports are up to 10 MB.
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;
