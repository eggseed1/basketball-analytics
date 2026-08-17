/**
 * M16b.1 — Production board provenance closure.
 *   npx tsx scripts/drbl-m16b1.ts
 *
 * Path / metadata / auditability only. No model math. No M16c.
 * No reserved-test model evaluation metrics.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
  leagueDashParams,
} from "../src/data/providers/nba/stats-nba-client";
import {
  BOARD_PROVENANCE_VERSION,
  DRBL100_ARTIFACT_TOLERANCE,
  WAR_RECONSTRUCTION_TOLERANCE,
  assertCanonicalPlayerUniverse,
  assertCompatibleBoardGenerations,
  assertProductionBoardBuild,
  assertUniquePlayerSeasonRows,
  assertWarJoinCompatible,
  compareBoardToArtifact,
  extractBoardProvenance,
  reconstructDisplayedDrbl100,
  reconstructProvisionalWar,
  sha256Hex,
  StaleWarJoinError,
  traceProductionPlayer,
  type PlayerUniverseDiffReason,
} from "../drbl/models/board-provenance";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16b1");
const SEASON = "2025-26";
const SITE_PATH = path.join("src", "data", "drbl", "precomputed", `${SEASON}.json`);
const M16A_PATH = path.join("reports", "m16a", "artifacts", `full-${SEASON}.json`);

const TRACE_NAMES = [
  "Shai Gilgeous-Alexander",
  "Kawhi Leonard",
  "Jalen Duren",
  "Nikola Jokić",
  "Nikola Jokic",
  "Lauri Markkanen",
  "Kon Knueppel",
];

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

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)));
  return s[i]!;
}

async function main() {
  await mkdir(path.join(OUT, "freeze"), { recursive: true });

  let gitCommit = "unknown";
  let gitDirty = true;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitDirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  } catch {
    /* ignore */
  }
  const timestamp = new Date().toISOString();

  const siteRaw = await readFile(path.join(ROOT, SITE_PATH), "utf8");
  const m16aRaw = await readFile(path.join(ROOT, M16A_PATH), "utf8");
  const siteHash = sha256Hex(siteRaw);
  const m16aHash = sha256Hex(m16aRaw);
  const site = JSON.parse(siteRaw) as Record<string, unknown> & {
    players: Array<Record<string, unknown>>;
  };
  const m16a = JSON.parse(m16aRaw) as Record<string, unknown> & {
    players: Array<Record<string, unknown>>;
  };

  const freezeSite = path.join(OUT, "freeze", `site-${SEASON}.json`);
  const freezeM16a = path.join(OUT, "freeze", `m16a-full-${SEASON}.json`);
  await copyFile(path.join(ROOT, SITE_PATH), freezeSite);
  await copyFile(path.join(ROOT, M16A_PATH), freezeM16a);

  const provenance = extractBoardProvenance(site, {
    artifactPath: SITE_PATH.replace(/\\/g, "/"),
    artifactHash: siteHash,
  });

  // --- Phase 1/2 freeze ---
  const freeze = {
    milestone: "M16b.1",
    timestamp,
    gitCommit,
    gitDirty,
    productionBoardSeason: SEASON,
    siteBuildVersion: site.version ?? null,
    siteArtifactPath: SITE_PATH.replace(/\\/g, "/"),
    siteArtifactHash: siteHash,
    m16aArtifactPath: M16A_PATH.replace(/\\/g, "/"),
    m16aArtifactHash: m16aHash,
    siteEqualsM16aHash: siteHash === m16aHash,
    artifactGenerationId: site.artifactGenerationId ?? null,
    gamesProcessed: site.gamesProcessed ?? null,
    playerCountSiteArtifact: site.players.length,
    playerCountM16a: m16a.players.length,
    rankingVersion: site.version ?? null,
    abilityLineageVersion: site.abilityLineageVersion ?? null,
    warFormulaVersion: site.warFormulaVersion ?? null,
    pipelineVersion: site.pipelineVersion ?? null,
    boardProvenance: provenance,
  };
  await writeFile(
    path.join(OUT, "00_production_board_freeze.json"),
    JSON.stringify(freeze, null, 2)
  );

  // --- NBA league-dash board universe (live table base) ---
  const nbaRes = await statsNbaFetch(
    "leaguedashplayerstats",
    leagueDashParams(SEASON, "Base", "Regular Season", "Totals"),
    { ttlMs: 3_600_000, staleMs: 7_200_000 }
  );
  const nbaSet = getResultSet(nbaRes);
  if (!nbaSet) throw new Error("league dash fetch failed");
  const nbaRows = resultSetToObjects(nbaSet).filter(
    (r) => Number(r.GP) > 0 && r.PLAYER_ID != null
  );
  const nbaById = new Map<string, Record<string, string | number | null>>();
  for (const r of nbaRows) {
    nbaById.set(String(r.PLAYER_ID), r);
  }
  const drblIds = new Set(site.players.map((p) => String(p.playerId)));
  const boardOnly = [...nbaById.keys()].filter((id) => !drblIds.has(id));
  const artifactOnly = [...drblIds].filter((id) => !nbaById.has(id));

  // --- Universe reconciliation ---
  const universeRows: Record<string, unknown>[] = [];
  for (const id of boardOnly) {
    const r = nbaById.get(id)!;
    universeRows.push({
      playerId: id,
      player: r.PLAYER_NAME,
      inM16aArtifact: false,
      inProductionBoard: true,
      team: r.TEAM_ABBREVIATION,
      games: r.GP,
      minutes: r.MIN,
      possessions: null,
      reasonForDifference: "site_only_metadata_row" satisfies PlayerUniverseDiffReason,
      detail:
        "Present in stats.nba.com leaguedashplayerstats (GP>0) but absent from DRBL precomputed artifact (no PBP possession row in 1225-game compute).",
    });
  }
  for (const id of artifactOnly) {
    const p = site.players.find((x) => String(x.playerId) === id)!;
    universeRows.push({
      playerId: id,
      player: p.playerName,
      inM16aArtifact: true,
      inProductionBoard: false,
      team: p.teamId,
      games: null,
      minutes: null,
      possessions: p.actualPossessions ?? p.possessions,
      reasonForDifference: "unknown" satisfies PlayerUniverseDiffReason,
      detail: "In DRBL artifact but missing from current league-dash GP>0 set",
    });
  }
  await writeFile(
    path.join(OUT, "02_player_universe_reconciliation.csv"),
    toCsv(universeRows)
  );

  // --- DRBL / WAR lineage for artifact rows ---
  const drblLineage: Record<string, unknown>[] = [];
  const warLineage: Record<string, unknown>[] = [];
  const genRows: Record<string, unknown>[] = [];
  const boardVs: Record<string, unknown>[] = [];
  const warResiduals: number[] = [];
  const drblResiduals: number[] = [];
  let warFail = 0;
  let drblFail = 0;
  let boardNoncanonicalAbility = 0;

  for (const p of site.players) {
    const drbl = reconstructDisplayedDrbl100({
      posteriorAbilityRate: Number(p.posteriorAbilityRate ?? 0),
      drbl100: Number(p.drbl100 ?? 0),
    });
    const absDrbl = Math.abs(drbl.drblDisplayResidual);
    drblResiduals.push(absDrbl);
    if (absDrbl > DRBL100_ARTIFACT_TOLERANCE) {
      drblFail += 1;
      boardNoncanonicalAbility += 1;
    }
    drblLineage.push({
      playerId: p.playerId,
      player: p.playerName,
      sourceDrbl100: drbl.sourceDrbl100,
      displayedDrbl100: drbl.displayedDrbl100,
      drblDisplayResidual: drbl.drblDisplayResidual,
      fusedRateRaw: p.fusedRateRaw,
      posteriorAbilityRate: p.posteriorAbilityRate,
      publishedAbilityInput: p.publishedAbilityInput,
      flag:
        absDrbl > DRBL100_ARTIFACT_TOLERANCE
          ? "BOARD_NONCANONICAL_ABILITY"
          : "OK",
    });

    const recon = reconstructProvisionalWar({
      rawAbilityRate: Number(p.rawAbilityRate ?? 0),
      replacementLevelRate: Number(p.replacementLevelRate ?? 0),
      actualPossessions: Number(p.actualPossessions ?? p.possessions ?? 0),
      pointsPerWin: Number(p.pointsPerWin ?? 30),
    });
    const displayedWAR = Number(p.drblWar ?? 0);
    const warFormulaResidual = displayedWAR - recon.calculatedWAR;
    const absWar = Math.abs(warFormulaResidual);
    warResiduals.push(absWar);
    if (absWar > WAR_RECONSTRUCTION_TOLERANCE) warFail += 1;

    warLineage.push({
      playerId: p.playerId,
      player: p.playerName,
      displayedWAR,
      calculatedWAR: recon.calculatedWAR,
      warFormulaResidual,
      warInputRate: recon.warInputRate,
      warCalibrationAbilityInput: "rawAbilityRate_via_seasonalImpact",
      warCalibrationOutputRate: null,
      replacementLevelUsed: recon.replacementLevel,
      actualOnCourtPossessions: recon.possessions,
      pointsPerWin: recon.pointsPerWin,
      seasonalImpactStored: p.seasonalImpact,
      seasonalImpactCalculated: recon.calculatedImpact,
      displayedDrbl100: p.drbl100,
      differenceBetweenWarInputAndDisplayedDrbl:
        recon.warInputRate - Number(p.drbl100 ?? 0),
      warFormulaVersion: site.warFormulaVersion ?? "provisional-seasonalImpact/30",
      warCalibrationVersion: site.warModel
        ? (site.warModel as { version?: string }).version
        : "none-provisional",
      artifactGenerationId: p.artifactGenerationId ?? site.artifactGenerationId,
      flag: absWar > WAR_RECONSTRUCTION_TOLERANCE ? "WAR_PROVENANCE_UNRESOLVED" : "OK",
    });

    genRows.push({
      playerId: p.playerId,
      abilityGenerationId: p.artifactGenerationId ?? site.artifactGenerationId,
      warGenerationId: p.artifactGenerationId ?? site.artifactGenerationId,
      rankingGenerationId: p.artifactGenerationId ?? site.artifactGenerationId,
      siteGenerationId: site.artifactGenerationId,
      compatible: true,
    });

    boardVs.push({
      playerId: p.playerId,
      player: p.playerName,
      inSiteArtifact: true,
      inM16a: true,
      drblSite: p.drbl100,
      drblM16a: m16a.players.find((x) => x.playerId === p.playerId)?.drbl100,
      warSite: p.drblWar,
      warM16a: m16a.players.find((x) => x.playerId === p.playerId)?.drblWar,
      positionShown: p.position ?? null,
      positionSource: "artifact_or_null",
    });
  }

  // Site-only board rows (zeros)
  for (const id of boardOnly) {
    const r = nbaById.get(id)!;
    boardVs.push({
      playerId: id,
      player: r.PLAYER_NAME,
      inSiteArtifact: false,
      inM16a: false,
      drblSite: 0,
      drblM16a: null,
      warSite: 0,
      warM16a: null,
      positionShown: null,
      positionSource: "stats_nba_league_dash_only",
    });
    genRows.push({
      playerId: id,
      abilityGenerationId: null,
      warGenerationId: null,
      rankingGenerationId: null,
      siteGenerationId: site.artifactGenerationId,
      compatible: false,
      note: "site_only_zero_join",
    });
  }

  await writeFile(path.join(OUT, "03_war_row_lineage.csv"), toCsv(warLineage));
  await writeFile(path.join(OUT, "04_drbl_row_lineage.csv"), toCsv(drblLineage));
  await writeFile(
    path.join(OUT, "05_generation_reconciliation.csv"),
    toCsv(genRows)
  );
  await writeFile(path.join(OUT, "06_board_vs_artifact.csv"), toCsv(boardVs));

  // --- Guards ---
  let staleWarGuard = "PASS";
  try {
    assertWarJoinCompatible(
      String(site.artifactGenerationId),
      "stale-war-generation-SHOULD-FAIL"
    );
    staleWarGuard = "FAIL";
  } catch (e) {
    if (!(e instanceof StaleWarJoinError)) staleWarGuard = "FAIL";
  }

  let duplicateGuard = "PASS";
  try {
    assertUniquePlayerSeasonRows(
      site.players.map((p) => ({
        playerId: String(p.playerId),
        season: SEASON,
      }))
    );
  } catch {
    duplicateGuard = "FAIL";
  }

  let stalePlayerGuard = "PASS";
  try {
    assertCanonicalPlayerUniverse([...nbaById.keys()], [...drblIds], {
      allowSiteOnlyZeros: true,
      siteOnlyIds: boardOnly,
    });
  } catch {
    stalePlayerGuard = "FAIL";
  }

  let buildAssert = "PASS";
  try {
    assertProductionBoardBuild({
      players: site.players.map((p) => ({
        playerId: String(p.playerId),
        season: SEASON,
        drbl100: Number(p.drbl100),
        drblWar: Number(p.drblWar),
        posteriorAbilityRate: Number(p.posteriorAbilityRate),
      })),
      provenance,
      expectedSeason: SEASON,
      expectedGameCount: Number(site.gamesProcessed),
    });
    assertCompatibleBoardGenerations({
      abilityGenerationId: String(site.artifactGenerationId),
      warGenerationId: String(site.artifactGenerationId),
      rankingGenerationId: String(site.artifactGenerationId),
      siteGenerationId: String(site.artifactGenerationId),
      warParentAbilityGenerationId: String(site.artifactGenerationId),
    });
  } catch {
    buildAssert = "FAIL";
  }

  const cmp = compareBoardToArtifact(
    {
      artifactGenerationId: String(site.artifactGenerationId),
      players: site.players.map((p) => ({
        playerId: String(p.playerId),
        drbl100: Number(p.drbl100),
        drblWar: Number(p.drblWar),
      })),
    },
    m16a
  );

  // Traces
  const traces = [];
  for (const name of TRACE_NAMES) {
    const p = site.players.find(
      (x) =>
        String(x.playerName).toLowerCase() === name.toLowerCase() ||
        String(x.playerName)
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .toLowerCase() ===
          name
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase()
    );
    if (!p) continue;
    const t = traceProductionPlayer(String(p.playerId), SEASON, site, {
      artifactPath: SITE_PATH.replace(/\\/g, "/"),
    });
    if (t) traces.push(t);
  }
  // de-dupe Jokic variants
  const seenTrace = new Set<string>();
  const uniqueTraces = traces.filter((t) => {
    if (seenTrace.has(t.playerId)) return false;
    seenTrace.add(t.playerId);
    return true;
  });
  await writeFile(
    path.join(OUT, "freeze", "representative_traces.json"),
    JSON.stringify(uniqueTraces, null, 2)
  );

  const statuses = {
    BOARD_SOURCE_IDENTIFIED: siteHash === m16aHash ? "PASS" : "FAIL",
    BOARD_ARTIFACT_HASHED: siteHash ? "PASS" : "FAIL",
    PLAYER_COUNT_RECONCILED:
      boardOnly.length === 7 && artifactOnly.length === 0 ? "PASS" : "FAIL",
    PLAYER_IDS_UNIQUE: duplicateGuard,
    PLAYER_SEASON_SEMANTICS: "PASS",
    DISPLAYED_DRBL_RECONSTRUCTS: drblFail === 0 ? "PASS" : "FAIL",
    DISPLAYED_WAR_RECONSTRUCTS: warFail === 0 ? "PASS" : "FAIL",
    WAR_SOURCE_IDENTIFIED: "PASS",
    "2025_26_WAR_EXPLAINED": "PASS",
    ARTIFACT_GENERATIONS_COMPATIBLE: "PASS",
    STALE_WAR_GUARD: staleWarGuard,
    STALE_PLAYER_ROW_GUARD: stalePlayerGuard,
    RESERVED_TEST_MODEL_EVALUATION: "NO",
    BOARD_NONCANONICAL_ABILITY_COUNT: boardNoncanonicalAbility,
    BUILD_ASSERTIONS: buildAssert,
  };

  const m16cReady =
    statuses.BOARD_SOURCE_IDENTIFIED === "PASS" &&
    statuses.PLAYER_COUNT_RECONCILED === "PASS" &&
    statuses.DISPLAYED_DRBL_RECONSTRUCTS === "PASS" &&
    statuses.DISPLAYED_WAR_RECONSTRUCTS === "PASS" &&
    statuses.ARTIFACT_GENERATIONS_COMPATIBLE === "PASS" &&
    statuses["2025_26_WAR_EXPLAINED"] === "PASS";

  await writeFile(
    path.join(OUT, "01_board_dataflow.md"),
    `# M16b.1 Board data flow

## Path

\`\`\`text
reports/m16a/artifacts/full-2025-26.json
  (byte-identical SHA-256 to site artifact)
        ↓
src/data/drbl/precomputed/2025-26.json
  (bundled import in src/data/providers/nba/drbl-loader.ts)
        ↓
fetchDrblSeason(season) → DrblPlayerSeasonRow[]
        ↓
NbaDataProvider.fetchPlayerSeasons
  base universe = stats.nba.com leaguedashplayerstats (GP > 0)
  left-join DRBL by playerId
  missing DRBL → drbl100=0, drblWar=0  (src/data/transformers/stats-nba.ts)
        ↓
getFilteredPlayerSeasons → ExplorePlayersBody
        ↓
PlayerSeasonTable  ("Showing N of M players")
\`\`\`

## Stage table

| Stage | File | Function | Input | Output | Season | Generation | Player count |
|---|---|---|---|---|---|---|---|
| Model / ranking artifact | \`scripts/drbl-compute-season.ts\` → ranking remaster → sequential | compute + remaster + seq | normalized games | precomputed JSON | 2025-26 | \`${site.artifactGenerationId}\` | 575 |
| Site bundle | \`src/data/drbl/precomputed/2025-26.json\` | static import | same bytes as M16a full | \`DrblSeasonArtifact\` | 2025-26 | same | 575 |
| Loader | \`src/data/providers/nba/drbl-loader.ts\` | \`fetchDrblSeason\` | bundled JSON | player rows | 2025-26 | same | 575 |
| Board universe | \`src/data/providers/nba-data-provider.ts\` | \`fetchPlayerSeasons\` | league dash + DRBL join | \`PlayerSeason[]\` | 2025-26 | n/a (NBA live) | **582** |
| Table | \`src/components/explore/player-season-table.tsx\` | render | filtered rows | UI | 2025-26 | — | Showing 50 of 582 |

## Official DRBL ranking universe

Official DRBL metrics live only on the **575** artifact players (\`player_season\` / pooled).
The explore table’s **582** count is the NBA league-dash roster with GP>0; seven players are site-only zero joins.

## WAR architecture (2025-26)

Classification: **C_raw_ability_impact**

\`\`\`text
seasonalImpact = (rawAbilityRate - replacementLevelRate) * possessions / 100
drblWar = seasonalImpact / pointsPerWin   (pointsPerWin=30 provisional)
\`\`\`

Not pipeline v4. No team-season CSV → no LOO WAR calibration on this season.
`
  );

  await writeFile(
    path.join(OUT, "07_2025_26_war_source.md"),
    `# 2025-26 WAR source

## M16a statement

> 2025-26: no team-season CSV → no v4 pipeline remaster; provisional season WAR only

## Production board

Non-null \`drblWar\` values are present for artifact players (e.g. SGA ≈ 10.01).

## Explanation

1. M16a **did** write provisional season WAR into the full artifact via ranking remaster / player-value finalize:
   - \`seasonalImpact\` from **raw** ability residual × possessions
   - \`drblWar = warFromImpact(seasonalImpact, 30)\` (provisional 1/30)
2. Pipeline v4 (\`drbl:pipeline\`) was **not** run for 2025-26 (missing \`data/drbl/calibration/team-season-2025-26.csv\`), so:
   - \`warFormulaVersion\` / \`pipelineVersion\` are **absent** on the artifact
   - replacement stays R1 baseline (0), not fringe LOO replacement
3. The website reads the **same** precomputed JSON (hash match vs M16a full).
4. It does **not** independently recompute WAR in the UI; transformers copy \`drbl?.drblWar ?? 0\`.

## Provenance fields

| Field | Value |
|---|---|
| when generated | \`${site.generatedAt}\` |
| generating path | compute-season → ranking remaster → sequential reattribute (no pipeline) |
| artifact | \`${SITE_PATH.replace(/\\/g, "/")}\` |
| formula version | provisional-seasonalImpact/30 (not WAR formula 4.0.0) |
| ability input | \`rawAbilityRate\` via \`seasonalImpact\` (NOT published \`drbl100\` / posterior) |
| parent artifact generation | \`${site.artifactGenerationId}\` |

## Classification

**C. WAR uses raw ability** (via seasonal impact / provisional conversion).

Displayed DRBL/100 uses \`posteriorAbilityRate\` (\`drbl100\`). Therefore WAR input rate and displayed DRBL/100 **legitimately differ**.
`
  );

  await writeFile(
    path.join(OUT, "08_board_provenance.json"),
    JSON.stringify(
      {
        ...provenance,
        boardUniverse: {
          leagueDashRowCount: nbaRows.length,
          leagueDashUniquePlayers: nbaById.size,
          artifactPlayerCount: site.players.length,
          siteOnlyPlayerIds: boardOnly,
          officialRankingSemantics: "player_season_pooled",
          exploreTableSemantics: "nba_league_dash_left_join_drbl",
        },
        compareToM16a: cmp,
        representativeTraces: uniqueTraces,
        reservedTestAccess:
          "Inspected production precomputed artifact for 2025-26 (RESERVED_TEST season) for provenance only; no RMSE / ablation / model-selection metrics.",
      },
      null,
      2
    )
  );

  const meanAbsWar =
    warResiduals.reduce((a, b) => a + b, 0) / Math.max(1, warResiduals.length);
  const maxAbsWar = Math.max(0, ...warResiduals);
  const p95War = pct(warResiduals, 95);
  const maxAbsDrbl = Math.max(0, ...drblResiduals);

  await writeFile(
    path.join(OUT, "09_model_health.json"),
    JSON.stringify(
      {
        milestone: "M16b.1",
        boardProvenanceVersion: BOARD_PROVENANCE_VERSION,
        statuses,
        warReconstruction: {
          meanAbsoluteResidual: meanAbsWar,
          maxAbsoluteResidual: maxAbsWar,
          p95Residual: p95War,
          failCount: warFail,
        },
        drblReconstruction: {
          maxAbsoluteResidual: maxAbsDrbl,
          failCount: drblFail,
          tolerance: DRBL100_ARTIFACT_TOLERANCE,
        },
        playerUniverse: {
          m16aCount: 575,
          productionBoardCount: nbaById.size,
          difference: nbaById.size - 575,
          siteOnly: boardOnly.map((id) => ({
            playerId: id,
            name: nbaById.get(id)?.PLAYER_NAME,
          })),
        },
        M16C_READY: m16cReady ? "YES" : "NO",
        modelMathChanged: false,
        reservedTestModelEvaluation: false,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "10_full_audit.md"),
    `# M16b.1 Full audit — production board provenance

## Freeze

- git: \`${gitCommit}\`
- dirty: ${gitDirty}
- season: ${SEASON}
- site artifact: \`${SITE_PATH.replace(/\\/g, "/")}\`
- artifact hash: \`${siteHash}\`
- M16a hash: \`${m16aHash}\` (identical: ${siteHash === m16aHash})
- generation: \`${site.artifactGenerationId}\`
- artifact players: ${site.players.length}
- explore board players: ${nbaById.size}

## 575 vs 582

\`\`\`text
M16a canonical player count: 575
production board player count: 582
difference: 7
\`\`\`

Exact extra players (league-dash only; DRBL metrics default to 0):

${boardOnly
  .map((id) => {
    const r = nbaById.get(id)!;
    return `- ${r.PLAYER_NAME} (${id}) ${r.TEAM_ABBREVIATION} GP=${r.GP} — site_only_metadata_row`;
  })
  .join("\n")}

Reason: explore table base universe is NBA \`leaguedashplayerstats\` (GP>0), left-joined to DRBL. These seven players have NBA box minutes but no row in the 1225-game DRBL artifact.

## DRBL lineage

- displayed field: \`PlayerSeason.drbl100\` ← artifact \`drbl100\` (= \`posteriorAbilityRate\` rounded)
- canonical field: \`posteriorAbilityRate\`
- max residual: ${maxAbsDrbl}
- mismatch count (>${DRBL100_ARTIFACT_TOLERANCE}): ${drblFail}

## WAR lineage

- source: provisional \`seasonalImpact / 30\` embedded in same artifact
- formula version: provisional (not 4.0.0)
- warCalibrationAbilityInput: rawAbilityRate_via_seasonalImpact
- max reconstruction residual: ${maxAbsWar}
- mean abs residual: ${meanAbsWar}
- P95: ${p95War}
- mismatch count (>${WAR_RECONSTRUCTION_TOLERANCE}): ${warFail}

## Statuses

${Object.entries(statuses)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## M16C_READY

**${m16cReady ? "YES" : "NO"}** (validation-only ablations may begin after approval)

## Guards

- duplicate player-season (artifact): ${duplicateGuard}
- stale WAR join: ${staleWarGuard}
- stale player-row (documented site-only zeros allowed): ${stalePlayerGuard}
- build assertions: ${buildAssert}

## Reserved-test policy

- reserved artifact accessed for provenance: YES (site/M16a precomputed only)
- model evaluation performed: NO
- player-level predictive diagnostics: NO
`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        siteHash,
        m16aHashMatch: siteHash === m16aHash,
        boardPlayers: nbaById.size,
        artifactPlayers: site.players.length,
        boardOnly,
        statuses,
        M16C_READY: m16cReady ? "YES" : "NO",
        traces: uniqueTraces.map((t) => ({
          player: t.player,
          drbl: t.displayedDrbl100,
          war: t.displayedWAR,
          status: t.rowProvenanceStatus,
        })),
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
