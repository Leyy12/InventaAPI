import type { NextConfig } from "next";
import { resolve } from "node:path";
import { frontendReleaseConfig } from "../scripts/frontend-release-config.mjs";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { deploymentEnvironment } from "../services/system-settings-contract.mjs";

export default function nextConfig(phase: string): NextConfig {
  const releaseRewrites = frontendReleaseConfig({
    ...process.env,
    NODE_ENV: phase === PHASE_DEVELOPMENT_SERVER ? 'development' : 'production',
  }, 'admin');
  return {
    // Only this derived non-secret label is exposed; NODE_ENV alone is not a deployment identity.
    env: { NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT: phase === PHASE_DEVELOPMENT_SERVER ? 'Development' : deploymentEnvironment({
      vercelEnvironment: process.env.VERCEL_ENV,
      dataProjectId: process.env.NEXT_PUBLIC_DATA_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, // old name until Vercel is updated
      apiOrigin: process.env.NEXT_PUBLIC_API_URL,
    }) },
    turbopack: {
      root: resolve(process.cwd(), '..'),
    },
    async rewrites() {
      return releaseRewrites;
    },
  };
}
