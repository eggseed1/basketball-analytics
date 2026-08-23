/**
 * Possession reconstruction calibration audit (live network — NOT for ordinary CI).
 *
 * Examples:
 *   npm run audit:possession-reconstruction -- --fixture-only
 *   npm run audit:possession-reconstruction -- \
 *     --seasons 2015-16,2019-20,2023-24 --games-per-season 10 --seed 42 --concurrency 2 --resume
 *
 * Fixture-only mode is network-free and used by test:possession-calibration.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { statsBoxScoreV3ToCdnShape } from "../drbl/download/stats-boxscore-adapt";
import {
  clearGamePossessionCache,
  getGamePossessions,
} from "../src/data/queries/game-possessions";
import { fetchLeagueSchedule } from "../src/data/providers/nba/schedule-client";
import {
  aggregateCalibrationStats,
  groupRowsBy,
  sampleDeterministic,
  seasonEra,
  worstComparableGames,
  type CalibrationGameRow,
} from "../src/pbp/possession-calibration";
import type { GamePossessionResult } from "../src/pbp/product-types";

const ARTIFACT_ROOT = path.join(
  process.cwd(),
  "artifacts",
  "pbp-calibration"
);
const FIXTURE_ROOT = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "pbp",
  "games"
);

const DEFAULT_SEASONS = [
  "1996-97",
  "2000-01",
  "2010-11",
  "2015-16",
  "2019-20",
  "2023-24",
  "2025-26",
];

type CliOptions = {
  seasons: string[];
  gamesPerSeason: number;
  seed: number;
  concurrency: number;
  delayMs: number;
  resume: boolean;
  offline: boolean;
  fixtureOnly: boolean;
  gameIds: string[];
  outDir: string;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    seasons: [...DEFAULT_SEASONS],
    gamesPerSeason: 20,
    seed: 42,
    concurrency: 2,
    delayMs: 250,
    resume: false,
    offline: false,
    fixtureOnly: false,
    gameIds: [],
    outDir: ARTIFACT_ROOT,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === "--seasons" && next) {
      opts.seasons = next.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (arg === "--games-per-season" && next) {
      opts.gamesPerSeason = Number(next);
      i++;
    } else if (arg === "--seed" && next) {
      opts.seed = Number(next);
      i++;
    } else if (arg === "--concurrency" && next) {
      opts.concurrency = Math.max(1, Number(next));
      i++;
    } else if (arg === "--delay-ms" && next) {
      opts.delayMs = Math.max(0, Number(next));
      i++;
    } else if (arg === "--resume") {
      opts.resume = true;
    } else if (arg === "--offline") {
      opts.offline = true;
    } else if (arg === "--fixture-only") {
      opts.fixtureOnly = true;
    } else if ((arg === "--games" || arg === "--game") && next) {
      opts.gameIds = next.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (arg === "--out" && next) {
      opts.outDir = path.resolve(next);
      i++;
    }
  }
  return opts;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadFixture(gameId: string, kind: string): unknown {
  const file = path.join(FIXTURE_ROOT, gameId, `${kind}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function fixtureLoaders(gameId: string) {
  const hasCdnBox = existsSync(path.join(FIXTURE_ROOT, gameId, "boxscore.json"));
  const hasStatsBox = existsSync(
    path.join(FIXTURE_ROOT, gameId, "boxscore-stats-v3.json")
  );
  return {
    fetchPbp: async () => ({
      raw: loadFixture(gameId, "playbyplay"),
      source: (gameId === "0021500001" ? "stats" : "cdn") as "cdn" | "stats",
    }),
    fetchBox: async () => {
      if (hasCdnBox) {
        return {
          raw: loadFixture(gameId, "boxscore"),
          source: "cdn" as const,
        };
      }
      if (hasStatsBox) {
        const raw = loadFixture(gameId, "boxscore-stats-v3");
        const adapted = statsBoxScoreV3ToCdnShape(raw);
        return { raw: adapted ?? raw, source: "stats" as const };
      }
      return null;
    },
    fetchAdvancedBox: async () => ({
      raw: loadFixture(gameId, "boxscore-advanced-v3"),
      source: "fixture" as const,
    }),
  };
}

function seasonTypeFromGameId(
  gameId: string
): CalibrationGameRow["seasonType"] {
  if (gameId.startsWith("004") || gameId.startsWith("003")) return "playoffs";
  if (gameId.startsWith("002")) return "regular";
  return "unknown";
}

function seasonFromGameId(gameId: string): string {
  const m = /^(?:00[234])(\d{2})\d{5}$/.exec(gameId);
  if (!m) return "unknown";
  const yy = Number(m[1]);
  const start = yy >= 50 ? 1900 + yy : 2000 + yy;
  const end = String((start + 1) % 100).padStart(2, "0");
  return `${start}-${end}`;
}

function countEventFlags(
  events: Array<{
    actionType?: string;
    subType?: string | null;
    description?: string | null;
    edited?: boolean | null;
  }>
): {
  technicalFtCount: number;
  flagrantFtCount: number;
  editedEventCount: number;
} {
  let technicalFtCount = 0;
  let flagrantFtCount = 0;
  let editedEventCount = 0;
  for (const event of events) {
    const desc = `${event.subType ?? ""} ${event.description ?? ""}`.toLowerCase();
    if (event.actionType === "freethrow") {
      if (desc.includes("technical")) technicalFtCount += 1;
      if (desc.includes("flagrant")) flagrantFtCount += 1;
    }
    if (event.edited) editedEventCount += 1;
  }
  return { technicalFtCount, flagrantFtCount, editedEventCount };
}

function rowFromResult(
  gameId: string,
  result: GamePossessionResult,
  elapsedMs: number,
  meta?: { date?: string | null; season?: string }
): CalibrationGameRow {
  const season = meta?.season ?? seasonFromGameId(gameId);
  if (result.status === "unavailable") {
    return {
      gameId,
      season,
      date: meta?.date ?? null,
      seasonType: seasonTypeFromGameId(gameId),
      periods: null,
      pbpSource: result.capability.source,
      boxSource: result.capability.provenance?.boxScore ?? null,
      advancedBoxSource:
        result.capability.provenance?.advancedBoxScore ?? null,
      rawEventCount: result.validation?.rawEventCount ?? null,
      normalizedEventCount: result.validation?.normalizedEventCount ?? null,
      reconstructedHome: null,
      reconstructedAway: null,
      officialHome:
        result.possessionData?.officialAggregates.status === "available"
          ? result.possessionData.officialAggregates.home
          : null,
      officialAway:
        result.possessionData?.officialAggregates.status === "available"
          ? result.possessionData.officialAggregates.away
          : null,
      deltaHome: null,
      deltaAway: null,
      absDeltaHome: null,
      absDeltaAway: null,
      calibrationGrade:
        result.reason === "pbp_fetch_failed"
          ? "fetch_failed"
          : "reconstruct_failed",
      scoreConservationOk: result.validation?.scoreConservationOk ?? null,
      lineupValid: null,
      unknownEventCount: result.validation?.unknownEventCount ?? null,
      droppedEventCount:
        result.validation?.eventsDroppedDuringNormalization ?? null,
      unresolvedFreeThrowCount:
        result.validation?.unresolvedFreeThrowSequences ?? null,
      duplicateActionWarnings: result.validation?.duplicateActionNumbers ?? null,
      duplicateOrderWarnings: result.validation?.duplicateOrderNumbers ?? null,
      technicalFtCount: null,
      flagrantFtCount: null,
      editedEventCount: null,
      failureReason: result.reason,
      elapsedMs,
      comparable: false,
    };
  }

  const official = result.possessionData.officialAggregates;
  const reconstructed = result.possessionData.reconstructedSequences;
  const flags = countEventFlags(result.events);
  const officialHome =
    official.status === "available" ? official.home : null;
  const officialAway =
    official.status === "available" ? official.away : null;
  const reconstructedHome =
    reconstructed.status === "available" ? reconstructed.home : null;
  const reconstructedAway =
    reconstructed.status === "available" ? reconstructed.away : null;
  const deltaHome =
    officialHome != null && reconstructedHome != null
      ? reconstructedHome - officialHome
      : null;
  const deltaAway =
    officialAway != null && reconstructedAway != null
      ? reconstructedAway - officialAway
      : null;
  const comparable =
    officialHome != null &&
    officialAway != null &&
    reconstructedHome != null &&
    reconstructedAway != null;

  return {
    gameId,
    season,
    date: meta?.date ?? null,
    seasonType: seasonTypeFromGameId(gameId),
    periods: result.validation.periodsObserved.length
      ? Math.max(...result.validation.periodsObserved)
      : null,
    pbpSource: result.provenance.playByPlay,
    boxSource: result.provenance.boxScore,
    advancedBoxSource: result.provenance.advancedBoxScore ?? null,
    rawEventCount: result.validation.rawEventCount,
    normalizedEventCount: result.validation.normalizedEventCount,
    reconstructedHome,
    reconstructedAway,
    officialHome,
    officialAway,
    deltaHome,
    deltaAway,
    absDeltaHome: deltaHome == null ? null : Math.abs(deltaHome),
    absDeltaAway: deltaAway == null ? null : Math.abs(deltaAway),
    calibrationGrade: comparable
      ? result.possessionCalibrationGrade
      : officialHome == null
        ? "not_comparable"
        : "reconstruct_failed",
    scoreConservationOk: result.validation.scoreConservationOk,
    lineupValid: result.capability.lineupsDerived,
    unknownEventCount: result.validation.unknownEventCount,
    droppedEventCount: result.validation.eventsDroppedDuringNormalization,
    unresolvedFreeThrowCount: result.validation.unresolvedFreeThrowSequences,
    duplicateActionWarnings: result.validation.duplicateActionNumbers,
    duplicateOrderWarnings: result.validation.duplicateOrderNumbers,
    technicalFtCount: flags.technicalFtCount,
    flagrantFtCount: flags.flagrantFtCount,
    editedEventCount: flags.editedEventCount,
    failureReason:
      official.status === "unavailable" ? official.reason : null,
    elapsedMs,
    comparable,
  };
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: CalibrationGameRow[]): string {
  const keys = Object.keys(rows[0] ?? {
    gameId: "",
  }) as (keyof CalibrationGameRow)[];
  if (!rows.length) {
    return "gameId,season,comparable,failureReason\n";
  }
  const header = keys.join(",");
  const lines = rows.map((row) =>
    keys.map((k) => csvEscape(row[k])).join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}

function fmtPct(n: number | null): string {
  if (n == null) return "n/a";
  return `${n.toFixed(1)}%`;
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null) return "n/a";
  return n.toFixed(digits);
}

function renderMarkdown(input: {
  methodology: string;
  options: CliOptions;
  rows: CalibrationGameRow[];
  generatedAt: string;
}): string {
  const stats = aggregateCalibrationStats(input.rows);
  const bySeason = groupRowsBy(input.rows, (r) => r.season);
  const byEra = groupRowsBy(input.rows, (r) => seasonEra(r.season));
  const byPbp = groupRowsBy(
    input.rows,
    (r) => r.pbpSource ?? "unknown"
  );
  const byAdvanced = groupRowsBy(
    input.rows,
    (r) => r.advancedBoxSource ?? "none"
  );
  const byOt = groupRowsBy(input.rows, (r) =>
    (r.periods ?? 0) > 4 ? "overtime" : "regulation"
  );
  const byType = groupRowsBy(input.rows, (r) => r.seasonType);
  const byLineup = groupRowsBy(input.rows, (r) =>
    r.lineupValid == null ? "unknown" : r.lineupValid ? "lineup_valid" : "lineup_invalid"
  );
  const byTech = groupRowsBy(input.rows, (r) =>
    (r.technicalFtCount ?? 0) + (r.flagrantFtCount ?? 0) > 0
      ? "has_tech_or_flagrant_ft"
      : "no_tech_flagrant_ft"
  );
  const byUnknown = groupRowsBy(input.rows, (r) =>
    (r.unknownEventCount ?? 0) + (r.droppedEventCount ?? 0) > 0
      ? "has_unknown_or_dropped"
      : "clean_events"
  );
  const worst = worstComparableGames(input.rows, 15);

  const section = (title: string, groups: Record<string, ReturnType<typeof aggregateCalibrationStats>>) => {
    const lines = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, s]) =>
          `| ${key} | ${s.attemptedGames} | ${s.comparableGames} | ${fmtPct(s.exactMatchPct)} | ${fmtPct(s.withinOnePct)} | ${fmtPct(s.withinTwoPct)} | ${fmtNum(s.meanAbsoluteError)} | ${fmtPct((s.officialTotalAvailabilityRate ?? 0) * 100)} |`
      );
    return [
      `### ${title}`,
      "",
      "| Bucket | Attempted | Comparable | Exact | ±1 | ±2 | MAE | Official avail |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...lines,
      "",
    ].join("\n");
  };

  const readiness = buildFeatureReadiness(stats, input.rows);

  return [
    "# Possession reconstruction calibration",
    "",
    `Generated: ${input.generatedAt}`,
    "",
    "## Methodology",
    "",
    input.methodology,
    "",
    "## Sample composition",
    "",
    `- Seasons: ${input.options.seasons.join(", ") || "(explicit game list / fixtures)"}`,
    `- Games per season (target): ${input.options.gamesPerSeason}`,
    `- Seed: ${input.options.seed}`,
    `- Fixture-only: ${input.options.fixtureOnly}`,
    `- Offline: ${input.options.offline}`,
    `- Attempted games: ${stats.attemptedGames}`,
    `- Successfully fetched: ${stats.successfullyFetched}`,
    `- Successfully reconstructed: ${stats.successfullyReconstructed}`,
    `- Official totals available: ${stats.officialTotalsAvailable}`,
    `- Comparable games: ${stats.comparableGames}`,
    "",
    "## Coverage",
    "",
    `- Official-total availability rate: ${fmtPct((stats.officialTotalAvailabilityRate ?? 0) * 100)}`,
    `- Reconstruction failure rate: ${fmtPct((stats.reconstructionFailureRate ?? 0) * 100)}`,
    "",
    "## Aggregate accuracy (comparable games)",
    "",
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Exact match | ${fmtPct(stats.exactMatchPct)} |`,
    `| Both teams within ±1 | ${fmtPct(stats.withinOnePct)} |`,
    `| Both teams within ±2 | ${fmtPct(stats.withinTwoPct)} |`,
    `| Outside ±2 | ${fmtPct(stats.outsideTwoPct)} |`,
    `| Mean signed error | ${fmtNum(stats.meanSignedError)} |`,
    `| Mean absolute error | ${fmtNum(stats.meanAbsoluteError)} |`,
    `| Median absolute error | ${fmtNum(stats.medianAbsoluteError)} |`,
    `| 95th-percentile abs error | ${fmtNum(stats.p95AbsoluteError)} |`,
    `| Max abs error | ${fmtNum(stats.maxAbsoluteError, 0)} |`,
    `| Home signed bias | ${fmtNum(stats.meanSignedHomeBias)} |`,
    `| Away signed bias | ${fmtNum(stats.meanSignedAwayBias)} |`,
    "",
    section("By season", bySeason),
    section("By era", byEra),
    section("By PBP source", byPbp),
    section("By advanced-box source", byAdvanced),
    section("Regulation vs overtime", byOt),
    section("Regular season vs playoffs", byType),
    section("Lineup validation", byLineup),
    section("Technical/flagrant FT presence", byTech),
    section("Unknown/dropped events", byUnknown),
    "## Worst discrepancies",
    "",
    worst.length
      ? [
          "| Game | Season | Δ home | Δ away | Grade | Lineup | Tech/Flag FT |",
          "| --- | --- | ---: | ---: | --- | --- | ---: |",
          ...worst.map(
            (r) =>
              `| ${r.gameId} | ${r.season} | ${r.deltaHome} | ${r.deltaAway} | ${r.calibrationGrade} | ${r.lineupValid} | ${(r.technicalFtCount ?? 0) + (r.flagrantFtCount ?? 0)} |`
          ),
          "",
        ].join("\n")
      : "_No comparable games._\n",
    "## Algorithm fixes made",
    "",
    "- Wired live `boxscoreadvancedv3` fetch (stats → disk) so official totals are no longer unconditionally unavailable.",
    "- Introduced `OfficialPossessionResult` / `GamePossessionData` boundary so reconstructed row counts cannot be labeled provider-reported.",
    "- No possession-boundary algorithm changes in this pass (awaiting targeted failing sequences from live calibration).",
    "",
    "## Remaining failure modes",
    "",
    "- Historical games may still lack advanced possessions if the endpoint rejects the game or omits the field (`field_missing` / `game_not_supported`).",
    "- Reconstruction can remain outside ±2 on technical/flagrant/jump-ball/end-of-period edge cases.",
    "- Lineup validation remains independent; lineup-invalid games can still be possession-comparable.",
    "",
    "## Feature-readiness recommendations",
    "",
    readiness,
    "",
  ].join("\n");
}

function buildFeatureReadiness(
  stats: ReturnType<typeof aggregateCalibrationStats>,
  rows: CalibrationGameRow[]
): string {
  const comparable = stats.comparableGames;
  const withinOne = stats.withinOnePct ?? 0;
  const avail = (stats.officialTotalAvailabilityRate ?? 0) * 100;
  const outside = stats.outsideTwoPct ?? 100;

  const pace =
    avail >= 70 && comparable >= 40
      ? "READY_WITH_GATING — use provider-reported possessions only where available; hide otherwise"
      : avail >= 40
        ? "INSUFFICIENT_COVERAGE — official totals too sparse for product pace"
        : "INSUFFICIENT_COVERAGE";
  const ppp = pace;
  const explorer =
    stats.successfullyReconstructed >= Math.max(1, comparable * 0.5)
      ? "READY — sequences already shipped; keep mismatch/unavailable notices"
      : "NEEDS_RECONSTRUCTION_FIXES";
  const clutch =
    withinOne >= 85 && outside <= 10
      ? "READY_WITH_GATING"
      : withinOne >= 70
        ? "NEEDS_RECONSTRUCTION_FIXES — boundaries not yet accurate enough for clutch filters"
        : "NEEDS_RECONSTRUCTION_FIXES";
  const playType =
    withinOne >= 80
      ? "READY_WITH_GATING"
      : "NEEDS_RECONSTRUCTION_FIXES";
  const lineupValidShare =
    rows.filter((r) => r.lineupValid).length / Math.max(1, rows.length);
  const lineupPpp =
    lineupValidShare >= 0.7 && withinOne >= 85
      ? "READY_WITH_GATING"
      : "INSUFFICIENT_COVERAGE — lineup validation and/or possession accuracy insufficient";
  const ask =
    stats.successfullyReconstructed > 0
      ? "READY_WITH_GATING — index reconstructed possessions with coverage metadata; never imply official totals"
      : "INSUFFICIENT_COVERAGE";

  return [
    `| Feature | Recommendation | Evidence |`,
    `| --- | --- | --- |`,
    `| Game-level pace | ${pace} | official avail ${fmtPct(avail)}; comparable ${comparable} |`,
    `| Game/team PPP | ${ppp} | same official-total gate as pace |`,
    `| Sequence explorer | ${explorer} | reconstructed ${stats.successfullyReconstructed}/${stats.attemptedGames} |`,
    `| Clutch possession explorer | ${clutch} | ±1 ${fmtPct(withinOne)}; outside ±2 ${fmtPct(outside)} |`,
    `| Play-type efficiency | ${playType} | ±1 ${fmtPct(withinOne)} |`,
    `| Lineup PPP | ${lineupPpp} | lineup-valid share ${(100 * lineupValidShare).toFixed(1)}% |`,
    `| ASK DRBL possession queries | ${ask} | reconstructed coverage + metadata required |`,
  ].join("\n");
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

type Checkpoint = {
  version: 1;
  seed: number;
  completedGameIds: string[];
  rows: CalibrationGameRow[];
};

function checkpointPath(outDir: string): string {
  return path.join(outDir, "checkpoint.json");
}

function loadCheckpoint(outDir: string): Checkpoint | null {
  const file = checkpointPath(outDir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Checkpoint;
  } catch {
    return null;
  }
}

function saveCheckpoint(outDir: string, checkpoint: Checkpoint): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(checkpointPath(outDir), JSON.stringify(checkpoint, null, 2));
}

async function selectLiveGames(opts: CliOptions): Promise<
  Array<{ gameId: string; season: string; date: string | null }>
> {
  if (opts.gameIds.length) {
    return opts.gameIds.map((gameId) => ({
      gameId,
      season: seasonFromGameId(gameId),
      date: null,
    }));
  }

  const selected: Array<{ gameId: string; season: string; date: string | null }> =
    [];
  for (const season of opts.seasons) {
    try {
      const schedule = await fetchLeagueSchedule(season);
      const completed = schedule
        .filter(
          (g) =>
            g.game.gameType === "regular" ||
            g.game.gameType === "playoff" ||
            g.game.gameType === "play-in"
        )
        .filter((g) => g.game.status === "final" || (g.game.homeScore ?? 0) > 0)
        .map((g) => ({
          gameId: g.game.id,
          season,
          date: g.game.gameDate ?? null,
        }))
        .filter((g) => /^00[234]\d{7}$/.test(g.gameId));

      const playoffs = completed.filter((g) => g.gameId.startsWith("004"));
      const regular = completed.filter((g) => g.gameId.startsWith("002"));
      const seasonSeed =
        opts.seed ^
        Number.parseInt(
          createHash("sha256").update(season).digest("hex").slice(0, 8),
          16
        );
      const playoffQuota = Math.min(
        Math.max(2, Math.floor(opts.gamesPerSeason * 0.15)),
        playoffs.length
      );
      const regularQuota = Math.min(
        opts.gamesPerSeason - playoffQuota,
        regular.length
      );
      const sampled = [
        ...sampleDeterministic(playoffs, playoffQuota, seasonSeed ^ 1),
        ...sampleDeterministic(regular, regularQuota, seasonSeed ^ 2),
      ];
      selected.push(...sampled);
      console.error(
        `[sample] ${season}: ${completed.length} completed (${regular.length} RS / ${playoffs.length} PO) → ${sampled.length} selected`
      );
    } catch (error) {
      console.error(
        `[sample] ${season}: schedule failed — ${error instanceof Error ? error.message : error}`
      );
    }
    await delay(opts.delayMs);
  }
  return selected;
}

async function runFixtureOnly(opts: CliOptions): Promise<CalibrationGameRow[]> {
  const gameIds = opts.gameIds.length
    ? opts.gameIds
    : ["0022400001", "0021900001", "0042400101", "0021500001"];
  const rows: CalibrationGameRow[] = [];
  clearGamePossessionCache();
  for (const gameId of gameIds) {
    const started = Date.now();
    try {
      const result = await getGamePossessions(gameId, {
        loaders: fixtureLoaders(gameId),
        bypassCache: true,
      });
      rows.push(
        rowFromResult(gameId, result, Date.now() - started, {
          season: seasonFromGameId(gameId),
        })
      );
    } catch (error) {
      rows.push({
        gameId,
        season: seasonFromGameId(gameId),
        date: null,
        seasonType: seasonTypeFromGameId(gameId),
        periods: null,
        pbpSource: null,
        boxSource: null,
        advancedBoxSource: null,
        rawEventCount: null,
        normalizedEventCount: null,
        reconstructedHome: null,
        reconstructedAway: null,
        officialHome: null,
        officialAway: null,
        deltaHome: null,
        deltaAway: null,
        absDeltaHome: null,
        absDeltaAway: null,
        calibrationGrade: "fetch_failed",
        scoreConservationOk: null,
        lineupValid: null,
        unknownEventCount: null,
        droppedEventCount: null,
        unresolvedFreeThrowCount: null,
        duplicateActionWarnings: null,
        duplicateOrderWarnings: null,
        technicalFtCount: null,
        flagrantFtCount: null,
        editedEventCount: null,
        failureReason:
          error instanceof Error ? error.message : "unknown_error",
        elapsedMs: Date.now() - started,
        comparable: false,
      });
    }
  }
  return rows;
}

async function runLive(opts: CliOptions): Promise<CalibrationGameRow[]> {
  mkdirSync(opts.outDir, { recursive: true });
  const checkpoint = opts.resume ? loadCheckpoint(opts.outDir) : null;
  const completed = new Set(checkpoint?.completedGameIds ?? []);
  const rows = [...(checkpoint?.rows ?? [])];

  const targets = await selectLiveGames(opts);
  const pending = targets.filter((t) => !completed.has(t.gameId));
  console.error(
    `[audit] targets=${targets.length} pending=${pending.length} resume=${opts.resume}`
  );

  clearGamePossessionCache();

  let checkpointWrite = Promise.resolve();
  const persist = (nextRows: CalibrationGameRow[], nextCompleted: Set<string>) => {
    checkpointWrite = checkpointWrite.then(() => {
      saveCheckpoint(opts.outDir, {
        version: 1,
        seed: opts.seed,
        completedGameIds: [...nextCompleted],
        rows: nextRows,
      });
    });
    return checkpointWrite;
  };

  await mapPool(pending, opts.concurrency, async (target) => {
    const started = Date.now();
    try {
      if (opts.delayMs) await delay(opts.delayMs);
      const result = await getGamePossessions(target.gameId, {
        bypassCache: true,
      });
      const row = rowFromResult(target.gameId, result, Date.now() - started, {
        season: target.season,
        date: target.date,
      });
      rows.push(row);
      completed.add(target.gameId);
      console.error(
        `[game] ${target.gameId} grade=${row.calibrationGrade} official=${row.officialHome}/${row.officialAway} derived=${row.reconstructedHome}/${row.reconstructedAway}`
      );
    } catch (error) {
      const row = rowFromResult(
        target.gameId,
        {
          status: "unavailable",
          gameId: target.gameId,
          reason: "pbp_fetch_failed",
          message: error instanceof Error ? error.message : "unknown",
          capability: {
            rawPbpAvailable: false,
            rawEventCount: 0,
            scoreTimelineAvailable: false,
            possessionsDerived: false,
            reconstructedPossessionsAvailable: false,
            officialPossessionTotalsAvailable: false,
            possessionCalibrationGrade: "not_comparable",
            lineupsDerived: false,
            source: null,
            provenance: null,
            status: "unavailable",
          },
        },
        Date.now() - started,
        { season: target.season, date: target.date }
      );
      row.failureReason =
        error instanceof Error ? error.message : "unknown_error";
      rows.push(row);
      completed.add(target.gameId);
      console.error(`[game] ${target.gameId} ERROR ${row.failureReason}`);
    }
    await persist(rows, completed);
    return null;
  });

  await checkpointWrite;
  return rows;
}

function writeOutputs(
  outDir: string,
  rows: CalibrationGameRow[],
  opts: CliOptions
): void {
  mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const stats = aggregateCalibrationStats(rows);
  const payload = {
    generatedAt,
    options: opts,
    summary: stats,
    bySeason: groupRowsBy(rows, (r) => r.season),
    byEra: groupRowsBy(rows, (r) => seasonEra(r.season)),
    worst: worstComparableGames(rows, 25),
    rows,
  };
  writeFileSync(
    path.join(outDir, "latest.json"),
    JSON.stringify(payload, null, 2)
  );
  writeFileSync(path.join(outDir, "games.csv"), rowsToCsv(rows));
  const methodology = opts.fixtureOnly
    ? "Fixture-only calibration over recorded full-game PBP/box/advanced-box envelopes. No live network. Failures remain in the denominator."
    : "Deterministic season schedule sample (stats.nba.com scheduleleaguev2) with seeded shuffle; live PBP/box/advanced-box fetches via product clients. Checkpoint/resume supported. Failures remain in the denominator and are not silently dropped.";
  writeFileSync(
    path.join(outDir, "latest.md"),
    renderMarkdown({ methodology, options: opts, rows, generatedAt })
  );
  console.error(`[audit] wrote ${path.join(outDir, "latest.md")}`);
  console.error(
    `[audit] comparable=${stats.comparableGames} exact=${fmtPct(stats.exactMatchPct)} ±1=${fmtPct(stats.withinOnePct)} officialAvail=${fmtPct((stats.officialTotalAvailabilityRate ?? 0) * 100)}`
  );
}

export async function runPossessionCalibrationAudit(
  argv: string[] = process.argv.slice(2)
): Promise<{ rows: CalibrationGameRow[]; outDir: string }> {
  const opts = parseArgs(argv);
  mkdirSync(opts.outDir, { recursive: true });

  if (opts.offline && !opts.fixtureOnly) {
    const checkpoint = loadCheckpoint(opts.outDir);
    if (!checkpoint?.rows.length) {
      throw new Error("Offline mode requires an existing checkpoint with rows.");
    }
    writeOutputs(opts.outDir, checkpoint.rows, opts);
    return { rows: checkpoint.rows, outDir: opts.outDir };
  }

  const rows = opts.fixtureOnly
    ? await runFixtureOnly(opts)
    : await runLive(opts);
  writeOutputs(opts.outDir, rows, opts);
  return { rows, outDir: opts.outDir };
}

const isDirectCli =
  typeof process.argv[1] === "string" &&
  /audit-possession-reconstruction\.(ts|js|mjs|cjs)$/.test(process.argv[1]);

if (isDirectCli) {
  runPossessionCalibrationAudit().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
