/**
 * Per-game possession pipeline — fetch, normalize, reconstruct, validate.
 *
 * Official aggregates (advanced box possessions) are fetched separately from
 * reconstructed sequences. Never treat reconstructed row counts as official.
 */

import { normalizeBoxScore, normalizePlayByPlay } from "../../../drbl/ingest/normalize";
import { reconstructLineups } from "../../../drbl/possessions/reconstruct-lineups";
import { reconstructPossessions } from "../../../drbl/possessions/reconstruct-possessions";
import type { DrblBoxScore } from "../../../drbl/types";
import {
  buildGamePbpCapability,
  unavailableCapability,
} from "@/pbp/capability";
import { normalizeRawBoxPayload } from "@/pbp/normalize-box-payload";
import {
  compareOfficialDerivedPossessions,
  countDerivedTeamPossessions,
  resolveOfficialPossessionResult,
} from "@/pbp/official-possessions";
import type {
  GamePossessionData,
  GamePossessionResult,
  OfficialPossessionResult,
  PbpProductSource,
  PbpProvenance,
  PossessionPipelineDiagnostics,
} from "@/pbp/product-types";
import { scoreTimelineAvailableFromEvents } from "@/pbp/product-types";
import { mapRawPbpSource } from "@/pbp/source-map";
import {
  buildLineupValidationReport,
  lineupValidationFailed,
} from "@/pbp/validate-lineup-pipeline";
import {
  buildPossessionValidationReport,
  validationFailed,
} from "@/pbp/validate-possession-pipeline";
import {
  fetchRawPlayByPlay,
} from "@/data/providers/nba/play-by-play-client";
import { fetchRawBoxScore } from "@/data/providers/nba/raw-box-score-client";
import {
  fetchRawAdvancedBoxScoreDetailed,
  type AdvancedBoxFetchResult,
} from "@/data/providers/nba/raw-advanced-box-client";
import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";
import { getGameShell } from "@/data/queries/games";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";

type PossessionCacheEntry = {
  freshUntil: number;
  value: GamePossessionResult;
};

const possessionCache = new Map<string, PossessionCacheEntry>();

export type AdvancedBoxLoaderResult = {
  raw: unknown;
  source: "cdn" | "stats" | "disk" | "fixture";
};

export type GamePossessionLoaders = {
  fetchPbp: typeof fetchRawPlayByPlay;
  fetchBox: typeof fetchRawBoxScore;
  /**
   * Optional injectable advanced-box loader (fixtures / tests).
   * When omitted, the live stats.nba.com → disk path is used.
   */
  fetchAdvancedBox?: (
    gameId: string
  ) => Promise<AdvancedBoxLoaderResult | null>;
};

const defaultLoaders: GamePossessionLoaders = {
  fetchPbp: fetchRawPlayByPlay,
  fetchBox: fetchRawBoxScore,
};

function seasonFromGameId(gameId: string): string {
  const m = /^(?:00[234])(\d{2})\d{5}$/.exec(gameId);
  if (!m) return canonicalSeasonFromStartYear(2024);
  const yy = Number(m[1]);
  const start = yy >= 50 ? 1900 + yy : 2000 + yy;
  return canonicalSeasonFromStartYear(start);
}

function mapAdvancedSourceToProduct(
  source: "cdn" | "stats" | "disk" | "fixture"
): PbpProductSource {
  if (source === "stats" || source === "fixture") return "stats_nba";
  if (source === "disk") return "disk_cache";
  return "nba_cdn";
}

function unavailable(
  gameId: string,
  reason:
    | "pbp_fetch_failed"
    | "pbp_empty"
    | "normalization_failed"
    | "validation_failed",
  message: string,
  capability = unavailableCapability(),
  validation?: ReturnType<typeof buildPossessionValidationReport>,
  lineupValidation?: ReturnType<typeof buildLineupValidationReport>,
  extras?: {
    possessionData?: GamePossessionData;
    diagnostics?: PossessionPipelineDiagnostics;
  }
): GamePossessionResult {
  return {
    status: "unavailable",
    gameId,
    reason,
    message,
    capability,
    validation,
    lineupValidation,
    possessionData: extras?.possessionData,
    diagnostics: extras?.diagnostics,
  };
}

function normalizeBoxFromPayload(
  season: string,
  payload: { raw: unknown; source: "cdn" | "stats" | "disk" } | null
): { box: DrblBoxScore | null; provenance: PbpProductSource | null } {
  if (!payload) return { box: null, provenance: null };
  const normalized = normalizeRawBoxPayload(payload.raw, payload.source);
  if (!normalized) return { box: null, provenance: null };
  return {
    box: normalizeBoxScore(season, normalized.raw),
    provenance: normalized.provenance,
  };
}

