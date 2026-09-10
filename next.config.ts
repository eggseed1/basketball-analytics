import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // Keep icon / chart trees out of shared server chunks where possible.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  // Ensure Workers Paid product flags survive Next’s build-time env inlining.
  // Wrangler `vars` alone are not visible during `next build` / OpenNext compile.
  env: {
    FULL_EDGE_PRODUCT: process.env.FULL_EDGE_PRODUCT ?? "1",
    DATA_PROVIDER: process.env.DATA_PROVIDER ?? "nba",
  },
  async redirects() {
    return [
      {
        source: "/learn/war1",
        destination: "/learn/drbl/war1",
        permanent: true,
      },
      {
        source: "/learn/wins-above-r1",
        destination: "/learn/drbl/war1",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.nba.com",
        pathname: "/headshots/**",
      },
      {
        protocol: "https",
        hostname: "cdn.nba.com",
        pathname: "/logos/**",
      },
      {
        protocol: "https",
        hostname: "cdn.nba.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.basketball-reference.com",
        pathname: "/req/**",
      },
    ],
  },
  // Historical BDL season JSON lives under data/cache (gitignored locally but
  // required at runtime for Explore Games / Game Lab when present).
  // Scope tracing to game routes only — never attach the full tree to every page.
  outputFileTracingIncludes: {
    // Runtime data is intentionally loaded from disk instead of bundled into
    // client/server chunks. Next cannot statically trace dynamic path.join()
    // calls, so make the production server output self-contained on deploy.
    "/*": [
      "./src/data/drbl/precomputed/**/*",
      "./src/data/media/portrait-lookup.json",
      "./src/data/runtime/asset-ledger-snapshot.json",
      "./src/data/runtime/game-snapshot.json",
      "./data/cba/**/*",
      "./data/front-office/v1/**/*",
      "./data/impact/**/*",
      "./data/movement-center/v1/**/*",
      "./data/salaries/**/*",
      "./data/sentiment/v1/**/*",
      "./data/transactions/curated/v1/**/*",
      "./data/transactions/espn-site-v2/v1/manifest.json",
      "./data/transactions/espn-site-v2/v1/transactions.jsonl",
      "./data/transactions/espn-site-v2/v1/ownership-edges.jsonl",
      "./data/transactions/espn-site-v2/v1/validation-summary.json",
    ],
    "/games/[gameId]": ["./data/cache/games/**/*"],
    "/explore/games": ["./data/cache/games/**/*"],
  },
};

export default nextConfig;
