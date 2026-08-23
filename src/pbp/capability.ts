import type { GamePlayByPlay } from "@/data/types/play-by-play";

import type {
  GamePbpCapability,
  GamePbpCapabilityStatus,
  PossessionCalibrationGrade,
  PbpProductSource,
  PbpProvenance,
} from "./product-types";
import { mapRawPbpSource } from "./source-map";

export function mapPlayByPlaySource(
  source: GamePlayByPlay["source"] | "disk" | "disk_cache" | undefined
): PbpProductSource | null {
  if (!source) return null;
  if (source === "disk_cache") return "disk_cache";
  return mapRawPbpSource(source === "disk" ? "disk" : source);
}

export function buildGamePbpCapability(input: {
  rawEventCount: number;
  source?: PbpProductSource | null;
  provenance?: PbpProvenance | null;
  scoreTimelineAvailable?: boolean;
  possessionsDerived?: boolean;
  lineupsDerived?: boolean;
  officialPossessionTotalsAvailable?: boolean;
  possessionCalibrationGrade?: PossessionCalibrationGrade;
}): GamePbpCapability {
  const rawPbpAvailable = input.rawEventCount > 0;
  const possessionsDerived = Boolean(
    input.possessionsDerived && rawPbpAvailable
  );
  const lineupsDerived = Boolean(
    input.lineupsDerived && possessionsDerived && rawPbpAvailable
  );
  const officialPossessionTotalsAvailable = Boolean(
    input.officialPossessionTotalsAvailable
  );
  const possessionCalibrationGrade: PossessionCalibrationGrade =
    input.possessionCalibrationGrade ??
    (officialPossessionTotalsAvailable && possessionsDerived
      ? "outside_tolerance"
      : "not_comparable");

  let status: GamePbpCapabilityStatus = "unavailable";
  if (lineupsDerived) status = "lineups_available";
  else if (possessionsDerived) status = "possessions_available";
  else if (rawPbpAvailable) status = "raw_available";

  return {
    rawPbpAvailable,
    rawEventCount: input.rawEventCount,
    scoreTimelineAvailable: Boolean(input.scoreTimelineAvailable),
    possessionsDerived,
    reconstructedPossessionsAvailable: possessionsDerived,
    officialPossessionTotalsAvailable,
    possessionCalibrationGrade,
    lineupsDerived,
    source: rawPbpAvailable ? (input.source ?? null) : null,
    provenance: rawPbpAvailable ? (input.provenance ?? null) : null,
    status,
  };
}

export function unavailableCapability(
  source: PbpProductSource | null = null
): GamePbpCapability {
  return buildGamePbpCapability({
    rawEventCount: 0,
    source,
  });
}
