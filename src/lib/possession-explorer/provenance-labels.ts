import type { PbpProductSource } from "@/pbp/product-types";

/** Human-readable provenance labels — never expose raw enum strings in UI. */
export function provenanceSourceLabel(source: PbpProductSource): string {
  switch (source) {
    case "nba_cdn":
      return "NBA CDN";
    case "stats_nba":
      return "NBA Stats";
    case "espn":
      return "ESPN";
    case "disk_cache":
      return "Cached NBA data";
    case "sample":
      return "Sample data";
    case "balldontlie":
      return "BallDontLie";
    default: {
      const _exhaustive: never = source;
      return String(_exhaustive);
    }
  }
}
