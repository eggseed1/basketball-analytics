import { statsBoxScoreV3ToCdnShape } from "../../drbl/download/stats-boxscore-adapt";

import type { PbpProductSource } from "./product-types";
import { mapRawBoxSource } from "./source-map";

/** Normalize raw box payloads (CDN or stats v3) into CDN liveData shape. */
export function normalizeRawBoxPayload(
  raw: unknown,
  source: "cdn" | "stats" | "disk"
): { raw: unknown; provenance: PbpProductSource } | null {
  if ((raw as { game?: unknown }).game) {
    return { raw, provenance: mapRawBoxSource(source) };
  }
  if (source === "stats" || (raw as { boxScoreTraditional?: unknown }).boxScoreTraditional) {
    const adapted = statsBoxScoreV3ToCdnShape(raw);
    if (!adapted) return null;
    return { raw: adapted, provenance: "stats_nba" };
  }
  return null;
}
