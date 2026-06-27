import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable static page generation — this app requires client-side wallet providers
  // Pages render on-demand (SSR) or fully client-side via 'use client'
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  experimental: {
    // Silence the pnpm lockfile workspace warning
  },
};

export default nextConfig;
