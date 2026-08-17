/**
 * Read-only BDL season_averages advanced probe.
 * Distinguishes unauthorized / unavailable / malformed / valid / valid-empty.
 * Does not hydrate PlayerSeason. Does not expose UI metrics.
 */

import {
  BallDontLieError,
  createBallDontLieClient,
  getBallDontLieApiKey,
  type BdlListResponse,
  type BdlSeasonAverageRow,
} from "@/data/providers/balldontlie/client";
import {
  loadBdlIdentityFixture,
  summarizeIdentityCapability,
  type BdlIdentityFixtureFile,
} from "@/data/providers/advanced-stats/identity";
import { inspectSeasonAverageRows } from "@/data/providers/advanced-stats/quality";
import { normalizeBdlSeasonAveragesAdvanced } from "@/data/providers/advanced-stats/normalize-bdl-season-averages";
import {
  assessBdlSeasonAveragesAdvancedSemantics,
  type SeasonAveragesSemanticAssessment,
} from "@/data/providers/advanced-stats/semantics";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";

export type SeasonAveragesAccessStatus =
  | "unauthorized"
  | "endpoint_unavailable"
  | "malformed_response"
  | "valid_response"
  | "valid_response_zero_rows"
  | "skipped"
  | "no_api_key"
  | "error";

export type SeasonAveragesSeasonProbe = {
  seasonStartYear: number;
  canonicalSeason: string;
  access: SeasonAveragesAccessStatus;
  httpStatus: number | null;
  rowCount: number;
  fieldNames: string[];
  sampleRowShape: Record<string, unknown> | null;
  playerIdFields: string[];
  seasonFields: string[];
  advancedMetricFields: string[];
  paginationMeta: Record<string, unknown> | null;
  quality: ReturnType<typeof inspectSeasonAverageRows> | null;
  notes: string[];
};

export type SeasonAveragesAdvancedProbeReport = {
  endpoint: string;
  generatedAt: string;
  access: SeasonAveragesAccessStatus;
  seasons: SeasonAveragesSeasonProbe[];
  semantics: SeasonAveragesSemanticAssessment;
  identity: ReturnType<typeof summarizeIdentityCapability> & {
    fixturePath: string;
  };
  /** Observations only when semantics allow (or explicit diagnostic admit). */
  admittedObservationCount: number;
  notes: string[];
};

/** Probe seasons already used elsewhere: recent + historical advanced era. */
export const DEFAULT_SEASON_AVERAGES_PROBE_YEARS = [2024, 1996] as const;

function classifyHttpStatus(status: number): SeasonAveragesAccessStatus {
  if (status === 401) return "unauthorized";
  if (status === 404) return "endpoint_unavailable";
  if (status >= 500) return "endpoint_unavailable";
  if (status >= 400) return "error";
  return "valid_response";
}

function shapeSample(row: BdlSeasonAverageRow): Record<string, unknown> {
  return {
    topLevelKeys: Object.keys(row),
    playerKeys: row.player ? Object.keys(row.player) : [],
    hasPlayerId: row.player_id != null || row.player?.id != null,
    season: row.season,
    season_type: row.season_type,
    statsKeys: row.stats ? Object.keys(row.stats) : [],
    hasTeam: row.team != null,
  };
}

function collectFields(rows: BdlSeasonAverageRow[]): {
  fieldNames: string[];
  playerIdFields: string[];
  seasonFields: string[];
  advancedMetricFields: string[];
} {
  const fieldNames = new Set<string>();
  const statsKeys = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) fieldNames.add(k);
    for (const k of Object.keys(row.stats ?? {})) statsKeys.add(k);
  }
  const advancedMetricFields = [...statsKeys].filter((k) =>
    /rating|usage|shooting|effective_field/i.test(k)
  );
  return {
    fieldNames: [...fieldNames].sort(),
    playerIdFields: ["player.id", "player_id"].filter((f) =>
      rows.some((r) =>
        f === "player.id" ? r.player?.id != null : r.player_id != null
      )
    ),
    seasonFields: ["season", "season_type"].filter((f) =>
      rows.some((r) => {
        const rec = r as unknown as Record<string, unknown>;
        return rec[f] != null;
      })
    ),
    advancedMetricFields: advancedMetricFields.sort(),
  };
}

export type FetchSeasonAveragesPage = (params: {
  season: number;
  seasonType: string;
  type: string;
  playerIds?: number[];
  perPage: number;
  cursor?: number;
}) => Promise<{
  status: number;
  payload: BdlListResponse<BdlSeasonAverageRow> | null;
  rawText?: string;
}>;

