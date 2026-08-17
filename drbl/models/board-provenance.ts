/**
 * M16b.1 — Production board provenance (path / metadata / auditability only).
 *
 * Does NOT change P/LN/B/M6/fusion/posterior/WAR formulas.
 * Answers: where did each displayed DRBL/100 and DRBL-WAR number come from?
 */

import { createHash } from "node:crypto";

import { warFromImpact } from "./leaderboard";
import { ABILITY_LINEAGE_VERSION, CANONICAL_ABILITY_INPUT } from "./ability-lineage";

export const BOARD_PROVENANCE_VERSION = "board-provenance-v1";

/** Display rounding for published ability on the explore table (1 decimal). */
export const DRBL100_DISPLAY_DECIMALS = 1;
/** Stored artifact drbl100 is typically 2 decimals. */
export const DRBL100_ARTIFACT_TOLERANCE = 0.011;
/** WAR display is 2 decimals; reconstruction allows rounding of impact. */
export const WAR_RECONSTRUCTION_TOLERANCE = 0.02;

export type WarArchitectureClass =
  | "A_published_drbl100"
  | "B_calibrated_posterior"
  | "C_raw_ability_impact"
  | "D_loo_transformed"
  | "E_legacy_field"
  | "F_site_computed"
  | "UNKNOWN";

export type PlayerUniverseDiffReason =
  | "new_player_added_after_freeze"
  | "duplicate_player_id"
  | "player_team_stint_duplication"
  | "traded_player_split"
  | "two_way_player"
  | "zero_possession_player"
  | "different_eligibility_threshold"
  | "site_only_metadata_row"
  | "stale_artifact_row"
  | "artifact_merge_issue"
  | "unknown";

export interface BoardProvenance {
  season: string;
  artifactPath: string;
  artifactHash: string;
  artifactGenerationId: string | null;
  sourceGameCount: number | null;
  playerCount: number;
  rankingVersion: string | null;
  rankingFormulaVersion: string | null;
  abilityLineageVersion: string | null;
  publishedAbilityField: "drbl100";
  publishedAbilityInput: string | null;
  warAvailable: boolean;
  warFormulaVersion: string | null;
  warCalibrationVersion: string | null;
  warCalibrationAbilityInput: string | null;
  warArchitectureClass: WarArchitectureClass;
  warParentAbilityGenerationId: string | null;
  pipelineVersion: string | null;
  generatedAt: string | null;
  boardProvenanceVersion: typeof BOARD_PROVENANCE_VERSION;
}