async function loadOfficialAggregates(
  gameId: string,
  loaders: GamePossessionLoaders
): Promise<{
  official: OfficialPossessionResult;
  advancedSource: PbpProductSource | null;
  attempts: PossessionPipelineDiagnostics["advancedBoxAttempts"];
}> {
  if (loaders.fetchAdvancedBox) {
    const payload = await loaders.fetchAdvancedBox(gameId);
    const attempted = payload
      ? [payload.source === "fixture" ? "fixture" : payload.source]
      : ["injected_loader"];
    const official = resolveOfficialPossessionResult({
      advancedRaw: payload?.raw ?? null,
      source: payload?.source ?? null,
      attemptedSources: attempted,
      fetchReason: payload ? undefined : "fetch_failed",
    });
    return {
      official,
      advancedSource: payload
        ? mapAdvancedSourceToProduct(payload.source)
        : null,
      attempts: payload
        ? [{ source: attempted[0]!, outcome: "ok" }]
        : [{ source: "injected_loader", outcome: "empty" }],
    };
  }

  const detailed: AdvancedBoxFetchResult =
    await fetchRawAdvancedBoxScoreDetailed(gameId);
  const attempts = detailed.attempts.map((a) => ({
    source: a.source,
    outcome: a.outcome,
    detail: a.detail,
  }));

  if (detailed.status === "available") {
    const official = resolveOfficialPossessionResult({
      advancedRaw: detailed.payload.raw,
      source: detailed.payload.source,
      attemptedSources: attempts.map((a) => a.source),
    });
    return {
      official,
      advancedSource:
        official.status === "available"
          ? mapAdvancedSourceToProduct(detailed.payload.source)
          : null,
      attempts,
    };
  }

  return {
    official: {
      status: "unavailable",
      reason: detailed.reason,
      attemptedSources: attempts.map((a) => a.source),
    },
    advancedSource: null,
    attempts,
  };
}

/**
 * Derive validated possessions for one game.
 * Returns discriminated unavailable results instead of throwing for routine gaps.
 */
