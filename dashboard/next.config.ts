import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5001/api/:path*',
      },
      {
        source: '/daas/:path*',
        destination: 'http://localhost:5001/daas/:path*',
      },
    ];
  },
};

export default nextConfig;
