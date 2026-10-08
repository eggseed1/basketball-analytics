/**
 * Player percentile category / display semantics (fixture-only).
 * Run: npm run test:player-percentile-metrics
 */
import assert from "node:assert/strict";

import {
  ADVANCED_PERCENTILE_METRIC_IDS,
  buildPlayerPercentileMetrics,
  isQualifiedPeer,
  percentileCutoffs,
  percentileFromCutoffs,
} from "../src/lib/player-percentile-metrics";
import {
  SHEET_STAT_BY_ID,
  type SheetStatId,
} from "../src/lib/player-stat-sheet-registry";
import { gradeFromPercentile } from "../src/components/players/player-percentile-panel";
import type { PlayerSeason } from "../src/data/types";

function row(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "playerId" | "playerName">
): PlayerSeason {
  return {
    playerId: partial.playerId,
    playerName: partial.playerName,
    teamId: partial.teamId ?? "den",
    teamName: partial.teamName ?? "Nuggets",
    season: partial.season ?? "2024-25",
    gamesPlayed: partial.gamesPlayed ?? 70,
    gamesStarted:
      partial.gamesStarted ?? Math.min(partial.gamesPlayed ?? 70, 70),
    minutes: partial.minutes ?? 2400,
    points: partial.points ?? 1400,
    assists: partial.assists ?? 600,
    rebounds: partial.rebounds ?? 800,
    steals: partial.steals ?? 80,
    blocks: partial.blocks ?? 50,
    turnovers: partial.turnovers ?? 200,
    fieldGoalPct: partial.fieldGoalPct ?? 0.55,
    threePointPct: partial.threePointPct ?? 0.35,
    freeThrowPct: partial.freeThrowPct ?? 0.8,
    trueShootingPct: partial.trueShootingPct,
    effectiveFieldGoalPct: partial.effectiveFieldGoalPct,
    usagePct: partial.usagePct,
    offensiveRating: partial.offensiveRating,
    defensiveRating: partial.defensiveRating,
    netRating: partial.netRating,
    darkoDpm: partial.darkoDpm,
    darkoOff: partial.darkoOff,
    darkoDef: partial.darkoDef,
    raptor: partial.raptor,
    oRaptor: partial.oRaptor,
    dRaptor: partial.dRaptor,
    winsAdded: partial.winsAdded,
    hustleDeflections: partial.hustleDeflections,
    hustleContestedShots: partial.hustleContestedShots,
    hustleScreenAssists: partial.hustleScreenAssists,
    hustleChargesDrawn: partial.hustleChargesDrawn,
    hustleLooseBallsRecovered: partial.hustleLooseBallsRecovered,
    hustleBoxOuts: partial.hustleBoxOuts,
  };
}

