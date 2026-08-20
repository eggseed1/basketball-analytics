/**
 * Player percentile category / display semantics (fixture-only).
 * Run: npm run test:player-percentile-metrics
 */
import assert from "node:assert/strict";

import {
  ADVANCED_PERCENTILE_METRIC_IDS,
  buildPlayerPercentileMetrics,
  isQualifiedPeer,
} from "../src/lib/player-percentile-metrics";
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
    lebron: partial.lebron,
    oLebron: partial.oLebron,
    dLebron: partial.dLebron,
    winsAdded: partial.winsAdded,
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
    // DRtg / NET missing - must not appear
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

  // Minutes / games live on Statistics, not the ranking card
  assert.equal(byId.min, undefined);
  assert.equal(byId.gp, undefined);
  assert.equal(byId.pts, undefined);
  assert.equal(byId.stl, undefined);

  // Usage → role (percentile OK, no skill grade)
  assert.equal(byId.usg?.category, "role");
  assert.equal(byId.usg?.interpretation, "role");
  assert.equal(byId.usg?.showPercentile, true);
  assert.equal(byId.usg?.showGrade, false);

  // Games → Statistics tab
  assert.equal(byId.gp, undefined);

  // Raw TOVPG is not shown as a skill metric on the offense chart.
  assert.equal(byId.tov, undefined);

  // Assist / turnover → offense (replaces raw turnovers)
  assert.equal(byId.atr?.category, "offense");
  assert.equal(byId.atr?.interpretation, "higher_is_better");
  assert.equal(byId.atr?.showPercentile, true);
  assert.equal(byId.atr?.showGrade, true);
  assert.ok(byId.atr!.percentile > 50);

  for (const comp of byId.atr!.leagueComps) {
    assert.ok(Number.isFinite(comp.percentile));
    assert.ok(comp.percentile >= 0 && comp.percentile <= 100);
  }
  assert.ok(
    byId.atr!.percentile < 100,
    "focal player sits on the league scale, not glued to 100 among close comps"
  );

  // ORtg in advanced when present
  assert.equal(byId.ortg?.category, "advanced");
  assert.equal(byId.ortg?.showGrade, true);

  // Missing DRtg / NET omitted (not fabricated)
  assert.equal(byId.drtg, undefined);
  assert.equal(byId.net, undefined);

  // Advanced contains only approved metric ids
  for (const m of metrics.filter((x) => x.category === "advanced")) {
    assert.ok(
      ADVANCED_PERCENTILE_METRIC_IDS.has(m.id),
      `unexpected advanced metric ${m.id}`
    );
  }

  // Steal volume lives on Statistics, not ranking
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
  assert.equal(
    zeroMetrics.find((m) => m.id === "stl"),
    undefined
  );

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

  console.log("test-player-percentile-metrics: ok");
}

main();
