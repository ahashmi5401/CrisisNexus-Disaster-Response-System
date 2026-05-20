import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // This allows the production build to pass even if there are linting errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // If you run into strict type checking errors that stall the build later,
    // uncomment the line below to let those pass through as well:
    // ignoreBuildErrors: true,
  }
};

export default nextConfig;