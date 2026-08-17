import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  abilitySamplingSe,
  applyDisplayUncertaintyCap,
  createLeaderboard,
  empiricalBayesRate,
  finalRankingScoreFor,
  populationSd,
  seasonalImpactFromRawRate,
  stableSortPlayers,
  standardizedDisagreement,
  warFromImpact,
  type RankablePlayer,
} from "../leaderboard";
import { defaultRankingConfig } from "../ranking-config";
import {
  finalizePlayerSeasonRows,
  type DrblPlayerAccumulator,
} from "../player-value";

function basePlayer(
  partial: Partial<RankablePlayer> &
    Pick<RankablePlayer, "playerId" | "playerName" | "finalRankingScore">
): RankablePlayer {
  return {
    teamId: "T1",
    actualPossessions: 1000,
    rawAbilityRate: 2,
    posteriorAbilityRate: 1.5,
    fusedRateRaw: 1.8,
    drblP: 1,
    drblLn: 1,
    drblB: 1,
    drblO: 1,
    drblD: 1,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    seasonalImpact: 20,
    seasonWar: 20 / 30,
    forecastPossessions: 2500,
    forecastImpact: 0,
    forecastWar: 0,
    reliabilityWeight: 0.8,
    priorMean: 0,
    priorEquivalentPossessions: 200,
    replacementLevelRate: 0,
    pointsPerWin: 30,
    componentDisagreementIndex: 0.2,
    abilityStandardError: 0.5,
    abilityIntervalLow: 0,
    abilityIntervalHigh: 2,
    displayUncertainty: 0.5,
    drblL: 0,
    meanLeverage: 1,
    rankingMode: "season_value",
    eligibilityStatus: "eligible",
    eligibilityReason: "ok",
    rankingFormulaVersion: "2.0.0",
    drbl100: 1.5,
    drblWar: 20 / 30,
    possessions: 1000,
    disagreement: 0.2,
    uncertainty: 0.5,
    intervalLo: 0,
    intervalHi: 2,
    ...partial,
  };
}

describe("empirical Bayes + season impact", () => {
  it("shrinks small samples more toward the prior", () => {
    const raw = 10;
    const prior = 0;
    const k = 200;
    const a = empiricalBayesRate(raw, 200, prior, k);
    const b = empiricalBayesRate(raw, 2000, prior, k);
    assert.ok(a.posterior < b.posterior);
    assert.ok(a.reliability < b.reliability);
  });

  it("seasonal impact uses actual possessions only", () => {
    assert.equal(seasonalImpactFromRawRate(2.0, 1000), 20);
    assert.equal(seasonalImpactFromRawRate(2.0, 0), 0);
    const k = 200;
    const raw = 5;
    const n = 100;
    const { posterior } = empiricalBayesRate(raw, n, 0, k);
    // Changing prior strength changes posterior but not exposure term.
    const impact = seasonalImpactFromRawRate(raw, n);
    assert.equal(impact, (raw * n) / 100);
    assert.notEqual(posterior, raw);
    assert.equal(impact, seasonalImpactFromRawRate(raw, n));
  });

  it("zero actual possessions ⇒ zero realized season value", () => {
    const impact = seasonalImpactFromRawRate(8, 0);
    assert.equal(impact, 0);
    assert.equal(warFromImpact(impact, 30), 0);
  });

  it("forecast separation: forecast possessions do not change season impact", () => {
    const season = seasonalImpactFromRawRate(2, 1000);
    const forecastA = seasonalImpactFromRawRate(2, 2500);
    const forecastB = seasonalImpactFromRawRate(2, 4000);
    assert.equal(season, 20);
    assert.ok(forecastB > forecastA);
    assert.equal(seasonalImpactFromRawRate(2, 1000), season);
  });
});

describe("component disagreement scale", () => {
  it("raw scale alone does not inflate standardized disagreement", () => {
    // Same relative pattern, different numeric scales.
    const a = standardizedDisagreement([
      { value: 1, mean: 0, sd: 1 },
      { value: 2, mean: 0, sd: 1 },
      { value: 3, mean: 0, sd: 1 },
    ]);
    const b = standardizedDisagreement([
      { value: 100, mean: 0, sd: 100 },
      { value: 200, mean: 0, sd: 100 },
      { value: 300, mean: 0, sd: 100 },
    ]);
    assert.ok(Math.abs(a - b) < 1e-9);
    const rawSd = populationSd([1, 2, 3]);
    const rawSdScaled = populationSd([100, 200, 300]);
    assert.ok(rawSdScaled > rawSd * 50);
  });
});

