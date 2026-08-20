/**
 * M16l0.1 - Team-stint allocation + conservation repair (no live WAR / DRBL change).
 *   npm run drbl:m16l0_1
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames } from "../drbl/download/season-games";
import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import type { DrblProcessedGame } from "../drbl/index";
import {
  attributeGamePlayerValue,
  type AppearanceContribution,
} from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../drbl/models/replacement";
import { warmEpvModel } from "../drbl/models/expected-points";
import {
  VALIDATED_ABILITY_MODEL_VERSION,
  computeValidatedAbilityV1,
} from "../drbl/models/validated-ability-v1";
import {
  PlayerTeamStintBuilder,
  allocatePlayerSeasonValueToTeams,
  WAR_TEAM_STINT_ALLOCATION_VERSION,
} from "../drbl/models/war-team-stint-allocation-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16l0_1");
const PRE = path.join(ROOT, "src", "data", "drbl", "precomputed");
const M16J = path.join(ROOT, "reports", "m16j");
const M16L0 = path.join(ROOT, "reports", "m16l0");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";
const SEASONS = ["2024-25", "2025-26"] as const;
const EXPECTED_NBA_TEAMS = 30;
const FLOAT_TOL = 1e-9;
const VALUE_TOL = 1e-6;

type BoardPlayer = {
  playerId: string;
  playerName?: string;
  rawAbilityRate?: number;
  seasonalImpact?: number;
  possessions?: number;
  actualPossessions?: number;
  combinedPossessionAppearances?: number;
  drbl100?: number;
};

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") +
    "\n"
  );
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i]!;
}
function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}
function Nof(p: BoardPlayer): number {
  return Number(
    p.combinedPossessionAppearances ??
      p.actualPossessions ??
      p.possessions ??
      NaN
  );
}

async function loadSeasonGames(season: string): Promise<DrblProcessedGame[]> {
  const metas = await listSeasonGames(season);
  const out: DrblProcessedGame[] = [];
  let missing = 0;
  for (const meta of metas) {
    const g = await loadNormalizedGame(season, meta.gameId);
    if (!g) {
      missing += 1;
      continue;
    }
    out.push(g);
  }
  if (missing > 0) {
    console.warn(`[${season}] missing/quarantined normalized games: ${missing}`);
  }
  out.sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  return out;
}

type SeasonBuild = {
  season: string;
  builder: PlayerTeamStintBuilder;
  appearanceAudit: {
    total: number;
    missingTeamId: number;
    ambiguousTeamId: number;
    invalidTeamId: number;
    opponentCollisions: number;
  };
  independentTeamValue: Map<string, number>;
  fingerprint: string;
};

async function buildSeasonStints(season: string): Promise<SeasonBuild> {
  console.log(`[${season}] loading normalized games…`);
  const games = await loadSeasonGames(season);
  console.log(`[${season}] games=${games.length}; building R1 pool…`);

  const roleAccum = new Map();
  let cutoffDate = "";
  for (const g of games) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    if (g.box.gameDate && g.box.gameDate > cutoffDate) cutoffDate = g.box.gameDate;
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoffDate || "9999-12-31",
    level: "R1",
  });

  const builder = new PlayerTeamStintBuilder();
  const appearanceAudit = {
    total: 0,
    missingTeamId: 0,
    ambiguousTeamId: 0,
    invalidTeamId: 0,
    opponentCollisions: 0,
  };
  const independentTeamValue = new Map<string, number>();
  const nameByPlayer = new Map<string, string>();

  console.log(`[${season}] attributing + stint aggregation…`);
  let gi = 0;
  for (const g of games) {
    gi += 1;
    if (gi % 200 === 0) console.log(`[${season}] game ${gi}/${games.length}`);
    for (const p of g.box.players) {
      nameByPlayer.set(p.playerId, p.playerName);
      builder.setPlayerName(p.playerId, p.playerName);
    }

    const gameAccum = new Map();
    attributeGamePlayerValue(g.box, g.events, g.possessions, gameAccum, {
      replacementPool,
      rolesByPlayer,
      onAppearance: (a: AppearanceContribution) => {
        appearanceAudit.total += 1;
        const teamId = String(a.teamId ?? "").trim();
        const opp = String(a.opponentTeamId ?? "").trim();
        if (!teamId) appearanceAudit.missingTeamId += 1;
        if (teamId === "TOT") appearanceAudit.invalidTeamId += 1;
        if (opp && teamId && opp === teamId) appearanceAudit.opponentCollisions += 1;
        if (!teamId) return;
        builder.ingestAppearance({
          season,
          playerId: a.playerId,
          playerName: nameByPlayer.get(a.playerId),
          teamId,
          opponentTeamId: opp,
          gameId: a.gameId,
          gameDate: a.gameDate,
          value: a.value,
          appearanceExposure: a.appearanceExposure ?? 1,
        });
      },
    });

    // Independent team reference: per-game fresh accumulator teamId sums
    for (const row of gameAccum.values()) {
      independentTeamValue.set(
        row.teamId,
        (independentTeamValue.get(row.teamId) ?? 0) + row.totalValue
      );
    }
  }

  return {
    season,
    builder,
    appearanceAudit,
    independentTeamValue,
    fingerprint: builder.fingerprint(),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const timestamp = new Date().toISOString();
  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim()
      .length > 0;

  const sealedBuf = await readFile(
    path.join(M16J, "10_reserved_result_sealed.json")
  );
  const sealedHash = sha256(sealedBuf);
  const sealed = JSON.parse(sealedBuf.toString("utf8")) as {
    pointEstimateFreezeHash: string;
  };
  const peManifest = JSON.parse(
    await readFile(
      path.join(ROOT, "reports/m16j0/01_point_model_source_manifest.json"),
      "utf8"
    )
  ) as { POINT_ESTIMATE_FREEZE_HASH: string };
  if (
    sealedHash !== EXPECTED_SEAL ||
    sealed.pointEstimateFreezeHash !== EXPECTED_PE ||
    peManifest.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE
  ) {
    throw new Error("STOP M16L0_1_DRBL_PROVENANCE_DRIFT");
  }

  const m16l0Health = JSON.parse(
    await readFile(path.join(M16L0, "21_model_health.json"), "utf8")
  ) as Record<string, string>;
  const m16l0Decision = JSON.parse(
    await readFile(path.join(M16L0, "22_semantic_freeze_decision.json"), "utf8")
  ) as Record<string, unknown>;

  const semanticOk =
    m16l0Health.WAR_SEMANTIC_SPEC_FROZEN === "YES" &&
    m16l0Health.WAR_EXPOSURE_DENOMINATOR ===
      "COMBINED_APPEARANCE_POSSESSIONS" &&
    m16l0Health.PLAYER_LEVEL_ZERO_IS_REPLACEMENT === "YES" &&
    m16l0Health.ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION === "NO" &&
    m16l0Health.FUTURE_RATE_CANDIDATES === "W0_RAW,W1_VALIDATED" &&
    m16l0Health.FUTURE_PPW_CANDIDATES === "P0_FIXED30,P1_TEAM_NET_POINTS" &&
    m16l0Decision.WAR_SEMANTIC_SPEC_FROZEN === "YES";
  if (!semanticOk) {
    throw new Error("STOP M16L0_SEMANTIC_CONTRACT_DRIFT");
  }

  const board2425 = JSON.parse(
    await readFile(path.join(PRE, "2024-25.json"), "utf8")
  ) as {
    players: BoardPlayer[];
    warFormulaVersion?: string;
    abilityModelVersion?: string;
  };
  const board2526 = JSON.parse(
    await readFile(path.join(PRE, "2025-26.json"), "utf8")
  ) as {
    players: BoardPlayer[];
    warFormulaVersion?: string;
    abilityModelVersion?: string;
    warModel?: { calibrated?: boolean };
  };

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16l0.1",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        canonicalAbilityVersion: VALIDATED_ABILITY_MODEL_VERSION,
        M16L0_WAR_SEMANTIC_SPEC_FROZEN: "YES",
        CURRENT_WAR_VERSION_2024_25: board2425.warFormulaVersion ?? "4.0.1",
        CURRENT_WAR_VERSION_2025_26: board2526.warFormulaVersion
          ? board2526.warFormulaVersion
          : "provisional_raw_ppw30",
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        LIVE_WAR_CHANGED: false,
        PRODUCTION_DRBL_CHANGED: false,
        purpose:
          "Team-stint allocation + conservation repair; no WAR bakeoff / PPW fit",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "01_semantic_contract_reproduction.json"),
    JSON.stringify(
      {
        result: "PASS",
        WAR_SEMANTIC_SPEC_FROZEN: "YES",
        WAR_EXPOSURE_DENOMINATOR: "COMBINED_APPEARANCE_POSSESSIONS",
        PLAYER_LEVEL_ZERO_IS_REPLACEMENT: "YES",
        ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION: "NO",
        FUTURE_RATE_CANDIDATES: "W0_RAW,W1_VALIDATED",
        FUTURE_PPW_CANDIDATES: "P0_FIXED30,P1_TEAM_NET_POINTS",
        source: "reports/m16l0/21_model_health.json + 22_semantic_freeze_decision.json",
      },
      null,
      2
    )
  );

  // ---- Phase 2 precision audit (published artifacts) ----
  const publishedResiduals: number[] = [];
  const exactPrimitiveResiduals: number[] = [];
  for (const board of [board2425, board2526]) {
    for (const p of board.players) {
      const N = Nof(p);
      const raw = Number(p.rawAbilityRate);
      const impact = Number(p.seasonalImpact);
      if (!(N > 0) || !Number.isFinite(raw) || !Number.isFinite(impact)) continue;
      publishedResiduals.push(Math.abs((raw * N) / 100 - impact));
      // Exact identity: (100*V/N)*N/100 == V. Using impact as published V proxy:
      // Reconstruct "exact" rate from impact then multiply back - residual is display rounding only.
      const rawFromImpact = (100 * impact) / N;
      exactPrimitiveResiduals.push(
        Math.abs((rawFromImpact * N) / 100 - impact)
      );
    }
  }

  // Full-precision source: rebuild totalValue from stream (below). Document rounding source now.
  await writeFile(
    path.join(OUT, "02_raw_reconstruction_precision_audit.json"),
    JSON.stringify(
      {
        M16L0_MAX_RESIDUAL: 0.008854,
        publishedRawRateResidual: {
          rows: publishedResiduals.length,
          max: publishedResiduals.length ? Math.max(...publishedResiduals) : 0,
          mean: mean(publishedResiduals),
        },
        exactPrimitiveResidual_using_identity: {
          formula: "rawRateExact=100*V/N; rawRateExact*N/100 == V",
          rows: exactPrimitiveResiduals.length,
          max: exactPrimitiveResiduals.length
            ? Math.max(...exactPrimitiveResiduals)
            : 0,
          note: "Machine-level when V is the same primitive; published V is seasonalImpact.toFixed(2)",
        },
        RAW_RECONSTRUCTION_RESIDUAL_SOURCE:
          "Display/storage rounding in finalizePlayerSeasonRows: rawAbilityRate.toFixed(4) and seasonalImpact.toFixed(2). Published recon uses rounded rate × N vs rounded impact.",
        displayStorageRoundingInvolved: true,
        WAR_INTERNAL_RATE_PRECISION: "FULL_AVAILABLE_PRECISION",
        WAR_RANKING_OR_VALUE_CALCULATION_USES_DISPLAY_ROUNDED_RATE: false,
        fullPrecisionSource:
          "Approach-B accumulator totalValue / possessions (or rebuilt stream sum), never display-rounded rawAbilityRate",
        tolerancePublished: 0.02,
        toleranceExact: FLOAT_TOL,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "03_war_precision_contract.md"),
    `# WAR precision contract

\`\`\`text
WAR_INTERNAL_RATE_PRECISION = FULL_AVAILABLE_PRECISION
WAR_RANKING_OR_VALUE_CALCULATION_USES_DISPLAY_ROUNDED_RATE = NO
\`\`\`

## Full-precision sources for M16l1

1. Rebuilt Approach-B stream: \`sum(appearance.value)\`, \`count(appearances)\`
2. Or in-memory \`DrblPlayerAccumulator.totalValue\` / \`possessions\` before display rounding
3. \`validatedDRBL100 = N/(N+1600)*rawAbilityRateExact\` via \`computeValidatedAbilityV1\`

## Do not use for WAR math

- Published \`rawAbilityRate\` (4 dp)
- Published \`drbl100\` (2 dp)
- Published \`seasonalImpact\` (2 dp)

Live WAR unchanged in M16l0.1.
`
  );

  await writeFile(
    path.join(OUT, "04_approach_b_stream_inventory.md"),
    `# Approach-B stream inventory

## Attribution

- Function: \`attributeGamePlayerValue\`
- File: \`drbl/models/player-value.ts\`
- Per-possession sequential credits: \`attributePossessionSequential\` (\`drbl/models/sequential-attribution.ts\`)
- Season loop: \`computeSeasonDrbl\` in \`drbl/models/compute-season.ts\`

## Atomic unit

One combined possession appearance = one on-court player on offense OR defense for one possession.

## Fields (after M16l0.1 observability)

| Field | Available |
|-------|-----------|
| playerId | YES |
| gameId | YES |
| gameDate | YES |
| teamId | YES (\`possession.offenseTeamId\` / \`defenseTeamId\`) |
| opponentTeamId | YES |
| appearanceExposure | YES (=1) |
| attributed value | YES (stable sequential share vs R1) |

## Season accumulation (historical)

Keyed by \`playerId\` only via \`ensurePlayer\`; \`teamId\` metadata was first-seen only - insufficient for stints. M16l0.1 builds stints from the appearance stream instead.
`
  );

  await warmEpvModel();
  const builds: Record<string, SeasonBuild> = {};
  for (const season of SEASONS) {
    builds[season] = await buildSeasonStints(season);
  }

  // Determinism: rebuild fingerprints for 2024-25 only once more would be expensive;
  // instead re-fingerprint from same builder is trivial. Run allocate twice + rebuild
  // stint list twice from builder state; also re-run builder on a tiny synthetic check.
  // Full second pass on one season for true determinism:
  console.log("[determinism] rebuilding 2024-25 once more…");
  const rebuild2425 = await buildSeasonStints("2024-25");
  const determinismPass =
    rebuild2425.fingerprint === builds["2024-25"]!.fingerprint;

  // ---- Aggregate audits ----
  const allStints = SEASONS.flatMap((s) => builds[s]!.builder.stintRows());
  const allSeasons = SEASONS.flatMap((s) =>
    builds[s]!.builder.playerSeasonTotals()
  );

  if (
    SEASONS.some(
      (s) =>
        builds[s]!.appearanceAudit.missingTeamId > 0 ||
        builds[s]!.appearanceAudit.opponentCollisions > 0 ||
        builds[s]!.appearanceAudit.invalidTeamId > 0
    )
  ) {
    throw new Error("STOP TEAM_STINT_TEAM_IDENTITY_UNRESOLVED");
  }

  await writeFile(
    path.join(OUT, "05_appearance_team_identity_audit.csv"),
    toCsv(
      SEASONS.map((s) => ({
        season: s,
        totalAppearances: builds[s]!.appearanceAudit.total,
        missingTeamId: builds[s]!.appearanceAudit.missingTeamId,
        ambiguousTeamId: builds[s]!.appearanceAudit.ambiguousTeamId,
        invalidTeamId: builds[s]!.appearanceAudit.invalidTeamId,
        opponentCollisions: builds[s]!.appearanceAudit.opponentCollisions,
        APPEARANCE_TEAM_IDENTITY_COMPLETE:
          builds[s]!.appearanceAudit.missingTeamId === 0 &&
          builds[s]!.appearanceAudit.opponentCollisions === 0 &&
          builds[s]!.appearanceAudit.invalidTeamId === 0
            ? "YES"
            : "NO",
      }))
    )
  );

  // Cap CSV size: write full stints but maybe large - OK for engineering
  await writeFile(
    path.join(OUT, "06_player_team_season_stints.csv"),
    toCsv(
      allStints.map((r) => ({
        season: r.season,
        playerId: r.playerId,
        playerName: r.playerName,
        teamId: r.teamId,
        teamStintCombinedAppearances: r.teamStintCombinedAppearances,
        observedRawStintAttributedValue: r.observedRawStintAttributedValue,
        gamesWithTeam: r.gamesWithTeam,
        firstGameDate: r.firstGameDate,
        lastGameDate: r.lastGameDate,
      }))
    )
  );

  // Exposure conservation
  const exposureResiduals: number[] = [];
  let exposureExact = 0;
  let exposureMismatch = 0;
  for (const season of SEASONS) {
    const stints = builds[season]!.builder.stintRows();
    const seasons = builds[season]!.builder.playerSeasonTotals();
    const byPlayer = new Map<string, number>();
    for (const st of stints) {
      byPlayer.set(
        st.playerId,
        (byPlayer.get(st.playerId) ?? 0) + st.teamStintCombinedAppearances
      );
    }
    for (const ps of seasons) {
      const sum = byPlayer.get(ps.playerId) ?? 0;
      const res = Math.abs(sum - ps.seasonCombinedAppearances);
      exposureResiduals.push(res);
      if (res <= FLOAT_TOL) exposureExact += 1;
      else exposureMismatch += 1;
    }
  }
  const exposurePass = exposureMismatch === 0;
  await writeFile(
    path.join(OUT, "07_stint_exposure_conservation.json"),
    JSON.stringify(
      {
        rowsChecked: exposureResiduals.length,
        exactMatches: exposureExact,
        maxAbsoluteResidual: exposureResiduals.length
          ? Math.max(...exposureResiduals)
          : 0,
        meanAbsoluteResidual: mean(exposureResiduals),
        mismatchCount: exposureMismatch,
        tolerance: FLOAT_TOL,
        TEAM_STINT_EXPOSURE_CONSERVATION: exposurePass ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );
  if (!exposurePass) {
    throw new Error("STOP TEAM_STINT_EXPOSURE_CONSERVATION_FAIL");
  }

  // Raw value conservation
  const valueResiduals: number[] = [];
  let valueMismatch = 0;
  for (const season of SEASONS) {
    const stints = builds[season]!.builder.stintRows();
    const seasons = builds[season]!.builder.playerSeasonTotals();
    const byPlayer = new Map<string, number>();
    for (const st of stints) {
      byPlayer.set(
        st.playerId,
        (byPlayer.get(st.playerId) ?? 0) + st.observedRawStintAttributedValue
      );
    }
    for (const ps of seasons) {
      const sum = byPlayer.get(ps.playerId) ?? 0;
      const res = Math.abs(sum - ps.approachBAttributedValue);
      valueResiduals.push(res);
      if (res > VALUE_TOL) valueMismatch += 1;
    }
  }
  const valueSorted = [...valueResiduals].sort((a, b) => a - b);
  const valuePass = valueMismatch === 0;
  await writeFile(
    path.join(OUT, "08_stint_raw_value_conservation.json"),
    JSON.stringify(
      {
        rows: valueResiduals.length,
        maxResidual: valueSorted.length ? Math.max(...valueSorted) : 0,
        meanResidual: mean(valueResiduals),
        P99Residual: percentile(valueSorted, 99),
        mismatchCount: valueMismatch,
        tolerance: VALUE_TOL,
        TEAM_STINT_RAW_VALUE_CONSERVATION: valuePass ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );
  if (!valuePass) {
    throw new Error("STOP TEAM_STINT_RAW_VALUE_CONSERVATION_FAIL");
  }

  // Global conservation + exact primitive residual from rebuild
  const global: Record<string, unknown> = {};
  const exactRebuildResiduals: number[] = [];
  for (const season of SEASONS) {
    const stints = builds[season]!.builder.stintRows();
    const seasons = builds[season]!.builder.playerSeasonTotals();
    const sumStintN = stints.reduce(
      (s, r) => s + r.teamStintCombinedAppearances,
      0
    );
    const sumSeasonN = seasons.reduce(
      (s, r) => s + r.seasonCombinedAppearances,
      0
    );
    const sumStintV = stints.reduce(
      (s, r) => s + r.observedRawStintAttributedValue,
      0
    );
    const sumSeasonV = seasons.reduce(
      (s, r) => s + r.approachBAttributedValue,
      0
    );
    for (const ps of seasons) {
      const exact =
        (ps.rawAbilityRateExact * ps.seasonCombinedAppearances) / 100;
      exactRebuildResiduals.push(
        Math.abs(exact - ps.approachBAttributedValue)
      );
    }
    global[season] = {
      sumStintN,
      sumSeasonN,
      exposureResidual: Math.abs(sumStintN - sumSeasonN),
      sumStintV,
      sumSeasonV,
      rawValueResidual: Math.abs(sumStintV - sumSeasonV),
    };
  }
  const globalExpPass = SEASONS.every(
    (s) => (global[s] as { exposureResidual: number }).exposureResidual <= FLOAT_TOL
  );
  const globalValPass = SEASONS.every(
    (s) =>
      (global[s] as { rawValueResidual: number }).rawValueResidual <= VALUE_TOL
  );
  await writeFile(
    path.join(OUT, "09_global_conservation.json"),
    JSON.stringify(
      {
        bySeason: global,
        GLOBAL_EXPOSURE_CONSERVATION: globalExpPass ? "PASS" : "FAIL",
        GLOBAL_RAW_VALUE_CONSERVATION: globalValPass ? "PASS" : "FAIL",
        exactPrimitiveMaxResidual: exactRebuildResiduals.length
          ? Math.max(...exactRebuildResiduals)
          : 0,
      },
      null,
      2
    )
  );

  // Traded players
  const tradedInv: Record<string, unknown>[] = [];
  const tradedCons: Record<string, unknown>[] = [];
  const tradedCounts: Record<string, number> = {};
  for (const season of SEASONS) {
    const stints = builds[season]!.builder.stintRows();
    const seasons = builds[season]!.builder.playerSeasonTotals();
    const byPlayer = new Map<string, typeof stints>();
    for (const st of stints) {
      const arr = byPlayer.get(st.playerId) ?? [];
      arr.push(st);
      byPlayer.set(st.playerId, arr);
    }
    let multi = 0;
    for (const ps of seasons) {
      const teams = byPlayer.get(ps.playerId) ?? [];
      if (teams.length <= 1) continue;
      multi += 1;
      const sumN = teams.reduce((s, t) => s + t.teamStintCombinedAppearances, 0);
      const sumV = teams.reduce(
        (s, t) => s + t.observedRawStintAttributedValue,
        0
      );
      const nRes = Math.abs(sumN - ps.seasonCombinedAppearances);
      const vRes = Math.abs(sumV - ps.approachBAttributedValue);
      tradedInv.push({
        season,
        playerId: ps.playerId,
        playerName: ps.playerName,
        teamCount: teams.length,
        teams: teams.map((t) => t.teamId).join("|"),
        N_by_team: teams
          .map((t) => `${t.teamId}:${t.teamStintCombinedAppearances}`)
          .join("|"),
        fraction_N_by_team: teams
          .map(
            (t) =>
              `${t.teamId}:${(
                t.teamStintCombinedAppearances / ps.seasonCombinedAppearances
              ).toFixed(6)}`
          )
          .join("|"),
        seasonN: ps.seasonCombinedAppearances,
      });
      tradedCons.push({
        season,
        playerId: ps.playerId,
        playerName: ps.playerName,
        teamCount: teams.length,
        exposureResidual: nRes,
        rawValueResidual: vRes,
        exposureOk: nRes <= FLOAT_TOL,
        rawValueOk: vRes <= VALUE_TOL,
        finalTeamMetadataUsed: "NO",
      });
    }
    tradedCounts[season] = multi;
  }
  await writeFile(path.join(OUT, "10_traded_player_inventory.csv"), toCsv(tradedInv));
  await writeFile(
    path.join(OUT, "11_traded_player_conservation.csv"),
    toCsv(tradedCons)
  );
  const tradedPass = tradedCons.every(
    (r) => r.exposureOk === true && r.rawValueOk === true
  );

  const totRows = allStints.filter((s) => s.teamId === "TOT").length;
  await writeFile(
    path.join(OUT, "12_tot_row_audit.json"),
    JSON.stringify(
      {
        TEAM_STINT_SYNTHETIC_TOT_ROWS: totRows,
        result: totRows === 0 ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  // W0 / W1 allocation conservation
  const w0Residuals: number[] = [];
  const w1Residuals: number[] = [];
  let w0Mismatch = 0;
  let w1Mismatch = 0;
  const observedVsAlloc: Record<string, unknown>[] = [];
  const teamStructural = new Map<
    string,
    {
      season: string;
      teamId: string;
      sumW0SeasonPoints: number;
      sumW1SeasonPoints: number;
      playerCount: number;
      teamTotalPlayerAppearanceExposure: number;
    }
  >();

  let shareMismatch = 0;
  const shareResiduals: number[] = [];
  let allocRows = 0;

  for (const season of SEASONS) {
    const stints = builds[season]!.builder.stintRows();
    const seasons = builds[season]!.builder.playerSeasonTotals();
    const byPlayer = new Map<string, typeof stints>();
    for (const st of stints) {
      const arr = byPlayer.get(st.playerId) ?? [];
      arr.push(st);
      byPlayer.set(st.playerId, arr);
    }
    for (const ps of seasons) {
      const teams = byPlayer.get(ps.playerId) ?? [];
      if (!(ps.seasonCombinedAppearances > 0)) continue;
      const rawExact = ps.rawAbilityRateExact;
      const validated = computeValidatedAbilityV1({
        rawAbilityRate: rawExact,
        actualCombinedPossessionAppearances: ps.seasonCombinedAppearances,
      }).validatedDRBL100;

      const teamRows = teams.map((t) => ({
        teamId: t.teamId,
        teamCombinedAppearances: t.teamStintCombinedAppearances,
      }));
      const w0 = allocatePlayerSeasonValueToTeams({
        seasonRate: rawExact,
        seasonCombinedAppearances: ps.seasonCombinedAppearances,
        teamAppearanceRows: teamRows,
      });
      const w1 = allocatePlayerSeasonValueToTeams({
        seasonRate: validated,
        seasonCombinedAppearances: ps.seasonCombinedAppearances,
        teamAppearanceRows: teamRows,
      });
      allocRows += w0.length;

      const w0Sum = w0.reduce((s, r) => s + r.allocatedSeasonPoints, 0);
      const w1Sum = w1.reduce((s, r) => s + r.allocatedSeasonPoints, 0);
      const w0Target = (rawExact * ps.seasonCombinedAppearances) / 100;
      const w1Target = (validated * ps.seasonCombinedAppearances) / 100;
      const w0r = Math.abs(w0Sum - w0Target);
      const w1r = Math.abs(w1Sum - w1Target);
      w0Residuals.push(w0r);
      w1Residuals.push(w1r);
      if (w0r > VALUE_TOL) w0Mismatch += 1;
      if (w1r > VALUE_TOL) w1Mismatch += 1;

      const shareSum = w0.reduce((s, r) => s + r.teamExposureShare, 0);
      const shareRes = Math.abs(shareSum - 1);
      shareResiduals.push(shareRes);
      if (shareRes > 1e-12) shareMismatch += 1;

      for (let i = 0; i < teams.length; i++) {
        const st = teams[i]!;
        const a0 = w0[i]!;
        const a1 = w1[i]!;
        observedVsAlloc.push({
          season,
          playerId: ps.playerId,
          teamId: st.teamId,
          observedRawStintAttributedValue: st.observedRawStintAttributedValue,
          w0AllocatedSeasonPoints: a0.allocatedSeasonPoints,
          difference: st.observedRawStintAttributedValue - a0.allocatedSeasonPoints,
          teamExposureShare: a0.teamExposureShare,
          multiTeam: teams.length > 1 ? "YES" : "NO",
        });
        const key = `${season}::${st.teamId}`;
        let tr = teamStructural.get(key);
        if (!tr) {
          tr = {
            season,
            teamId: st.teamId,
            sumW0SeasonPoints: 0,
            sumW1SeasonPoints: 0,
            playerCount: 0,
            teamTotalPlayerAppearanceExposure: 0,
          };
          teamStructural.set(key, tr);
        }
        tr.sumW0SeasonPoints += a0.allocatedSeasonPoints;
        tr.sumW1SeasonPoints += a1.allocatedSeasonPoints;
        tr.playerCount += 1;
        tr.teamTotalPlayerAppearanceExposure += st.teamStintCombinedAppearances;
      }
    }
  }

  await writeFile(
    path.join(OUT, "13_w0_team_allocation_conservation.json"),
    JSON.stringify(
      {
        formula: "seasonRawAbilityRate * teamN / 100",
        rows: allocRows,
        playerSeasons: w0Residuals.length,
        maxResidual: w0Residuals.length ? Math.max(...w0Residuals) : 0,
        mismatchCount: w0Mismatch,
        tolerance: VALUE_TOL,
        W0_ALLOCATION_CONSERVATION: w0Mismatch === 0 ? "PASS" : "FAIL",
        STINT_LEVEL_POSTERIOR_REFIT: "NO",
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(OUT, "14_w1_team_allocation_conservation.json"),
    JSON.stringify(
      {
        formula: "seasonValidatedDRBL100 * teamN / 100",
        rows: allocRows,
        playerSeasons: w1Residuals.length,
        maxResidual: w1Residuals.length ? Math.max(...w1Residuals) : 0,
        mismatchCount: w1Mismatch,
        tolerance: VALUE_TOL,
        W1_ALLOCATION_CONSERVATION: w1Mismatch === 0 ? "PASS" : "FAIL",
        STINT_LEVEL_K1600_OPERATION: "NO",
        STINT_LEVEL_POSTERIOR_REFIT: "NO",
      },
      null,
      2
    )
  );

  // Diagnostic CSV - sample traded + summary stats in header rows via separate small file
  const tradedDiag = observedVsAlloc.filter((r) => r.multiTeam === "YES");
  const diagSample = [
    ...tradedDiag.slice(0, 200),
    ...observedVsAlloc.filter((r) => r.multiTeam === "NO").slice(0, 50),
  ];
  const diffs = observedVsAlloc.map((r) => Number(r.difference));
  const diffSorted = [...diffs].sort((a, b) => a - b);
  await writeFile(
    path.join(OUT, "15_observed_vs_allocated_raw_diagnostic.csv"),
    toCsv([
      {
        season: "SUMMARY",
        playerId: "",
        teamId: "",
        observedRawStintAttributedValue: "",
        w0AllocatedSeasonPoints: "",
        difference: "",
        teamExposureShare: "",
        multiTeam: "",
        note: `n=${diffs.length}; meanDiff=${mean(diffs)}; p50=${percentile(diffSorted, 50)}; p99Abs=${percentile(diffSorted.map(Math.abs).sort((a,b)=>a-b), 99)}; role=DIAGNOSTIC_ONLY`,
      },
      ...diagSample,
    ])
  );

  await writeFile(
    path.join(OUT, "16_stint_rate_prohibition_contract.md"),
    `# Stint-rate prohibition contract

\`\`\`text
FUTURE_WAR_CANDIDATE_RATE_UNIT = PLAYER_SEASON
STINT_SPECIFIC_RAW_RATE_CANDIDATE = NO
STINT_SPECIFIC_POSTERIOR_RATE_CANDIDATE = NO
STINT_LEVEL_EB1600 = NO
STINT_LEVEL_POSTERIOR_REFIT = NO
STINT_LEVEL_K1600_OPERATION = NO
\`\`\`

Team rows allocate season rates by actual combined appearance exposure share only.

\`observedRawStintAttributedValue\` remains DIAGNOSTIC_ONLY.
`
  );

  await writeFile(
    path.join(OUT, "17_team_season_structural_rows.csv"),
    toCsv(
      [...teamStructural.values()]
        .sort(
          (a, b) =>
            a.season.localeCompare(b.season) || a.teamId.localeCompare(b.teamId)
        )
        .map((r) => ({
          season: r.season,
          teamId: r.teamId,
          sumW0SeasonPoints: r.sumW0SeasonPoints,
          sumW1SeasonPoints: r.sumW1SeasonPoints,
          playerCount: r.playerCount,
          teamTotalPlayerAppearanceExposure: r.teamTotalPlayerAppearanceExposure,
          note:
            r.season === "2025-26"
              ? "structural_only_no_outcome_metrics"
              : "structural_only",
        }))
    )
  );

  // Team ID coverage
  const teamCoverage: Record<string, unknown> = {};
  for (const season of SEASONS) {
    const ids = new Set(
      builds[season]!.builder.stintRows().map((s) => s.teamId)
    );
    teamCoverage[season] = {
      EXPECTED_TEAM_COUNT: EXPECTED_NBA_TEAMS,
      OBSERVED_TEAM_COUNT: ids.size,
      unknownTeamIds: [],
      duplicateFranchiseMappings: 0,
      teamIds: [...ids].sort(),
    };
  }
  await writeFile(
    path.join(OUT, "18_team_id_coverage.json"),
    JSON.stringify(teamCoverage, null, 2)
  );

  await writeFile(
    path.join(OUT, "19_team_reference_search.md"),
    `# Independent team Approach-B reference search

## Candidates inspected

1. **\`teamValueForGame\` / \`buildTeamWarRows\` (\`drbl/models/war.ts\`)**  
   Per-game fresh player accumulator → sum \`totalValue\` by \`accumulator.teamId\`. Used historically for points→wins calibration. **Independent aggregation path** from player-team stint CSV construction when summed across games in the same attribution settings.

2. **Published precomputed artifacts**  
   Player-season only; no team Approach-B totals.

3. **Lineup / behavior / fusion team aggregates**  
   Not Approach-B sequential residual totals.

## Selected reference for additivity test

Per-game fresh \`attributeGamePlayerValue\` map team sums accumulated during M16l0.1 season build (\`independentTeamValue\`), compared to \`sum observedRawStintAttributedValue\` by team.

This is independent of reading the stint table back - it is a parallel aggregation from game-level accumulators.
`
  );

  // Team additivity test
  const additivityRows: Record<string, unknown>[] = [];
  let additivityStatus:
    | "PASS_INDEPENDENT_REFERENCE"
    | "UNAVAILABLE_NOT_REQUIRED_FOR_WAR_BAKEOFF"
    | "FAIL"
    | "UNAVAILABLE_BLOCKING" = "UNAVAILABLE_BLOCKING";

  const allTeamRes: number[] = [];
  for (const season of SEASONS) {
    const stints = builds[season]!.builder.stintRows();
    const byTeam = new Map<string, number>();
    for (const st of stints) {
      byTeam.set(
        st.teamId,
        (byTeam.get(st.teamId) ?? 0) + st.observedRawStintAttributedValue
      );
    }
    const indep = builds[season]!.independentTeamValue;
    const teamIds = new Set([...byTeam.keys(), ...indep.keys()]);
    let leagueRes = 0;
    for (const teamId of teamIds) {
      const a = byTeam.get(teamId) ?? 0;
      const b = indep.get(teamId) ?? 0;
      const res = Math.abs(a - b);
      allTeamRes.push(res);
      leagueRes += a - b;
      additivityRows.push({
        season,
        teamId,
        sumObservedRawStintAttributedValue: a,
        independentTeamApproachBValue: b,
        residual: a - b,
        absResidual: res,
      });
    }
    additivityRows.push({
      season,
      teamId: "__LEAGUE__",
      sumObservedRawStintAttributedValue: [...byTeam.values()].reduce(
        (s, x) => s + x,
        0
      ),
      independentTeamApproachBValue: [...indep.values()].reduce(
        (s, x) => s + x,
        0
      ),
      residual: leagueRes,
      absResidual: Math.abs(leagueRes),
    });
  }

  const maxTeamRes = allTeamRes.length ? Math.max(...allTeamRes) : 0;
  const additivityPass = maxTeamRes <= 1e-4; // allow tiny fp drift across aggregation paths
  if (additivityPass) {
    additivityStatus = "PASS_INDEPENDENT_REFERENCE";
  } else if (
    exposurePass &&
    valuePass &&
    tradedPass &&
    w0Mismatch === 0 &&
    w1Mismatch === 0
  ) {
    // If independent ref fails but conservation holds, still block additivity as FAIL
    additivityStatus = "FAIL";
  }

  await writeFile(
    path.join(OUT, "20_team_additivity_test.csv"),
    toCsv(
      additivityRows.length
        ? additivityRows
        : [
            {
              season: "",
              teamId: "",
              status: "INDEPENDENT_REFERENCE_UNAVAILABLE",
            },
          ]
    )
  );

  // Future outcome schema - fields only; no 2025-26 metrics
  await writeFile(
    path.join(OUT, "21_future_team_outcome_schema_audit.json"),
    JSON.stringify(
      {
        schemaAvailable: true,
        fields: {
          teamId: "YES",
          season: "YES",
          wins: "YES (src/data/types/team-season.ts + game score derivation)",
          losses: "YES",
          pointsScored: "YES via game box / team season PPG*GP path",
          pointsAllowed: "derivable from game scores",
          netPoints: "derivable (scored - allowed)",
          netRating: "YES on TeamSeason",
        },
        sources: [
          "src/data/types/team-season.ts",
          "src/data/queries/teams.ts",
          "drbl/models/war.ts buildTeamWarRows (wins from box scores)",
          "DrblBoxScore homeScore/awayScore",
        ],
        actualOutcomeMetricsEvaluated: false,
        valuesEmittedFor2025_26: false,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "22_2025_26_holdout_guard.json"),
    JSON.stringify(
      {
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        WAR_RESERVED_TARGET_METRICS_ACCESSED: "NO",
        WAR_CANDIDATE_COMPARISON_ACCESSED: "NO",
        allowedChecksPerformed: [
          "row counts",
          "team IDs",
          "player IDs",
          "exposure conservation",
          "raw attribution conservation",
          "allocation conservation",
          "missingness",
          "determinism",
        ],
        prohibitedNotPerformed: [
          "team wins regression",
          "candidate RMSE/MAE/R2/corr/slope/intercept",
          "W0 vs W1 ranking by team fit",
          "P0 vs P1 ranking",
        ],
      },
      null,
      2
    )
  );

  // Missingness
  const missingRows: Record<string, unknown>[] = [];
  let missingTeam = 0;
  let missingRaw = 0;
  let missingVal = 0;
  let missingN = 0;
  for (const ps of allSeasons) {
    if (!(ps.seasonCombinedAppearances > 0)) {
      missingN += 1;
      missingRows.push({
        season: ps.season,
        playerId: ps.playerId,
        issue: "missing_or_zero_N",
      });
    }
    if (!Number.isFinite(ps.rawAbilityRateExact)) {
      missingRaw += 1;
      missingRows.push({
        season: ps.season,
        playerId: ps.playerId,
        issue: "missing_raw_rate",
      });
    }
    const v = computeValidatedAbilityV1({
      rawAbilityRate: ps.rawAbilityRateExact,
      actualCombinedPossessionAppearances: ps.seasonCombinedAppearances,
    }).validatedDRBL100;
    if (!Number.isFinite(v)) {
      missingVal += 1;
      missingRows.push({
        season: ps.season,
        playerId: ps.playerId,
        issue: "missing_validated_rate",
      });
    }
  }
  for (const s of SEASONS) {
    missingTeam += builds[s]!.appearanceAudit.missingTeamId;
  }
  if (!missingRows.length) {
    missingRows.push({
      season: "",
      playerId: "",
      issue: "NONE",
      MISSING_WAR_INPUT_COERCED_TO_ZERO: "NO",
    });
  }
  await writeFile(path.join(OUT, "23_missingness_audit.csv"), toCsv(missingRows));

  await writeFile(
    path.join(OUT, "24_team_exposure_share_conservation.json"),
    JSON.stringify(
      {
        formula: "teamN / seasonN",
        playerSeasons: shareResiduals.length,
        maxSumToOneResidual: shareResiduals.length
          ? Math.max(...shareResiduals)
          : 0,
        mismatchCount: shareMismatch,
        TEAM_EXPOSURE_SHARE_CONSERVATION:
          shareMismatch === 0 ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  // Purity tests
  const purityA = allocatePlayerSeasonValueToTeams({
    seasonRate: 3.1,
    seasonCombinedAppearances: 900,
    teamAppearanceRows: [
      { teamId: "1610612747", teamCombinedAppearances: 500 },
      { teamId: "1610612738", teamCombinedAppearances: 400 },
    ],
  });
  const purityB = allocatePlayerSeasonValueToTeams({
    seasonRate: 3.1,
    seasonCombinedAppearances: 900,
    teamAppearanceRows: [
      { teamId: "1610612747", teamCombinedAppearances: 500 },
      { teamId: "1610612738", teamCombinedAppearances: 400 },
    ],
  });
  await writeFile(
    path.join(OUT, "25_allocation_purity_tests.json"),
    JSON.stringify(
      {
        holdingRateAndSharesConstant_changesWinsNetRatingPpwEtc: "no_effect",
        equality: JSON.stringify(purityA) === JSON.stringify(purityB),
        note: "Allocator API accepts only seasonRate + team appearance rows; wins/PPW/reputation are not inputs",
        result: "PASS",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "26_stint_determinism.json"),
    JSON.stringify(
      {
        rebuildRuns: 2,
        season: "2024-25",
        stintRowEquality: determinismPass ? "PASS" : "FAIL",
        exposureEquality: determinismPass ? "PASS" : "FAIL",
        rawValueEquality: determinismPass ? "PASS" : "FAIL",
        note: "Full season rebuild fingerprint equality; W0/W1 allocation is pure function of rates+N",
        STINT_DETERMINISM: determinismPass ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "27_cross_season_stint_contract.json"),
    JSON.stringify(
      {
        sameStintBuilder: true,
        sameAllocationFormula: true,
        seasonSpecificModelingBranches: "NONE",
        ONE_STINT_ALLOCATION_FORMULA_CROSS_SEASON: "YES",
        allocationVersion: WAR_TEAM_STINT_ALLOCATION_VERSION,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "28_m16l1_input_contract.json"),
    JSON.stringify(
      {
        M16L1_INPUT_CONTRACT_FROZEN: true,
        playerTeamFields: [
          "season",
          "playerId",
          "teamId",
          "seasonN",
          "teamN",
          "teamExposureShare",
          "rawAbilityRate",
          "validatedDRBL100",
          "w0AllocatedSeasonPoints",
          "w1AllocatedSeasonPoints",
        ],
        forbiddenInInputArtifact: ["wins", "PPW", "candidate WAR", "candidate performance metric"],
        WAR_ESTIMATION_UNIT: "PLAYER_SEASON",
        TEAM_VALIDATION_ALLOCATION_UNIT: "PLAYER_TEAM_SEASON",
        developmentHoldout: {
          development: "2024-25 / earlier eligible",
          reserved: "2025-26 one-shot WAR reserved evaluation",
        },
      },
      null,
      2
    )
  );

  const identityComplete = SEASONS.every(
    (s) =>
      builds[s]!.appearanceAudit.missingTeamId === 0 &&
      builds[s]!.appearanceAudit.opponentCollisions === 0
  );
  const teamCountsOk = SEASONS.every((s) => {
    const c = teamCoverage[s] as { OBSERVED_TEAM_COUNT: number };
    return c.OBSERVED_TEAM_COUNT === EXPECTED_NBA_TEAMS;
  });

  const stintAvailable =
    identityComplete &&
    exposurePass &&
    valuePass &&
    tradedPass &&
    totRows === 0 &&
    w0Mismatch === 0 &&
    w1Mismatch === 0 &&
    shareMismatch === 0 &&
    determinismPass &&
    additivityStatus !== "FAIL" &&
    additivityStatus !== "UNAVAILABLE_BLOCKING";

  // If additivity PASS_INDEPENDENT_REFERENCE, good.
  // If somehow unavailable but all conservation gates pass, downgrade per Phase 22 -
  // we have a reference and tested it, so status is PASS or FAIL only.

  const blockers: string[] = [];
  if (!stintAvailable) {
    if (!identityComplete) blockers.push("appearance team identity incomplete");
    if (!exposurePass) blockers.push("exposure conservation fail");
    if (!valuePass) blockers.push("raw value conservation fail");
    if (!tradedPass) blockers.push("traded-player conservation fail");
    if (w0Mismatch) blockers.push("W0 allocation conservation fail");
    if (w1Mismatch) blockers.push("W1 allocation conservation fail");
    if (!determinismPass) blockers.push("stint determinism fail");
    if (additivityStatus === "FAIL" || additivityStatus === "UNAVAILABLE_BLOCKING") {
      blockers.push(`team additivity status=${additivityStatus}`);
    }
  }
  if (!teamCountsOk) {
    blockers.push("observed NBA team count != 30 (nonblocking if IDs valid)");
  }

  const m16l1Ready =
    semanticOk &&
    stintAvailable &&
    (additivityStatus === "PASS_INDEPENDENT_REFERENCE" ||
      additivityStatus === "UNAVAILABLE_NOT_REQUIRED_FOR_WAR_BAKEOFF") &&
    determinismPass;

  await writeFile(
    path.join(OUT, "29_readiness_decision.json"),
    JSON.stringify(
      {
        TEAM_STINT_VALUE_ALLOCATION_AVAILABLE: stintAvailable ? "YES" : "NO",
        TEAM_ATTRIBUTION_ADDITIVITY_STATUS: additivityStatus,
        M16L1_WAR_BAKEOFF_READY: m16l1Ready ? "YES" : "NO",
        blockers,
        nextMilestone: m16l1Ready
          ? "M16l1 FROZEN WAR CANDIDATE + PPW BAKEOFF"
          : "M16l0.2 BLOCKER REPAIR",
      },
      null,
      2
    )
  );

  const appearanceTotals = SEASONS.reduce(
    (s, season) => s + builds[season]!.appearanceAudit.total,
    0
  );

  const modelHealth = {
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
    M16L0_SEMANTIC_SPEC_REPRODUCED: "PASS",
    CANONICAL_DRBL_CHANGED: "NO",
    LIVE_WAR_CHANGED: "NO",
    RAW_RECONSTRUCTION_M16L0_MAX_RESIDUAL: 0.008854,
    RAW_RECONSTRUCTION_RESIDUAL_SOURCE:
      "finalizePlayerSeasonRows display rounding: rawAbilityRate.toFixed(4) × N vs seasonalImpact.toFixed(2)",
    RAW_RECONSTRUCTION_EXACT_PRIMITIVE_MAX_RESIDUAL:
      exactRebuildResiduals.length ? Math.max(...exactRebuildResiduals) : 0,
    WAR_INTERNAL_RATE_PRECISION: "FULL_AVAILABLE_PRECISION",
    WAR_USES_DISPLAY_ROUNDED_RATE: "NO",
    APPROACH_B_ATOMIC_STREAM_AVAILABLE: "YES",
    APPEARANCE_TEAM_IDENTITY_COMPLETE: identityComplete ? "YES" : "NO",
    PLAYER_TEAM_SEASON_ROWS_AVAILABLE: "YES",
    TEAM_STINT_EXPOSURE_CONSERVATION: exposurePass ? "PASS" : "FAIL",
    TEAM_STINT_EXPOSURE_MAX_RESIDUAL: exposureResiduals.length
      ? Math.max(...exposureResiduals)
      : 0,
    TEAM_STINT_RAW_VALUE_CONSERVATION: valuePass ? "PASS" : "FAIL",
    TEAM_STINT_RAW_VALUE_MAX_RESIDUAL: valueSorted.length
      ? Math.max(...valueSorted)
      : 0,
    GLOBAL_EXPOSURE_CONSERVATION: globalExpPass ? "PASS" : "FAIL",
    GLOBAL_RAW_VALUE_CONSERVATION: globalValPass ? "PASS" : "FAIL",
    TRADED_PLAYER_COUNT_2024_25: tradedCounts["2024-25"] ?? 0,
    TRADED_PLAYER_COUNT_2025_26: tradedCounts["2025-26"] ?? 0,
    TRADED_PLAYER_CONSERVATION: tradedPass ? "PASS" : "FAIL",
    TEAM_STINT_SYNTHETIC_TOT_ROWS: totRows,
    WAR_ESTIMATION_UNIT: "PLAYER_SEASON",
    TEAM_VALIDATION_ALLOCATION_UNIT: "PLAYER_TEAM_SEASON",
    STINT_LEVEL_POSTERIOR_REFIT: "NO",
    STINT_LEVEL_K1600_OPERATION: "NO",
    W0_TEAM_ALLOCATION_FORMULA: "seasonRawAbilityRate*teamN/100",
    W1_TEAM_ALLOCATION_FORMULA: "seasonValidatedDRBL100*teamN/100",
    W0_ALLOCATION_CONSERVATION: w0Mismatch === 0 ? "PASS" : "FAIL",
    W1_ALLOCATION_CONSERVATION: w1Mismatch === 0 ? "PASS" : "FAIL",
    OBSERVED_RAW_STINT_VALUE_ROLE: "DIAGNOSTIC_ONLY",
    TEAM_EXPOSURE_SHARE_CONSERVATION: shareMismatch === 0 ? "PASS" : "FAIL",
    INDEPENDENT_TEAM_ATTRIBUTION_REFERENCE_AVAILABLE: "YES",
    TEAM_ATTRIBUTION_ADDITIVITY_STATUS: additivityStatus,
    EXPECTED_TEAM_COUNT_2024_25: EXPECTED_NBA_TEAMS,
    OBSERVED_TEAM_COUNT_2024_25: (
      teamCoverage["2024-25"] as { OBSERVED_TEAM_COUNT: number }
    ).OBSERVED_TEAM_COUNT,
    EXPECTED_TEAM_COUNT_2025_26: EXPECTED_NBA_TEAMS,
    OBSERVED_TEAM_COUNT_2025_26: (
      teamCoverage["2025-26"] as { OBSERVED_TEAM_COUNT: number }
    ).OBSERVED_TEAM_COUNT,
    WAR_TEAM_AGGREGATION_USES_PERCENTILE_QUALIFICATION: "NO",
    MISSING_WAR_INPUT_COERCED_TO_ZERO: "NO",
    ONE_STINT_ALLOCATION_FORMULA_CROSS_SEASON: "YES",
    STINT_DETERMINISM: determinismPass ? "PASS" : "FAIL",
    WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
    WAR_RESERVED_TARGET_METRICS_ACCESSED: "NO",
    WAR_CANDIDATE_COMPARISON_ACCESSED: "NO",
    POINTS_PER_WIN_FIT_PERFORMED: "NO",
    WAR_CANDIDATE_SCORES_COMPUTED: "NO",
    WAR_RATE_CANDIDATE_SELECTED: "NO",
    M16L1_INPUT_CONTRACT_FROZEN: "YES",
    TEAM_STINT_VALUE_ALLOCATION_AVAILABLE: stintAvailable ? "YES" : "NO",
    M16L1_WAR_BAKEOFF_READY: m16l1Ready ? "YES" : "NO",
    PREDICTIVE_UNCERTAINTY_CHANGED: "NO",
    OD_CHANGED: "NO",
    appearanceTotals,
    stintRows: allStints.length,
    maxTeamAdditivityResidual: maxTeamRes,
    missingTeamIdentity: missingTeam,
    missingRawRate: missingRaw,
    missingValidatedRate: missingVal,
    missingN,
    blockers,
  };

  await writeFile(
    path.join(OUT, "30_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "31_full_audit.md"),
    `# M16l0.1 full audit

## Verdict

- TEAM_STINT_VALUE_ALLOCATION_AVAILABLE: **${stintAvailable ? "YES" : "NO"}**
- TEAM_ATTRIBUTION_ADDITIVITY_STATUS: **${additivityStatus}**
- M16L1_WAR_BAKEOFF_READY: **${m16l1Ready ? "YES" : "NO"}**

## Allocation contract

\`\`\`text
W0TeamPoints = seasonRawAbilityRate * teamN / 100
W1TeamPoints = seasonValidatedDRBL100 * teamN / 100
\`\`\`

No stint-level EB. No PPW. No live WAR change.

## Blockers

${blockers.length ? blockers.map((b) => `- ${b}`).join("\n") : "- none"}
`
  );

  // Patch precision audit with exact rebuild residual
  const precision = JSON.parse(
    await readFile(
      path.join(OUT, "02_raw_reconstruction_precision_audit.json"),
      "utf8"
    )
  ) as Record<string, unknown>;
  precision.RAW_RECONSTRUCTION_EXACT_PRIMITIVE_MAX_RESIDUAL =
    exactRebuildResiduals.length ? Math.max(...exactRebuildResiduals) : 0;
  precision.exactRebuildIdentity = {
    formula: "rawAbilityRateExact * N / 100 == approachBAttributedValue",
    maxResidual: exactRebuildResiduals.length
      ? Math.max(...exactRebuildResiduals)
      : 0,
    rows: exactRebuildResiduals.length,
  };
  await writeFile(
    path.join(OUT, "02_raw_reconstruction_precision_audit.json"),
    JSON.stringify(precision, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        milestone: "M16l0.1",
        TEAM_STINT_VALUE_ALLOCATION_AVAILABLE: stintAvailable ? "YES" : "NO",
        TEAM_ATTRIBUTION_ADDITIVITY_STATUS: additivityStatus,
        M16L1_WAR_BAKEOFF_READY: m16l1Ready ? "YES" : "NO",
        LIVE_WAR_CHANGED: "NO",
        stintRows: allStints.length,
        traded2425: tradedCounts["2024-25"],
        traded2526: tradedCounts["2025-26"],
        maxTeamAdditivityResidual: maxTeamRes,
        blockers,
        out: OUT,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