function main() {
  const jokic = row({
    playerId: "jokic",
    playerName: "Nikola Jokic",
    minutes: 34.8 * 70,
    turnovers: 3.7 * 70,
    assists: 10 * 70,
    usagePct: 0.302,
    trueShootingPct: 0.65,
    offensiveRating: 113.4,
    // DRtg / NET missing — must not appear
  });

  const lowMinute = row({
    playerId: "bench",
    playerName: "Bench Player",
    gamesPlayed: 50,
    minutes: 12 * 50,
    points: 200,
    assists: 50,
    rebounds: 100,
    steals: 20,
    blocks: 10,
    turnovers: 20,
    usagePct: 0.12,
    trueShootingPct: 0.52,
  });

  const peers: PlayerSeason[] = [
    jokic,
    lowMinute,
    row({
      playerId: "a",
      playerName: "A",
      minutes: 30 * 70,
      turnovers: 1.5 * 70,
      assists: 4 * 70,
      usagePct: 0.2,
      trueShootingPct: 0.55,
      offensiveRating: 110,
    }),
    row({
      playerId: "b",
      playerName: "B",
      minutes: 28 * 70,
      turnovers: 2.0 * 70,
      assists: 5 * 70,
      usagePct: 0.22,
      trueShootingPct: 0.58,
      offensiveRating: 112,
    }),
    row({
      playerId: "c",
      playerName: "C",
      minutes: 20 * 70,
      turnovers: 1.0 * 70,
      assists: 2 * 70,
      usagePct: 0.15,
      trueShootingPct: 0.5,
      offensiveRating: 105,
    }),
  ];

  const metrics = buildPlayerPercentileMetrics(
    jokic,
    [jokic],
    peers,
    peers,
    "jokic"
  );

  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));

  // Minutes / games / starts → profile with percentiles (availability context)
  assert.equal(byId.min?.category, "profile");
  assert.equal(byId.min?.interpretation, "descriptive");
  assert.equal(byId.min?.showPercentile, true);
  assert.equal(byId.min?.showGrade, false);

  // Usage → advanced (percentile OK, no skill grade)
  assert.equal(byId.usg?.category, "advanced");
  assert.equal(byId.usg?.interpretation, "role");
  assert.equal(byId.usg?.showPercentile, true);
  assert.equal(byId.usg?.showGrade, false);

  // Games / starts → profile with percentiles
  assert.equal(byId.gp?.category, "profile");
  assert.equal(byId.gp?.showPercentile, true);
  assert.equal(byId.gp?.showGrade, false);
  assert.equal(byId.gs?.category, "profile");
  assert.equal(byId.gs?.showPercentile, true);
  assert.equal(byId.gs?.showGrade, false);

  // Turnovers still have a counting row; AST/TO is the preferred rate read.
  assert.equal(byId.tov?.category, "profile");
  assert.equal(byId.tov?.interpretation, "lower_is_better");

  // Assist / turnover → advanced
  assert.equal(byId.atr?.category, "advanced");
  assert.equal(byId.atr?.interpretation, "higher_is_better");
  assert.equal(byId.atr?.showPercentile, true);
  assert.equal(byId.atr?.showGrade, true);
  assert.ok(byId.atr!.percentile > 50);

  // ORtg in advanced when present
  assert.equal(byId.ortg?.category, "advanced");
  assert.equal(byId.ortg?.showGrade, true);

  // Missing DRtg / NET omitted (not fabricated)
  assert.equal(byId.drtg, undefined);
  assert.equal(byId.net, undefined);

  // Rates fold into advanced; counting stats never do.
  for (const id of ADVANCED_PERCENTILE_METRIC_IDS) {
    if (byId[id]) assert.equal(byId[id].category, "advanced", id);
  }
  for (const id of ["min", "gp", "gs", "pts", "reb", "ast", "tov"]) {
    if (byId[id]) {
      assert.notEqual(byId[id].category, "advanced", `${id} is a counting stat`);
    }
  }
  assert.equal(
    byId.usg?.category,
    SHEET_STAT_BY_ID["usg" as SheetStatId]?.category,
    "sheet registry drives categories"
  );

  // Legitimate zero steals still ranks (higher_is_better with 0 value)
  const zeroStl = row({
    playerId: "zero",
    playerName: "Zero Steals",
    steals: 0,
    usagePct: 0.18,
    trueShootingPct: 0.5,
  });
  const zeroMetrics = buildPlayerPercentileMetrics(
    zeroStl,
    [zeroStl],
    [...peers, zeroStl],
    peers,
    "zero"
  );
  const stl = zeroMetrics.find((m) => m.id === "stl");
  assert.ok(stl);
  assert.equal(stl!.value, 0);
  assert.equal(stl!.showPercentile, true);

  // Missing usage stays missing (not zero)
  const noUsg = row({
    playerId: "nousg",
    playerName: "No Usg",
    usagePct: undefined,
    trueShootingPct: 0.5,
  });
  const noUsgMetrics = buildPlayerPercentileMetrics(
    noUsg,
    [noUsg],
    peers,
    peers,
    "nousg"
  );
  assert.equal(
    noUsgMetrics.find((m) => m.id === "usg"),
    undefined
  );

  // Peer qualification unchanged
  assert.equal(isQualifiedPeer(jokic), true);
  assert.equal(
    isQualifiedPeer(
      row({
        playerId: "short",
        playerName: "Short",
        gamesPlayed: 10,
        minutes: 200,
      })
    ),
    false
  );

  // Grade bands still work for directional metrics
  assert.equal(gradeFromPercentile(5).label, "Poor");
  assert.equal(gradeFromPercentile(95).label, "Elite");

  // Explicit DRtg when present (lower better) lands in advanced
  const withDrtg = row({
    playerId: "def",
    playerName: "Def",
    usagePct: 0.2,
    trueShootingPct: 0.55,
    defensiveRating: 105,
    netRating: 5,
    offensiveRating: 110,
  });
  const defMetrics = buildPlayerPercentileMetrics(
    withDrtg,
    [withDrtg],
    [
      withDrtg,
      row({
        playerId: "d2",
        playerName: "D2",
        usagePct: 0.2,
        trueShootingPct: 0.55,
        defensiveRating: 115,
        netRating: -2,
        offensiveRating: 108,
      }),
    ],
    [],
    "def"
  );
  assert.equal(defMetrics.find((m) => m.id === "drtg")?.category, "defense");
  assert.equal(
    defMetrics.find((m) => m.id === "drtg")?.interpretation,
    "lower_is_better"
  );
  assert.equal(defMetrics.find((m) => m.id === "net")?.category, "advanced");

  // Hustle metrics appear when season + peer pool have tracking
  const hustleFocal = row({
    playerId: "hustle",
    playerName: "Hustle Star",
    usagePct: 0.2,
    trueShootingPct: 0.55,
    hustleDeflections: 210,
    hustleContestedShots: 280,
    hustleScreenAssists: 90,
    hustleChargesDrawn: 12,
    hustleLooseBallsRecovered: 60,
    hustleBoxOuts: 140,
  });
  const hustlePeers = [
    hustleFocal,
    row({
      playerId: "h2",
      playerName: "H2",
      usagePct: 0.18,
      trueShootingPct: 0.5,
      hustleDeflections: 80,
      hustleContestedShots: 120,
      hustleScreenAssists: 30,
      hustleChargesDrawn: 2,
      hustleLooseBallsRecovered: 20,
      hustleBoxOuts: 40,
    }),
    row({
      playerId: "h3",
      playerName: "H3",
      usagePct: 0.16,
      trueShootingPct: 0.52,
      hustleDeflections: 40,
      hustleContestedShots: 90,
      hustleScreenAssists: 10,
      hustleChargesDrawn: 1,
      hustleLooseBallsRecovered: 10,
      hustleBoxOuts: 20,
    }),
  ];
  const hustleMetrics = buildPlayerPercentileMetrics(
    hustleFocal,
    [hustleFocal],
    hustlePeers,
    hustlePeers,
    "hustle"
  );
  const hustleById = Object.fromEntries(hustleMetrics.map((m) => [m.id, m]));
  assert.equal(hustleById.hustleDefl?.category, "hustle");
  assert.equal(hustleById.hustleDefl?.showPercentile, true);
  assert.ok((hustleById.hustleDefl?.percentile ?? 0) > 50);
  assert.equal(hustleById.hustleContest?.category, "hustle");
  assert.equal(hustleById.hustleBoxOut?.category, "hustle");

  // Baked cutoffs read like the exact rank, ties and float noise included.
  const tiedPool = Array.from({ length: 400 }, (_, i) => Math.floor(i / 40) / 10);
  const cutoffs = percentileCutoffs(tiedPool);
  assert.equal(cutoffs.length, 101);
  for (const v of [0, 0.1, 0.45, 0.9, 1]) {
    const exact = (tiedPool.filter((x) => x < v).length / tiedPool.length) * 100;
    assert.ok(Math.abs(percentileFromCutoffs(v, cutoffs) - exact) <= 1.5, `cutoff rank for ${v}`);
  }
  assert.equal(percentileFromCutoffs(0.1 + 0.2, cutoffs), percentileFromCutoffs(0.3, cutoffs));

  // Fast payload: view season ranks live, other seasons from baked cutoffs, never invented.
  const board = Array.from({ length: 20 }, (_, i) =>
    row({ playerId: `p${i}`, playerName: `Peer ${i}`, points: (5 + i) * 70 })
  );
  const now = row({ playerId: "focal", playerName: "Focal", points: 20 * 70 });
  const then = row({ playerId: "focal", playerName: "Focal", season: "2018-19", points: 12 * 70 });
  const older = row({ playerId: "focal", playerName: "Focal", season: "2017-18", points: 10 * 70 });
  const ptsSeries = (opts?: Parameters<typeof buildPlayerPercentileMetrics>[6]) =>
    buildPlayerPercentileMetrics(now, [older, then, now], board, [], "focal", undefined, opts).find(
      (m) => m.id === "pts"
    )?.series;
  const fastSeries = ptsSeries({
    light: true,
    seasonCutoffs: (season, id) =>
      season === "2018-19" && id === "pts" ? percentileCutoffs([4, 8, 12, 16, 20]) : undefined,
  });
  assert.ok(fastSeries?.find((p) => p.fullSeason === "2024-25")?.percentile != null);
  assert.ok(Math.abs((fastSeries?.find((p) => p.fullSeason === "2018-19")?.percentile ?? -1) - 40) <= 3);
  assert.equal(fastSeries?.find((p) => p.fullSeason === "2017-18")?.percentile, undefined);

  console.log("test-player-percentile-metrics: ok");
}

main();
