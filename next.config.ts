import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  outputFileTracingIncludes: {
    "/**": ["./data/cache/games/**/*"],
  },
};

export default nextConfig;
