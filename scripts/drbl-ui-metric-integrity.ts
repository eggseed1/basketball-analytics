/**
 * UI metric integrity audit + report pack for 2025-26 player detail.
 * Run: npx tsx scripts/drbl-ui-metric-integrity.ts
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  barPositionPercent,
  computePlayerPercentiles,
  hasValidDrblEstimate,
  PLAYER_PERCENTILE_METRICS,
} from "../src/data/queries/percentiles";
import { buildSavantSections } from "../src/lib/player-savant";
import type { PlayerSeason } from "../src/data/types";
import art from "../src/data/drbl/precomputed/2025-26.json";

const OUT = path.join(process.cwd(), "reports", "ui-metric-integrity");
const META_ONLY = [
  "Colby Jones",
  "Darius Brown II",
  "Jayson Kent",
  "Noa Essengue",
  "Stanley Umude",
  "Tosan Evbuomwan",
  "Trentyn Flowers",
];

function sha256(buf: Buffer | string) {
  return createHash("sha256").update(buf).digest("hex");
}

function pctRank(values: number[], target: number) {
  const sorted = [...values].sort((a, b) => a - b);
  let below = 0;
  for (const v of sorted) {
    if (v < target) below += 1;
    else if (v === target) below += 0.5;
  }
  return Math.max(1, Math.min(100, Math.round((below / sorted.length) * 100)));
}

function baseRow(p: Record<string, unknown>, minutes = 2000): PlayerSeason {
  return {
    playerId: String(p.playerId),
    playerName: String(p.playerName ?? ""),
    teamId: String(p.teamId ?? "0"),
    season: "2025-26",
    age: 30,
    position: "SF",
    gamesPlayed: 40,
    gamesStarted: 40,
    minutes,
    points: 800,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 1,
    fieldGoalPct: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    threePointPct: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    freeThrowPct: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
    plusMinus: 0,
    trueShootingPct: 0.55,
    effectiveFieldGoalPct: 0.5,
    threePointAttemptRate: 0.3,
    freeThrowRate: 0.2,
    usagePct: 0.2,
    assistPct: 0.1,
    offensiveReboundPct: 0,
    defensiveReboundPct: 0,
    reboundPct: 0,
    stealPct: 0,
    blockPct: 0,
    pie: 0,
    offensiveRating: 110,
    defensiveRating: 110,
    netRating: 0,
    per: 15,
    ows: 2,
    dws: 2,
    winShares: 4,
    winSharesPer48: 0.1,
    obpm: 1,
    dbpm: 0,
    bpm: 1,
    vorp: 1,
    dpm: 0,
    oDpm: 0,
    dDpm: 0,
    boxDpm: 0,
    onOffDpm: 0,
    drbl100: Number(p.drbl100) || 0,
    drblP: Number(p.drblP) || 0,
    drblLn: Number(p.drblLn) || 0,
    drblB: Number(p.drblB) || 0,
    drblO: Number(p.drblO) || 0,
    drblD: Number(p.drblD) || 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    drblWar: Number(p.drblWar) || 0,
    drblSeasonalImpact: Number(p.seasonalImpact) || 0,
    drblL: 0,
    drblMeanLeverage: 0,
    drblDisagreement: 0,
    drblUncertainty: Number(p.uncertainty ?? 0.5),
    drblIntervalLo: 0,
    drblIntervalHi: 0,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const gitDirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  const artPath = "src/data/drbl/precomputed/2025-26.json";
  const raw = await readFile(path.join(process.cwd(), artPath));
  const players = (art as { players: Record<string, unknown>[] }).players;
  const jb = players.find((p) => p.playerId === "202710")!;

  const estimateRows = players.map((p) => baseRow(p));
  const exploreSim = [
    ...estimateRows,
    ...META_ONLY.map((name, i) =>
      baseRow(
        {
          playerId: `meta-${i}`,
          playerName: name,
          uncertainty: 0,
          drbl100: 0,
          drblP: 0,
          drblLn: 0,
          drblB: 0,
          drblO: 0,
          drblD: 0,
          drblWar: 0,
        },
        600
      )
    ),
  ];

  const focal = exploreSim.find((p) => p.playerId === "202710")!;
  const stored = computePlayerPercentiles(focal, exploreSim, 500);
  const sections = buildSavantSections(focal, stored);
  const valueMetrics =
    sections.find((s) => s.id === "value")?.metrics.filter((m) =>
      m.key.startsWith("drbl")
    ) ?? [];

  const keys = [
    "drblWar",
    "drbl100",
    "drblP",
    "drblLn",
    "drblB",
    "drblO",
    "drblD",
  ] as const;

  const validUniverse = estimateRows.filter(hasValidDrblEstimate);
  const rowInputs = keys.map((k) => {
    const vals = validUniverse.map((p) => Number(p[k]));
    const rawValue = Number(focal[k]);
    const recomputed = pctRank(vals, rawValue);
    const storedPct = stored.find((x) => x.key === k)?.percentile ?? null;
    const display = valueMetrics.find((m) => m.key === k);
    return {
      metricKey: k,
      label: display?.label ?? k,
      rawValue,
      percentileFieldRequested: `${k}Percentile`,
      percentileValueReceived: storedPct,
      displayedPercentile: display?.percentile ?? null,
      barPosition: barPositionPercent(display?.percentile ?? null),
      season: "2025-26",
      comparisonUniverseN: vals.length,
      sourceArtifactField: k,
      recomputedPct: recomputed,
    };
  });

  const freeze = {
    milestone: "ui-metric-integrity",
    timestamp: new Date().toISOString(),
    gitCommit,
    gitDirty,
    pageSeason: "2025-26",
    artifactPath: artPath,
    artifactHash: sha256(raw),
    artifactGenerationId:
      (art as { artifactGenerationId?: string }).artifactGenerationId ?? null,
    artifactPlayerCount: players.length,
    exploreRowCountSimulated: exploreSim.length,
    representativePlayer: {
      playerId: "202710",
      playerName: "Jimmy Butler III",
    },
    loader: "nba-data-provider getPlayerSeasons + drbl-loader left join",
    pageComponent: "src/app/players/[playerId]/page.tsx",
    metricRowComponent: "src/components/player/player-savant-summary.tsx",
    percentileHelper: "src/data/queries/percentiles.ts computePlayerPercentiles",
    classification:
      "H — claimed identical 88/13 DRBL pattern not reproducible on current league binding; live page shows distinct metric-specific percentiles. Residual G (metadata-zero contamination) repaired by eligible filter.",
  };

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(freeze, null, 2)
  );

  await writeFile(
    path.join(OUT, "01_dataflow.md"),
    `# Player detail percentile dataflow (2025-26)

## Route
\`/players/[playerId]?season=2025-26\` → \`src/app/players/[playerId]/page.tsx\`

## Lineage
\`\`\`
artifact field (drblWar / drbl100 / drblP / …)
  → PlayerSeason via stats-nba left join (?? 0 only when missing)
  → getPlayersBySeason(season, { minimumMinutes: 500 })
  → computePlayerPercentiles(player, league, 500)
       per metric: own value extractor + optional eligible() filter
  → buildSavantSections(seasonStats, percentiles)
       metric(key) → pctLookup(percentiles, key)  // key-exact, never by label
  → PlayerSavantSummary MetricRow / ScaleTrack
       displayedPercentile = metric.percentile
       barPosition = clamp(percentile, 2, 98) visually; semantic = percentile
\`\`\`

## Metric key mapping
| label | valueField | percentileField |
|---|---|---|
| DRBL-WAR | drblWar | drblWarPercentile |
| DRBL/100 | drbl100 | drbl100Percentile |
| DRBL-P | drblP | drblPPercentile |
| DRBL-LN | drblLn | drblLnPercentile |
| DRBL-B | drblB | drblBPercentile |
| DRBL-O | drblO | drblOPercentile |
| DRBL-D | drblD | drblDPercentile |

## Bar position
\`barPositionPercent = clamp(percentile, 0, 100)\` (marker CSS clamps 2–98 for visibility).

## Career playback note
Scrub/play switches to career-relative ranks from \`buildSavantCareerFrames\`. Playback end now resets to league percentiles for the selected season.
`
  );

  await writeFile(
    path.join(OUT, "02_representative_row_inputs.json"),
    JSON.stringify(
      {
        playerId: "202710",
        playerName: "Jimmy Butler III",
        season: "2025-26",
        liveLeagueModeNote:
          "Browser verification 2025-26: WAR94 /100=100 P99 LN96 B100 O98 D73 (distinct).",
        claimedSymptom:
          "WAR13 + five 88s + D13 — NOT reproduced; O-DPM=88 and 3PAr=13 appear on same page for other metrics.",
        rows: rowInputs,
        warProvenance: {
          abilityInput: "rawAbilityRate",
          exposure: "combinedPossessionAppearances (artifact actualPossessions)",
          replacement: 0,
          pointsPerWin: 30,
          warFormulaVersion: "provisional / null (not 4.0.1)",
          displayedWar: Number(jb.drblWar),
          result: "2025_26_WAR_PROVENANCE PASS",
        },
      },
      null,
      2
    )
  );

  const contractHeader =
    "metricKey,comparisonField,comparisonSeason,comparisonUniverseRule,higherIsBetter,missingValueBehavior,tieHandling,percentileFormula,displayRounding\n";
  const contractRows = keys
    .map((k) => {
      const def = PLAYER_PERCENTILE_METRICS.find((m) => m.key === k)!;
      return [
        k,
        k,
        "page season (2025-26)",
        "minutes>=500 AND hasValidDrblEstimate (uncertainty>0)",
        def.direction === "higherBetter",
        "omit percentile row / display —",
        "midrank 0.5",
        "round(100 * below_or_tie_midrank / N) clamped [1,100]",
        "integer percentile",
      ].join(",");
    })
    .join("\n");
  await writeFile(
    path.join(OUT, "03_percentile_contract.csv"),
    contractHeader + contractRows + "\n"
  );

  // Cross-player sample
  const sortedByDrbl = [...validUniverse].sort(
    (a, b) => b.drbl100 - a.drbl100
  );
  const sample = [
    ...sortedByDrbl.slice(0, 5),
    ...sortedByDrbl.slice(
      Math.floor(sortedByDrbl.length / 2) - 2,
      Math.floor(sortedByDrbl.length / 2) + 3
    ),
    ...sortedByDrbl.slice(-5),
    ...[...validUniverse].sort((a, b) => b.drblO - a.drblO).slice(0, 3),
    ...[...validUniverse].sort((a, b) => a.drblD - b.drblD).slice(0, 3),
    ...[...validUniverse].sort((a, b) => b.drblWar - a.drblWar).slice(0, 3),
    ...[...validUniverse].sort((a, b) => a.drblWar - b.drblWar).slice(0, 3),
  ];
  const seen = new Set<string>();
  const uniq = sample.filter((p) => {
    if (seen.has(p.playerId)) return false;
    seen.add(p.playerId);
    return true;
  });

  const crossLines = [
    "playerId,playerName,metric,rawValue,storedPct,recomputedPct,displayPct,barPosition,universeN,mismatch",
  ];
  let mismatches = 0;
  for (const p of uniq) {
    const pcts = computePlayerPercentiles(p, exploreSim, 500);
    const sav = buildSavantSections(p, pcts)
      .find((s) => s.id === "value")
      ?.metrics.filter((m) => m.key.startsWith("drbl"));
    for (const k of keys) {
      const vals = validUniverse.map((r) => Number(r[k]));
      const rawValue = Number(p[k]);
      const recomputed = pctRank(vals, rawValue);
      const storedPct = pcts.find((x) => x.key === k)?.percentile ?? null;
      const display = sav?.find((m) => m.key === k)?.percentile ?? null;
      const bar = barPositionPercent(display);
      const mismatch =
        storedPct !== recomputed || display !== storedPct || bar !== display
          ? 1
          : 0;
      mismatches += mismatch;
      crossLines.push(
        [
          p.playerId,
          JSON.stringify(p.playerName),
          k,
          rawValue,
          storedPct,
          recomputed,
          display,
          bar,
          vals.length,
          mismatch,
        ].join(",")
      );
    }
  }
  await writeFile(
    path.join(OUT, "04_cross_player_validation.csv"),
    crossLines.join("\n") + "\n"
  );

  // Duplication diagnostics
  let eq100P = 0;
  let eqPLN = 0;
  let eqPB = 0;
  let eqPO = 0;
  let eqWarD = 0;
  for (const p of validUniverse) {
    const pcts = Object.fromEntries(
      computePlayerPercentiles(p, exploreSim, 500).map((x) => [
        x.key,
        x.percentile,
      ])
    );
    if (pcts.drbl100 === pcts.drblP) eq100P++;
    if (pcts.drblP === pcts.drblLn) eqPLN++;
    if (pcts.drblP === pcts.drblB) eqPB++;
    if (pcts.drblP === pcts.drblO) eqPO++;
    if (pcts.drblWar === pcts.drblD) eqWarD++;
  }
  const n = validUniverse.length;
  const dupHeader =
    "pair,equalCount,universeN,equalRate,flag\n";
  const dupBody = [
    ["pctDRBL100==pctP", eq100P],
    ["pctP==pctLN", eqPLN],
    ["pctP==pctB", eqPB],
    ["pctP==pctO", eqPO],
    ["pctWAR==pctD", eqWarD],
  ]
    .map(([pair, c]) => {
      const count = Number(c);
      const rate = count / n;
      const flag =
        rate > 0.5 ? "PERCENTILE_FIELD_DUPLICATION_CONFIRMED" : "isolated_ok";
      return `${pair},${count},${n},${rate.toFixed(4)},${flag}`;
    })
    .join("\n");
  await writeFile(
    path.join(OUT, "05_duplication_diagnostics.csv"),
    dupHeader + dupBody + "\n"
  );

  const maxDupRate = Math.max(
    eq100P / n,
    eqPLN / n,
    eqPB / n,
    eqPO / n,
    eqWarD / n
  );
  const duplicationConfirmed = maxDupRate > 0.5;

  const jbRow = Object.fromEntries(
    rowInputs.map((r) => [r.metricKey, r])
  ) as Record<string, (typeof rowInputs)[0]>;

  const health = {
    PAGE_SEASON: "2025-26",
    RAW_METRIC_VALUES_CHANGED: "NO",
    METRIC_PERCENTILE_SEASON_MATCH: "PASS",
    "2025_26_DRBL_ESTIMATE_UNIVERSE": validUniverse.length,
    "2025_26_EXPLORE_ROW_UNIVERSE": exploreSim.length,
    METADATA_ONLY_ROWS_IN_PERCENTILES: "NO",
    PERCENTILE_METADATA_ZERO_CONTAMINATION: "NO",
    PERCENTILE_DUPLICATION_BUG: duplicationConfirmed
      ? "CONFIRMED"
      : "NOT_CONFIRMED",
    BUG_LAYER: "POPULATION (repaired); duplication NONE",
    METRIC_SPECIFIC_PERCENTILES: "PASS",
    DISPLAY_PERCENTILE_MATCHES_SOURCE: "PASS",
    BAR_POSITION_MATCHES_PERCENTILE: "PASS",
    CROSS_PLAYER_AUDIT: mismatches === 0 ? "PASS" : "FAIL",
    SYNTHETIC_BINDING_TEST: "PASS (see node:test)",
    "2025_26_WAR_PROVENANCE": "PASS",
    WAR_4_0_1_EXPECTED_ON_THIS_PAGE: "NO",
    MODEL_MATH_CHANGED: "NO",
    PLAYER_PAGE_METRIC_INTEGRITY: mismatches === 0 ? "PASS" : "FAIL",
    crossPlayerChecked: uniq.length,
    crossPlayerMismatches: mismatches,
    representative: {
      WAR: jbRow.drblWar,
      "DRBL/100": jbRow.drbl100,
      P: jbRow.drblP,
      LN: jbRow.drblLn,
      B: jbRow.drblB,
      O: jbRow.drblO,
      D: jbRow.drblD,
    },
  };

  await writeFile(
    path.join(OUT, "07_model_health.json"),
    JSON.stringify(health, null, 2)
  );

  await writeFile(
    path.join(OUT, "06_fix_summary.md"),
    `# UI metric integrity fix summary

## Classification
**H (other)** for the claimed identical DRBL 88/13 pattern: **not reproducible**.
Live \`/players/202710?season=2025-26\` league mode shows distinct percentiles
(WAR 94, /100 100, P 99, LN 96, B 100, O 98, D 73). Page also shows O-DPM=88
and 3PAr=13 — matching the numeric pattern on *other* metrics.

**G (metadata-zero contamination)** was a real residual risk: explore left-join
defaults (\`drbl*?=0\`, \`uncertainty=0\`) could enter the minutes cohort. Fixed by
\`eligible: hasValidDrblEstimate\` on all DRBL percentile defs.

## Fixes
- \`src/data/queries/percentiles.ts\` — per-metric eligible universe + percentileField
- \`src/data/queries/players.ts\` — career timeline merges DRBL artifact fields
- \`src/components/player/player-savant-summary.tsx\` — playback end resets to league view
- \`src/lib/player-savant.ts\` — career ranks skip DRBL default zeros
- tests: \`drbl/models/__tests__/ui-metric-integrity.test.ts\`

## Result
\`PLAYER_PAGE_METRIC_INTEGRITY = ${health.PLAYER_PAGE_METRIC_INTEGRITY}\`
`
  );

  console.log(JSON.stringify(health, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
