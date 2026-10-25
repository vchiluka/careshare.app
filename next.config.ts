import type { NextConfig } from "next";

/**
 * The demo keeps all state in memory and renders every page dynamically, so Cache Components
 * (and its Suspense requirements) are off. Turn them on when a database-backed store lands.
 */
const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
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