export async function getGamePossessions(
  gameId: string,
  options?: {
    loaders?: Partial<GamePossessionLoaders>;
    bypassCache?: boolean;
  }
): Promise<GamePossessionResult> {
  const started = Date.now();
  const loaders = { ...defaultLoaders, ...options?.loaders };
  const now = Date.now();

  if (!options?.bypassCache) {
    const cached = possessionCache.get(gameId);
    if (cached && cached.freshUntil > now) {
      return cached.value;
    }
  }

  const pbpPayload = await loaders.fetchPbp(gameId);
  if (!pbpPayload) {
    const result = unavailable(
      gameId,
      "pbp_fetch_failed",
      "Play-by-play fetch failed for this game.",
      unavailableCapability(),
      undefined,
      undefined,
      {
        possessionData: {
          officialAggregates: {
            status: "unavailable",
            reason: "fetch_failed",
            attemptedSources: [],
          },
          reconstructedSequences: {
            status: "unavailable",
            reason: "pbp_fetch_failed",
          },
        },
      }
    );
    possessionCache.set(gameId, {
      value: result,
      freshUntil: now + CACHE_TTL_MS.boxScore,
    });
    return result;
  }

  const rawEventCount = (
    pbpPayload.raw as { game?: { actions?: unknown[] } }
  ).game?.actions?.length;
  const pbpSource = mapRawPbpSource(pbpPayload.source);
  if (!rawEventCount) {
    const result = unavailable(
      gameId,
      "pbp_empty",
      "Play-by-play payload contained no events.",
      unavailableCapability(pbpSource)
    );
    possessionCache.set(gameId, {
      value: result,
      freshUntil: now + CACHE_TTL_MS.boxScore,
    });
    return result;
  }

  const boxPayload = await loaders.fetchBox(gameId);
  const season = seasonFromGameId(gameId);
  let box: DrblBoxScore | null = null;
  let boxProvenance: PbpProductSource | null = null;

  if (boxPayload) {
    const normalized = normalizeBoxFromPayload(season, boxPayload);
    box = normalized.box;
    boxProvenance = normalized.provenance;
  }

  if (!box) {
    const shell = await getGameShell(gameId).catch(() => null);
    if (shell?.game) {
      box = normalizeBoxScore(season, {
        game: {
          gameId,
          gameEt: shell.game.gameDate,
          homeTeam: {
            teamId: shell.game.homeTeamId,
            teamTricode: shell.game.homeTeamAbbr,
            score: shell.game.homeScore,
            players: [],
          },
          awayTeam: {
            teamId: shell.game.awayTeamId,
            teamTricode: shell.game.awayTeamAbbr,
            score: shell.game.awayScore,
            players: [],
          },
        },
      });
      boxProvenance = "nba_cdn";
    }
  }

  const events = normalizePlayByPlay(gameId, pbpPayload.raw, {
    rosterPlayers: box?.players ?? [],
  });

  const scoreTimelineAvailable = scoreTimelineAvailableFromEvents(events);

  if (!events.length) {
    const result = unavailable(
      gameId,
      "normalization_failed",
      "Play-by-play normalization produced no events.",
      buildGamePbpCapability({
        rawEventCount,
        source: pbpSource,
        scoreTimelineAvailable: false,
      }),
      buildPossessionValidationReport({
        raw: pbpPayload.raw,
        events: [],
        possessions: [],
        box,
        eventsDroppedDuringNormalization: rawEventCount,
      })
    );
    possessionCache.set(gameId, {
      value: result,
      freshUntil: now + CACHE_TTL_MS.boxScore,
    });
    return result;
  }

  if (!box || !pbpSource || !boxProvenance) {
    const validation = buildPossessionValidationReport({
      raw: pbpPayload.raw,
      events,
      possessions: [],
      box: null,
    });
    const result = unavailable(
      gameId,
      "normalization_failed",
      "Box score required for possession reconstruction.",
      buildGamePbpCapability({
        rawEventCount,
        source: pbpSource,
        scoreTimelineAvailable,
      }),
      validation
    );
    possessionCache.set(gameId, {
      value: result,
      freshUntil: now + CACHE_TTL_MS.boxScore,
    });
    return result;
  }

  const lineups = reconstructLineups(events, box);
  const possessions = reconstructPossessions(events, box, lineups);

  const shell = await getGameShell(gameId).catch(() => null);
  const officialFinalScore = shell?.game
    ? { home: shell.game.homeScore, away: shell.game.awayScore }
    : { home: box.homeScore, away: box.awayScore };

  const validation = buildPossessionValidationReport({
    raw: pbpPayload.raw,
    events,
    possessions,
    box,
    officialFinalScore,
    eventsDroppedDuringNormalization: Math.max(0, rawEventCount - events.length),
  });

  const lineupValidation = buildLineupValidationReport({
    events,
    box,
    lineups,
  });

  const possessionsOk = !validationFailed(validation);
  const lineupsOk = !lineupValidationFailed(lineupValidation);

  const {
    official: officialAggregates,
    advancedSource,
    attempts: advancedBoxAttempts,
  } = await loadOfficialAggregates(gameId, loaders);

  const provenance: PbpProvenance = {
    playByPlay: pbpSource,
    boxScore: boxProvenance,
    advancedBoxScore: advancedSource,
  };

  const derived = countDerivedTeamPossessions(
    possessions,
    box.homeTeamId,
    box.awayTeamId
  );

  const officialTotals =
    officialAggregates.status === "available"
      ? { home: officialAggregates.home, away: officialAggregates.away }
      : null;

  const possessionComparison = compareOfficialDerivedPossessions({
    official: officialTotals,
    derived,
  });

  const reconstructedSequences =
    possessionsOk && possessions.length > 0
      ? ({
          status: "available" as const,
          home: derived.home,
          away: derived.away,
          possessionCount: possessions.length,
          definition: "reconstructed_from_pbp" as const,
        })
      : ({
          status: "unavailable" as const,
          reason: "validation_failed" as const,
        });

  const possessionData: GamePossessionData = {
    officialAggregates,
    reconstructedSequences,
  };

  const diagnostics: PossessionPipelineDiagnostics = {
    advancedBoxAttempts,
    officialPossessionResult: officialAggregates,
    elapsedMs: Date.now() - started,
  };

  const capability = buildGamePbpCapability({
    rawEventCount: events.length,
    source: pbpSource,
    provenance,
    scoreTimelineAvailable,
    possessionsDerived: possessionsOk && possessions.length > 0,
    lineupsDerived: lineupsOk && lineups.length > 1,
    officialPossessionTotalsAvailable: officialAggregates.status === "available",
    possessionCalibrationGrade: possessionComparison.possessionCalibrationGrade,
  });

  if (!possessionsOk) {
    const result: GamePossessionResult = {
      status: "unavailable",
      gameId,
      reason: "validation_failed",
      message: validation.fatalErrors.join(" "),
      capability: {
        ...capability,
        possessionsDerived: false,
        reconstructedPossessionsAvailable: false,
        lineupsDerived: false,
        status: "raw_available",
        possessionCalibrationGrade: "not_comparable",
      },
      validation,
      lineupValidation,
      possessionData: {
        officialAggregates,
        reconstructedSequences: {
          status: "unavailable",
          reason: "validation_failed",
        },
      },
      diagnostics,
    };
    possessionCache.set(gameId, {
      value: result,
      freshUntil: now + CACHE_TTL_MS.boxScore,
    });
    return result;
  }

  if (possessionComparison.officialPossessionComparison === "mismatched") {
    validation.warnings.push(
      `Derived possessions (${derived.home}/${derived.away}) differ from provider-reported advanced box (${officialTotals?.home}/${officialTotals?.away}).`
    );
  }

  const result: GamePossessionResult = {
    status: "available",
    gameId,
    source: pbpSource,
    provenance,
    events,
    possessions,
    validation,
    lineupValidation,
    capability,
    possessionData,
    officialPossessions: possessionComparison.officialPossessions,
    derivedPossessions: possessionComparison.derivedPossessions,
    possessionDelta: possessionComparison.possessionDelta,
    officialPossessionComparison:
      possessionComparison.officialPossessionComparison,
    possessionCalibrationGrade: possessionComparison.possessionCalibrationGrade,
    diagnostics,
  };

  possessionCache.set(gameId, {
    value: result,
    freshUntil: now + CACHE_TTL_MS.boxScore,
  });
  return result;
}

export function clearGamePossessionCache(): void {
  possessionCache.clear();
}
