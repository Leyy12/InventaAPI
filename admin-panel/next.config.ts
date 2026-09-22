import type { NextConfig } from "next";
import { resolve } from "node:path";
import { frontendReleaseConfig } from "../scripts/frontend-release-config.mjs";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const releaseRewrites = frontendReleaseConfig({
    ...process.env,
    NODE_ENV: phase === PHASE_DEVELOPMENT_SERVER ? 'development' : 'production',
  }, 'admin');
  return {
    turbopack: {
      root: resolve(process.cwd(), '..'),
    },
    async rewrites() {
      return releaseRewrites;
    },
  };
}