export interface SeasonArtifactLike {
  season?: string;
  version?: string;
  generatedAt?: string;
  gamesProcessed?: number;
  artifactGenerationId?: string;
  abilityLineageVersion?: string;
  rankingFormulaVersion?: string;
  warFormulaVersion?: string;
  pipelineVersion?: string;
  warModel?: {
    version?: string;
    calibrationInput?: string;
    pointsPerWin?: number;
    reason?: string;
  };
  players?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class StaleWarJoinError extends Error {
  readonly code = "STALE_WAR_JOIN_REJECTED";
  constructor(message: string) {
    super(message);
    this.name = "StaleWarJoinError";
  }
}

export class PlayerUniverseMismatchError extends Error {
  readonly code = "PLAYER_UNIVERSE_MISMATCH";
  constructor(message: string) {
    super(message);
    this.name = "PlayerUniverseMismatchError";
  }
}

export class DuplicatePlayerSeasonError extends Error {
  readonly code = "DUPLICATE_PLAYER_SEASON";
  constructor(message: string) {
    super(message);
    this.name = "DuplicatePlayerSeasonError";
  }
}

export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function classifyWarArchitecture(
  artifact: SeasonArtifactLike
): WarArchitectureClass {
  const pipe = artifact.pipelineVersion ?? artifact.warFormulaVersion;
  const calIn =
    artifact.warModel?.calibrationInput ??
    (artifact.players?.[0] as { warCalibrationAbilityInput?: string } | undefined)
      ?.warCalibrationAbilityInput;
  if (pipe && String(pipe).startsWith("4") && calIn === "posterior") {
    return "B_calibrated_posterior";
  }
  if (pipe && String(pipe).startsWith("4")) {
    return "D_loo_transformed";
  }
  // Provisional season WAR: seasonalImpact from raw residual / pointsPerWin.
  const sample = artifact.players?.[0] as
    | { pointsPerWin?: number; warFormulaVersion?: string }
    | undefined;
  if (!pipe && (sample?.pointsPerWin === 30 || sample?.pointsPerWin == null)) {
    return "C_raw_ability_impact";
  }
  return "UNKNOWN";
}

export function extractBoardProvenance(
  artifact: SeasonArtifactLike,
  opts: { artifactPath: string; artifactHash: string }
): BoardProvenance {
  const players = artifact.players ?? [];
  const warAvailable = players.some(
    (p) => Number((p as { drblWar?: number }).drblWar) !== 0
  );
  const sample = players[0] as
    | {
        publishedAbilityInput?: string;
        rankingFormulaVersion?: string;
        warCalibrationAbilityInput?: string;
        pointsPerWin?: number;
      }
    | undefined;

  return {
    season: String(artifact.season ?? ""),
    artifactPath: opts.artifactPath,
    artifactHash: opts.artifactHash,
    artifactGenerationId: artifact.artifactGenerationId ?? null,
    sourceGameCount: artifact.gamesProcessed ?? null,
    playerCount: players.length,
    rankingVersion: artifact.version ?? null,
    rankingFormulaVersion:
      artifact.rankingFormulaVersion ?? sample?.rankingFormulaVersion ?? null,
    abilityLineageVersion:
      artifact.abilityLineageVersion ?? ABILITY_LINEAGE_VERSION,
    publishedAbilityField: "drbl100",
    publishedAbilityInput:
      sample?.publishedAbilityInput ?? CANONICAL_ABILITY_INPUT,
    warAvailable,
    warFormulaVersion: artifact.warFormulaVersion ?? null,
    warCalibrationVersion: artifact.warModel?.version ?? null,
    warCalibrationAbilityInput:
      artifact.warModel?.calibrationInput ??
      sample?.warCalibrationAbilityInput ??
      (classifyWarArchitecture(artifact) === "C_raw_ability_impact"
        ? "rawAbilityRate_via_seasonalImpact"
        : null),
    warArchitectureClass: classifyWarArchitecture(artifact),
    warParentAbilityGenerationId: artifact.artifactGenerationId ?? null,
    pipelineVersion: artifact.pipelineVersion ?? null,
    generatedAt: artifact.generatedAt ?? null,
    boardProvenanceVersion: BOARD_PROVENANCE_VERSION,
  };
}

/** Assert ability/WAR/site layers share one generation (or explicit parent). */
export function assertCompatibleBoardGenerations(args: {
  abilityGenerationId: string | null | undefined;
  warGenerationId?: string | null | undefined;
  rankingGenerationId?: string | null | undefined;
  siteGenerationId?: string | null | undefined;
  warParentAbilityGenerationId?: string | null | undefined;
}): void {
  const ability = args.abilityGenerationId ?? null;
  const war = args.warGenerationId ?? ability;
  const ranking = args.rankingGenerationId ?? ability;
  const site = args.siteGenerationId ?? ability;
  const warParent = args.warParentAbilityGenerationId ?? war;

  if (ability && war && ability !== war && warParent !== ability) {
    throw new StaleWarJoinError(
      `abilityGenerationId=${ability} warGenerationId=${war} warParent=${warParent}`
    );
  }
  if (ability && ranking && ability !== ranking) {
    throw new StaleWarJoinError(
      `abilityGenerationId=${ability} rankingGenerationId=${ranking}`
    );
  }
  if (ability && site && ability !== site) {
    throw new StaleWarJoinError(
      `abilityGenerationId=${ability} siteGenerationId=${site}`
    );
  }
}

/** Reject joining a WAR overlay from a different ability generation. */
export function assertWarJoinCompatible(
  abilityGenerationId: string,
  warArtifactGenerationId: string,
  warParentAbilityGenerationId?: string | null
): void {
  if (abilityGenerationId === warArtifactGenerationId) return;
  if (warParentAbilityGenerationId === abilityGenerationId) return;
  throw new StaleWarJoinError(
    `STALE_WAR_JOIN_REJECTED: ability=${abilityGenerationId} war=${warArtifactGenerationId}`
  );
}

export function assertUniquePlayerSeasonRows(
  rows: Array<{ playerId: string; season?: string }>,
  opts: { stintMode?: boolean } = {}
): void {
  if (opts.stintMode) return;
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.playerId}::${r.season ?? ""}`;
    if (seen.has(key)) {
      throw new DuplicatePlayerSeasonError(
        `duplicate player-season row: ${key}`
      );
    }
    seen.add(key);
  }
}

export function assertCanonicalPlayerUniverse(
  boardPlayerIds: string[],
  canonicalPlayerIds: string[],
  opts: { allowSiteOnlyZeros?: boolean; siteOnlyIds?: string[] } = {}
): void {
  const canon = new Set(canonicalPlayerIds);
  const allowed = new Set(opts.siteOnlyIds ?? []);
  const extras = boardPlayerIds.filter((id) => !canon.has(id));
  if (opts.allowSiteOnlyZeros) {
    const unexpected = extras.filter((id) => !allowed.has(id));
    if (unexpected.length) {
      throw new PlayerUniverseMismatchError(
        `PLAYER_UNIVERSE_MISMATCH unexpected board-only ids: ${unexpected.join(",")}`
      );
    }
    return;
  }
  if (extras.length) {
    throw new PlayerUniverseMismatchError(
      `PLAYER_UNIVERSE_MISMATCH board-only: ${extras.join(",")}`
    );
  }
}

export function reconstructProvisionalWar(player: {
  rawAbilityRate?: number;
  replacementLevelRate?: number;
  actualPossessions?: number;
  possessions?: number;
  seasonalImpact?: number;
  pointsPerWin?: number;
}): {
  warInputRate: number;
  replacementLevel: number;
  possessions: number;
  calculatedImpact: number;
  pointsPerWin: number;
  calculatedWAR: number;
} {
  const possessions = Number(
    player.actualPossessions ?? player.possessions ?? 0
  );
  const replacementLevel = Number(player.replacementLevelRate ?? 0);
  const warInputRate = Number(player.rawAbilityRate ?? 0);
  const pointsPerWin = Number(player.pointsPerWin ?? 30);
  const calculatedImpact =
    ((warInputRate - replacementLevel) * possessions) / 100;
  const calculatedWAR = warFromImpact(calculatedImpact, pointsPerWin);
  return {
    warInputRate,
    replacementLevel,
    possessions,
    calculatedImpact,
    pointsPerWin,
    calculatedWAR,
  };
}

export function reconstructDisplayedDrbl100(player: {
  posteriorAbilityRate?: number;
  drbl100?: number;
}): {
  sourceDrbl100: number;
  displayedDrbl100: number;
  drblDisplayResidual: number;
} {
  const source = Number(player.posteriorAbilityRate ?? player.drbl100 ?? 0);
  const displayed = Number(player.drbl100 ?? source);
  return {
    sourceDrbl100: source,
    displayedDrbl100: displayed,
    drblDisplayResidual: displayed - source,
  };
}

export interface BoardCompareResult {
  boardOnlyPlayers: string[];
  artifactOnlyPlayers: string[];
  drblMismatches: Array<{
    playerId: string;
    board: number;
    artifact: number;
    residual: number;
  }>;
  warMismatches: Array<{
    playerId: string;
    board: number;
    artifact: number;
    residual: number;
  }>;
  generationMismatches: string[];
  metadataMismatches: string[];
}

export function compareBoardToArtifact(
  board: {
    players: Array<{
      playerId: string;
      drbl100?: number;
      drblWar?: number;
      artifactGenerationId?: string;
    }>;
    artifactGenerationId?: string;
  },
  canonicalArtifact: SeasonArtifactLike
): BoardCompareResult {
  const artPlayers = (canonicalArtifact.players ?? []) as Array<{
    playerId: string;
    drbl100?: number;
    drblWar?: number;
  }>;
  const boardById = new Map(board.players.map((p) => [p.playerId, p]));
  const artById = new Map(artPlayers.map((p) => [p.playerId, p]));

  const boardOnlyPlayers = [...boardById.keys()].filter((id) => !artById.has(id));
  const artifactOnlyPlayers = [...artById.keys()].filter(
    (id) => !boardById.has(id)
  );

  const drblMismatches: BoardCompareResult["drblMismatches"] = [];
  const warMismatches: BoardCompareResult["warMismatches"] = [];
  for (const [id, art] of artById) {
    const b = boardById.get(id);
    if (!b) continue;
    const dRes = Number(b.drbl100 ?? 0) - Number(art.drbl100 ?? 0);
    if (Math.abs(dRes) > DRBL100_ARTIFACT_TOLERANCE) {
      drblMismatches.push({
        playerId: id,
        board: Number(b.drbl100 ?? 0),
        artifact: Number(art.drbl100 ?? 0),
        residual: dRes,
      });
    }
    const wRes = Number(b.drblWar ?? 0) - Number(art.drblWar ?? 0);
    if (Math.abs(wRes) > WAR_RECONSTRUCTION_TOLERANCE) {
      warMismatches.push({
        playerId: id,
        board: Number(b.drblWar ?? 0),
        artifact: Number(art.drblWar ?? 0),
        residual: wRes,
      });
    }
  }

  const generationMismatches: string[] = [];
  const siteGen = board.artifactGenerationId ?? null;
  const artGen = canonicalArtifact.artifactGenerationId ?? null;
  if (siteGen && artGen && siteGen !== artGen) {
    generationMismatches.push(`site=${siteGen} artifact=${artGen}`);
  }

  const metadataMismatches: string[] = [];
  if (
    board.players.length !== artPlayers.length &&
    boardOnlyPlayers.length === 0 &&
    artifactOnlyPlayers.length === 0
  ) {
    metadataMismatches.push("player_count_mismatch_with_identical_ids");
  }

  return {
    boardOnlyPlayers,
    artifactOnlyPlayers,
    drblMismatches,
    warMismatches,
    generationMismatches,
    metadataMismatches,
  };
}

export function assertProductionBoardBuild(args: {
  players: Array<{
    playerId: string;
    season?: string;
    drbl100?: number;
    drblWar?: number;
    posteriorAbilityRate?: number;
  }>;
  provenance: BoardProvenance;
  expectedSeason: string;
  expectedGameCount?: number | null;
  stintMode?: boolean;
}): void {
  const { players, provenance } = args;
  if (provenance.season !== args.expectedSeason) {
    throw new Error(
      `season mismatch: provenance=${provenance.season} expected=${args.expectedSeason}`
    );
  }
  if (
    args.expectedGameCount != null &&
    provenance.sourceGameCount != null &&
    provenance.sourceGameCount !== args.expectedGameCount
  ) {
    throw new Error(
      `gameCount mismatch: ${provenance.sourceGameCount} vs ${args.expectedGameCount}`
    );
  }
  assertUniquePlayerSeasonRows(players, { stintMode: args.stintMode });
  for (const p of players) {
    const d = Number(p.drbl100);
    const w = Number(p.drblWar);
    if (!Number.isFinite(d) || !Number.isFinite(w)) {
      throw new Error(`NaN/Infinity metrics for ${p.playerId}`);
    }
    if (p.posteriorAbilityRate == null && d !== 0) {
      throw new Error(`canonical DRBL field missing for ${p.playerId}`);
    }
  }
  if (provenance.warAvailable && !provenance.warCalibrationAbilityInput) {
    throw new Error("WAR shown but warCalibrationAbilityInput missing");
  }
  assertCompatibleBoardGenerations({
    abilityGenerationId: provenance.artifactGenerationId,
    warGenerationId: provenance.artifactGenerationId,
    rankingGenerationId: provenance.artifactGenerationId,
    siteGenerationId: provenance.artifactGenerationId,
    warParentAbilityGenerationId: provenance.warParentAbilityGenerationId,
  });
}

export interface ProductionPlayerTrace {
  player: string;
  playerId: string;
  season: string;
  artifactGenerationId: string | null;
  P: number | null;
  LN: number | null;
  B: number | null;
  SDV: number | null;
  rawAbilityRate: number | null;
  fusedRateRaw: number | null;
  posteriorAbilityRate: number | null;
  canonicalDrbl100: number | null;
  displayedDrbl100: number | null;
  warCalibrationAbilityInput: string | null;
  warInputRate: number | null;
  warCalibratedRate: number | null;
  replacementLevel: number | null;
  actualOnCourtPossessions: number | null;
  pointsPerWin: number | null;
  calculatedWAR: number | null;
  displayedWAR: number | null;
  warFormulaResidual: number | null;
  rankingPosition: number | null;
  warArchitectureClass: WarArchitectureClass;
  sourceArtifacts: string[];
  rowProvenanceStatus: "PASS" | "FAIL" | "SITE_ONLY_ZERO";
}

export function traceProductionPlayer(
  playerId: string,
  season: string,
  artifact: SeasonArtifactLike,
  opts: { artifactPath?: string } = {}
): ProductionPlayerTrace | null {
  const players = (artifact.players ?? []) as Array<Record<string, unknown>>;
  const p = players.find((row) => String(row.playerId) === playerId);
  if (!p) return null;

  const arch = classifyWarArchitecture(artifact);
  const recon = reconstructProvisionalWar({
    rawAbilityRate: Number(p.rawAbilityRate ?? 0),
    replacementLevelRate: Number(p.replacementLevelRate ?? 0),
    actualPossessions: Number(p.actualPossessions ?? p.possessions ?? 0),
    seasonalImpact: Number(p.seasonalImpact ?? 0),
    pointsPerWin: Number(p.pointsPerWin ?? 30),
  });
  const drbl = reconstructDisplayedDrbl100({
    posteriorAbilityRate: Number(p.posteriorAbilityRate ?? 0),
    drbl100: Number(p.drbl100 ?? 0),
  });

  let calculatedWAR = recon.calculatedWAR;
  let warInputRate: number | null = recon.warInputRate;
  let warCalibratedRate: number | null = null;

  if (arch === "B_calibrated_posterior" || arch === "D_loo_transformed") {
    // Pipeline WAR is stored on the row; do not re-derive LOO math here.
    calculatedWAR = Number(p.drblWar ?? 0);
    warInputRate = Number(p.posteriorAbilityRate ?? p.drbl100 ?? 0);
    warCalibratedRate = Number(
      (p as { calibratedAbilityRate?: number }).calibratedAbilityRate ??
        p.drbl100 ??
        0
    );
  }

  const displayedWAR = Number(p.drblWar ?? 0);
  const warFormulaResidual = displayedWAR - calculatedWAR;
  const ok =
    Math.abs(drbl.drblDisplayResidual) <= DRBL100_ARTIFACT_TOLERANCE &&
    Math.abs(warFormulaResidual) <= WAR_RECONSTRUCTION_TOLERANCE;

  return {
    player: String(p.playerName ?? ""),
    playerId,
    season,
    artifactGenerationId: artifact.artifactGenerationId ?? null,
    P: numOrNull(p.drblP),
    LN: numOrNull(p.drblLn),
    B: numOrNull(p.drblB),
    SDV: numOrNull(p.sdv100),
    rawAbilityRate: numOrNull(p.rawAbilityRate),
    fusedRateRaw: numOrNull(p.fusedRateRaw),
    posteriorAbilityRate: numOrNull(p.posteriorAbilityRate),
    canonicalDrbl100: drbl.sourceDrbl100,
    displayedDrbl100: drbl.displayedDrbl100,
    warCalibrationAbilityInput:
      artifact.warModel?.calibrationInput ??
      (String(
        (p as { warCalibrationAbilityInput?: string })
          .warCalibrationAbilityInput ??
          (arch === "C_raw_ability_impact"
            ? "rawAbilityRate_via_seasonalImpact"
            : "")
      ) || null),
    warInputRate,
    warCalibratedRate,
    replacementLevel: recon.replacementLevel,
    actualOnCourtPossessions: recon.possessions,
    pointsPerWin: recon.pointsPerWin,
    calculatedWAR,
    displayedWAR,
    warFormulaResidual,
    rankingPosition: numOrNull(p.rank),
    warArchitectureClass: arch,
    sourceArtifacts: [
      opts.artifactPath ?? `precomputed/${season}.json`,
      `artifactGenerationId=${artifact.artifactGenerationId ?? "unknown"}`,
    ],
    rowProvenanceStatus: ok ? "PASS" : "FAIL",
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