describe("uncertainty", () => {
  it("decreases with sample size (controlled)", () => {
    assert.ok(abilitySamplingSe(100) > abilitySamplingSe(1000));
  });

  it("interval uses criticalValue * SE; display cap is separate", () => {
    const se = 4;
    const z = 1.28;
    const { trueHalfWidth, displayHalfWidth } = applyDisplayUncertaintyCap(
      se,
      z
    );
    assert.equal(trueHalfWidth, z * se);
    assert.equal(displayHalfWidth, 4);
    assert.ok(trueHalfWidth > displayHalfWidth);
  });
});

describe("ranking score and selection order", () => {
  it("rank follows finalRankingScore, not drbl100", () => {
    const config = defaultRankingConfig({ rankingMode: "season_value" });
    const players = [
      basePlayer({
        playerId: "high-rate",
        playerName: "High Rate Low Minutes",
        drbl100: 9,
        posteriorAbilityRate: 9,
        actualPossessions: 80,
        seasonWar: 0.2,
        finalRankingScore: 0.2,
      }),
      basePlayer({
        playerId: "high-war",
        playerName: "High WAR",
        drbl100: 2,
        posteriorAbilityRate: 2,
        actualPossessions: 4000,
        seasonWar: 3,
        finalRankingScore: 3,
      }),
    ];
    const board = createLeaderboard(players, {
      ...config,
      leaderboardSize: 2,
    });
    assert.equal(board[0]!.playerId, "high-war");
    assert.equal(board[0]!.rank, 1);
    assert.ok(board[0]!.drbl100 < board[1]!.drbl100);
  });

  it("scores full population before top-100 truncation", () => {
    const players: RankablePlayer[] = [];
    for (let i = 0; i < 101; i++) {
      // Intermediate metric (drbl100) ranks i=0 highest; final score ranks i=100 highest.
      players.push(
        basePlayer({
          playerId: `p${i}`,
          playerName: `P${i}`,
          drbl100: 100 - i,
          posteriorAbilityRate: 100 - i,
          seasonWar: i / 30,
          finalRankingScore: i / 30,
          actualPossessions: 500 + i,
          eligibilityStatus: "eligible",
        })
      );
    }
    const board = createLeaderboard(
      players,
      defaultRankingConfig({ leaderboardSize: 100, rankingMode: "season_value" })
    );
    assert.equal(board.length, 100);
    assert.ok(board.some((p) => p.playerId === "p100"));
    assert.equal(board[0]!.playerId, "p100");
    assert.ok(!board.some((p) => p.playerId === "p0"));
  });

  it("extreme small sample is shrunk and does not auto-rank first on ability", () => {
    const tiny = empiricalBayesRate(50, 20, 0, 200);
    const solid = empiricalBayesRate(8, 3000, 0, 200);
    assert.ok(tiny.posterior < solid.posterior);
    assert.ok(abilitySamplingSe(20) > abilitySamplingSe(3000));
  });

  it("sorts on full precision before display rounding", () => {
    const a = basePlayer({
      playerId: "a",
      playerName: "A",
      finalRankingScore: 1.0000001,
      abilityStandardError: 0.1,
    });
    const b = basePlayer({
      playerId: "b",
      playerName: "B",
      finalRankingScore: 1.0000000,
      abilityStandardError: 0.1,
    });
    const sorted = stableSortPlayers([b, a]);
    assert.equal(sorted[0]!.playerId, "a");
    assert.equal(Number(a.finalRankingScore.toFixed(2)), Number(b.finalRankingScore.toFixed(2)));
  });

  it("is deterministic across identical runs", () => {
    const players = [
      basePlayer({ playerId: "z", playerName: "Z", finalRankingScore: 1 }),
      basePlayer({ playerId: "a", playerName: "A", finalRankingScore: 1 }),
      basePlayer({ playerId: "m", playerName: "M", finalRankingScore: 2 }),
    ];
    const r1 = createLeaderboard(players).map((p) => p.playerId).join(",");
    const r2 = createLeaderboard(players).map((p) => p.playerId).join(",");
    assert.equal(r1, r2);
  });

  it("ability_conservative uses posterior − penalty·SE", () => {
    const cfg = defaultRankingConfig({
      rankingMode: "ability_conservative",
      confidencePenalty: 1.28,
    });
    const score = finalRankingScoreFor(
      "ability_conservative",
      {
        posteriorAbilityRate: 5,
        abilityStandardError: 1,
        seasonWar: 0,
        forecastWar: 0,
      },
      cfg
    );
    assert.equal(score, 5 - 1.28);
  });

  it("rejects negative possessions via clamped exposure (season impact 0 for n<=0)", () => {
    assert.equal(seasonalImpactFromRawRate(5, -10), 0);
    assert.equal(seasonalImpactFromRawRate(5, 0), 0);
  });

  it("handles missing B by omitting it from standardized disagreement", () => {
    const withB = standardizedDisagreement([
      { value: 1, mean: 0, sd: 1 },
      { value: 2, mean: 0, sd: 1 },
      { value: 3, mean: 0, sd: 1 },
    ]);
    const withoutB = standardizedDisagreement([
      { value: 1, mean: 0, sd: 1 },
      { value: 2, mean: 0, sd: 1 },
    ]);
    assert.ok(Number.isFinite(withB));
    assert.ok(Number.isFinite(withoutB));
  });
});

