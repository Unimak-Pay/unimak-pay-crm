import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: {
      // msw's exports map has `"node": null` for msw/browser, which Turbopack resolves even for
      // browser bundles and SSR. Point at the real file; it only runs in the browser, in mock mode.
      "msw/browser": "./node_modules/msw/lib/browser/index.js",
    },
  },
};

export default nextConfig;
