import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile above this directory otherwise confuses trace collection.
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        // The worker must be allowed to control the whole origin, and must not
        // be cached by the CDN or the browser or updates never reach anyone.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
