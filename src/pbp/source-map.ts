import type { PbpProductSource } from "./product-types";

export function mapRawPbpSource(
  source: "cdn" | "stats" | "espn" | "disk" | "sample" | undefined
): PbpProductSource | null {
  if (!source) return null;
  if (source === "cdn") return "nba_cdn";
  if (source === "stats") return "stats_nba";
  if (source === "espn") return "espn";
  if (source === "sample") return "sample";
  if (source === "disk") return "disk_cache";
  return null;
}

export function mapRawBoxSource(
  source: "cdn" | "stats" | "disk"
): PbpProductSource {
  if (source === "cdn") return "nba_cdn";
  if (source === "stats") return "stats_nba";
  return "disk_cache";
}
