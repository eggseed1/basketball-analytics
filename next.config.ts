import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ],
  },
  // Historical BDL season JSON lives under data/cache (gitignored locally but
  // required at runtime for Explore Games / Game Lab when present).
  // Scope tracing to game routes only — never attach the full tree to every page.
  outputFileTracingIncludes: {
    // Runtime data is intentionally loaded from disk instead of bundled into
    // client/server chunks. Next cannot statically trace dynamic path.join()
    // calls, so make the production server output self-contained on Vercel.
    "/*": [
      "./src/data/drbl/precomputed/**/*",
      "./src/data/media/portrait-lookup.json",
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
