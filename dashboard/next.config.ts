import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(process.cwd(), '..'),
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5002/api/:path*',
      },
      {
        source: '/daas/:path*',
        destination: 'http://localhost:5002/daas/:path*',
      },
    ];
  },
};

export default nextConfig;
