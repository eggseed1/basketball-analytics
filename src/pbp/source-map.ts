import type { PbpProductSource } from "./product-types";

export function mapRawPbpSource(
  source: "cdn" | "stats" | "espn" | "disk" | "sample" | "bdl" | undefined
): PbpProductSource | null {
  if (!source) return null;
  if (source === "cdn") return "nba_cdn";
  if (source === "stats") return "stats_nba";
  if (source === "espn") return "espn";
  if (source === "sample") return "sample";
  if (source === "disk") return "disk_cache";
  if (source === "bdl") return "balldontlie";
  return null;
}

export function mapRawBoxSource(
  source: "cdn" | "stats" | "disk" | "bdl"
): PbpProductSource {
  if (source === "cdn") return "nba_cdn";
  if (source === "stats") return "stats_nba";
  if (source === "bdl") return "balldontlie";
  return "disk_cache";
}
