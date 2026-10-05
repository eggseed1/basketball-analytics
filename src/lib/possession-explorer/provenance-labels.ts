import type { PbpProductSource } from "@/pbp/product-types";

/** Human-readable provenance labels — never expose raw enum strings in UI. */
export function provenanceSourceLabel(source: PbpProductSource): string {
  switch (source) {
    case "nba_cdn":
      return "Primary feed";
    case "stats_nba":
      return "Stats feed";
    case "espn":
      return "Secondary feed";
    case "disk_cache":
      return "Cached data";
    case "sample":
      return "Sample data";
    case "balldontlie":
      return "Backup feed";
    default: {
      const _exhaustive: never = source;
      return String(_exhaustive);
    }
  }
}
