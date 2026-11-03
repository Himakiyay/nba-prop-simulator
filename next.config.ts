import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The desk is opened at 127.0.0.1. Next only allows localhost by default,
  // and a blocked dev bundle leaves the page as static HTML that ignores clicks.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