describe("finalizePlayerSeasonRows integration", () => {
  function acc(
    id: string,
    name: string,
    possessions: number,
    totalValue: number
  ): DrblPlayerAccumulator {
    return {
      playerId: id,
      playerName: name,
      teamId: "T1",
      possessions,
      offensivePossessions: Math.floor(possessions / 2),
      defensivePossessions: possessions - Math.floor(possessions / 2),
      totalValue,
      offensiveValue: totalValue * 0.6,
      defensiveValue: totalValue * 0.4,
      leverageValue: totalValue,
      leverageWeightSum: possessions,
      sdvSum: 0,
      sdvN: 0,
      shotMakingSum: 0,
      shotMakingN: 0,
      epvShootSum: 0,
      vContSum: 0,
      creationValue: 0,
      connectionValue: 0,
      conversionOpportunityValue: 0,
      executionValue: 0,
      recoveryValue: 0,
      turnoverValue: 0,
      defenseEventValue: 0,
    };
  }

  it("ranks by season WAR by default, not fused rate", () => {
    const map = new Map<string, DrblPlayerAccumulator>();
    // Tiny sample, extreme rate
    map.set("tiny", acc("tiny", "Tiny", 60, 60 * 0.2)); // raw = 20/100
    // Large sample, solid rate
    map.set("solid", acc("solid", "Solid", 4000, 4000 * 0.04)); // raw = 4/100
    const rows = finalizePlayerSeasonRows(map, {
      minPossessions: 50,
      ranking: { rankingMode: "season_value" },
    });
    assert.equal(rows[0]!.playerId, "solid");
    assert.equal(rows[0]!.rankingMode, "season_value");
    assert.equal(rows[0]!.rank, 1);
    assert.ok(rows[0]!.finalRankingScore > rows[1]!.finalRankingScore);
    // seasonalImpact = raw * n / 100 = totalValue
    assert.ok(Math.abs(rows[0]!.seasonalImpact - 160) < 0.02);
    assert.equal(rows[0]!.actualPossessions, 4000);
    assert.equal(rows[0]!.priorEquivalentPossessions, 1600);
  });

  it("keeps prior strength out of the exposure formula (impact = raw*n/100)", () => {
    const map = new Map<string, DrblPlayerAccumulator>();
    map.set("p", acc("p", "P", 100, 10));
    const rows = finalizePlayerSeasonRows(map, { minPossessions: 50 });
    const row = rows[0]!;
    assert.equal(row.seasonalImpact, 10);
    const raw = (10 * 100) / 100;
    assert.equal(seasonalImpactFromRawRate(raw, 100), 10);
    // Realized exposure is actual N only — prior strength (k=1600) must not inflate impact.
    assert.equal(row.actualPossessions, 100);
    assert.equal(row.priorEquivalentPossessions, 1600);
    assert.equal(row.r1Points, 10);
  });
});
