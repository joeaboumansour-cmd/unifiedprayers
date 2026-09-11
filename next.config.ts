import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Van Dyck Bible is read from disk by the readings cron, not imported, so
  // the tracer cannot see it; without this it is missing from the deployed
  // function and every Orthodox day loses its Arabic row.
  outputFileTracingIncludes: {
    "/api/cron/readings": ["./src/data/bible/**/*"],
  },
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