/** Production fetch using BallDontLieClient (no second HTTP stack). */
export function createLiveSeasonAveragesFetcher(): FetchSeasonAveragesPage | null {
  const client = createBallDontLieClient();
  if (!client) return null;
  return async ({ season, seasonType, type, playerIds, perPage, cursor }) => {
    try {
      const payload = await client.getSeasonAverages({
        category: "general",
        type,
        season,
        seasonType,
        playerIds,
        perPage,
        cursor,
      });
      return { status: 200, payload };
    } catch (err) {
      if (err instanceof BallDontLieError) {
        return { status: err.status, payload: null, rawText: err.message };
      }
      throw err;
    }
  };
}

export async function probeSeasonAveragesAdvanced(options?: {
  seasonStartYears?: number[];
  /** Bound probe to known players when possible (smallest request). */
  playerIds?: number[];
  perPage?: number;
  fetchPage?: FetchSeasonAveragesPage;
  skipNetwork?: boolean;
  identityFixture?: BdlIdentityFixtureFile;
  admitDespiteUnverifiedSemantics?: boolean;
  now?: string;
}): Promise<SeasonAveragesAdvancedProbeReport> {
  const endpoint =
    "/nba/v1/season_averages/general?type=advanced&season_type=regular";
  const years = options?.seasonStartYears ?? [
    ...DEFAULT_SEASON_AVERAGES_PROBE_YEARS,
  ];
  const perPage = Math.min(100, Math.max(1, options?.perPage ?? 5));
  const playerIds = options?.playerIds ?? [246];
  const notes: string[] = [];
  const generatedAt = options?.now ?? new Date().toISOString();

  const identityFixture =
    options?.identityFixture ?? (await loadBdlIdentityFixture());
  const identitySummary = {
    ...summarizeIdentityCapability(identityFixture),
    fixturePath: "data/impact/bdl-player-identity-fixture.json",
  };

  if (options?.skipNetwork && !options.fetchPage) {
    const semantics = assessBdlSeasonAveragesAdvancedSemantics({
      access: "skipped",
    });
    return {
      endpoint,
      generatedAt,
      access: "skipped",
      seasons: years.map((y) => ({
        seasonStartYear: y,
        canonicalSeason: canonicalSeasonFromStartYear(y),
        access: "skipped",
        httpStatus: null,
        rowCount: 0,
        fieldNames: [],
        sampleRowShape: null,
        playerIdFields: [],
        seasonFields: [],
        advancedMetricFields: [],
        paginationMeta: null,
        quality: null,
        notes: ["Network probe skipped."],
      })),
      semantics,
      identity: identitySummary,
      admittedObservationCount: 0,
      notes: ["skipNetwork=true — no live season_averages probe."],
    };
  }

  if (!getBallDontLieApiKey() && !options?.fetchPage) {
    notes.push("BALLDONTLIE_API_KEY is not set.");
    const semantics = assessBdlSeasonAveragesAdvancedSemantics({
      access: "unauthorized",
    });
    return {
      endpoint,
      generatedAt,
      access: "no_api_key",
      seasons: [],
      semantics,
      identity: identitySummary,
      admittedObservationCount: 0,
      notes,
    };
  }

  const fetchPage =
    options?.fetchPage ?? createLiveSeasonAveragesFetcher();
  if (!fetchPage) {
    notes.push("Failed to construct BallDontLie client.");
    return {
      endpoint,
      generatedAt,
      access: "error",
      seasons: [],
      semantics: assessBdlSeasonAveragesAdvancedSemantics(),
      identity: identitySummary,
      admittedObservationCount: 0,
      notes,
    };
  }

  const seasonProbes: SeasonAveragesSeasonProbe[] = [];
  let overallAccess: SeasonAveragesAccessStatus = "valid_response";
  const allObservedKeys = new Set<string>();
  const allRows: BdlSeasonAverageRow[] = [];

  for (const year of years) {
    const seasonNotes: string[] = [];
    try {
      const result = await fetchPage({
        season: year,
        seasonType: "regular",
        type: "advanced",
        playerIds,
        perPage,
      });

      if (result.status === 401) {
        overallAccess = "unauthorized";
        seasonProbes.push({
          seasonStartYear: year,
          canonicalSeason: canonicalSeasonFromStartYear(year),
          access: "unauthorized",
          httpStatus: 401,
          rowCount: 0,
          fieldNames: [],
          sampleRowShape: null,
          playerIdFields: [],
          seasonFields: [],
          advancedMetricFields: [],
          paginationMeta: null,
          quality: null,
          notes: [
            "HTTP 401 Unauthorized — not an empty dataset; GOAT access required.",
          ],
        });
        continue;
      }

      if (result.status !== 200 || !result.payload) {
        const access = classifyHttpStatus(result.status);
        if (overallAccess === "valid_response") overallAccess = access;
        seasonProbes.push({
          seasonStartYear: year,
          canonicalSeason: canonicalSeasonFromStartYear(year),
          access,
          httpStatus: result.status,
          rowCount: 0,
          fieldNames: [],
          sampleRowShape: null,
          playerIdFields: [],
          seasonFields: [],
          advancedMetricFields: [],
          paginationMeta: null,
          quality: null,
          notes: [
            `Non-success HTTP ${result.status}`,
            result.rawText?.slice(0, 200) ?? "",
          ].filter(Boolean),
        });
        continue;
      }

      const payload = result.payload;
      if (!Array.isArray(payload.data)) {
        if (overallAccess === "valid_response") {
          overallAccess = "malformed_response";
        }
        seasonProbes.push({
          seasonStartYear: year,
          canonicalSeason: canonicalSeasonFromStartYear(year),
          access: "malformed_response",
          httpStatus: result.status,
          rowCount: 0,
          fieldNames: [],
          sampleRowShape: null,
          playerIdFields: [],
          seasonFields: [],
          advancedMetricFields: [],
          paginationMeta: (payload.meta as Record<string, unknown>) ?? null,
          quality: null,
          notes: ["Response missing data array."],
        });
        continue;
      }

      const rows = payload.data;
      const fields = collectFields(rows);
      for (const k of fields.advancedMetricFields) allObservedKeys.add(k);
      for (const k of Object.keys(rows[0]?.stats ?? {})) allObservedKeys.add(k);
      allRows.push(...rows);

      const access: SeasonAveragesAccessStatus =
        rows.length === 0 ? "valid_response_zero_rows" : "valid_response";
      if (
        access === "valid_response_zero_rows" &&
        overallAccess === "valid_response" &&
        seasonProbes.every(
          (s) =>
            s.access === "valid_response_zero_rows" || s.access === "skipped"
        )
      ) {
        overallAccess = "valid_response_zero_rows";
      }

      const quality = inspectSeasonAverageRows(rows);
      if (quality.issues.length) {
        seasonNotes.push(
          `${quality.issues.length} quality issue(s) reported (not silently dropped).`
        );
      }

      seasonProbes.push({
        seasonStartYear: year,
        canonicalSeason: canonicalSeasonFromStartYear(year),
        access,
        httpStatus: result.status,
        rowCount: rows.length,
        fieldNames: fields.fieldNames,
        sampleRowShape: rows[0] ? shapeSample(rows[0]) : null,
        playerIdFields: fields.playerIdFields,
        seasonFields: fields.seasonFields,
        advancedMetricFields: fields.advancedMetricFields,
        paginationMeta: (payload.meta as Record<string, unknown>) ?? null,
        quality,
        notes: seasonNotes,
      });
    } catch (err) {
      if (overallAccess === "valid_response") overallAccess = "error";
      seasonProbes.push({
        seasonStartYear: year,
        canonicalSeason: canonicalSeasonFromStartYear(year),
        access: "error",
        httpStatus: null,
        rowCount: 0,
        fieldNames: [],
        sampleRowShape: null,
        playerIdFields: [],
        seasonFields: [],
        advancedMetricFields: [],
        paginationMeta: null,
        quality: null,
        notes: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  if (seasonProbes.some((s) => s.access === "unauthorized")) {
    overallAccess = "unauthorized";
    notes.push(
      "Access remains the sole blocker to semantic verification of live season_averages advanced field keys."
    );
  }

  const semantics = assessBdlSeasonAveragesAdvancedSemantics({
    access:
      overallAccess === "unauthorized"
        ? "unauthorized"
        : overallAccess === "skipped"
          ? "skipped"
          : overallAccess === "valid_response" ||
              overallAccess === "valid_response_zero_rows"
            ? "ok"
            : "error",
    observedStatKeys: [...allObservedKeys],
  });

  const normalized = normalizeBdlSeasonAveragesAdvanced(allRows, {
    semantics,
    identityFixture,
    importedAt: generatedAt,
    admitDespiteUnverifiedSemantics:
      options?.admitDespiteUnverifiedSemantics === true,
  });
  notes.push(...normalized.notes);

  return {
    endpoint,
    generatedAt,
    access: overallAccess,
    seasons: seasonProbes,
    semantics,
    identity: identitySummary,
    admittedObservationCount: normalized.observations.length,
    notes,
  };
}
