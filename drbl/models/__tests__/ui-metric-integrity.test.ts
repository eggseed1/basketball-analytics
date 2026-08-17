import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  barPositionPercent,
  computePlayerPercentiles,
  hasValidDrblEstimate,
  PLAYER_PERCENTILE_METRICS,
} from "../../../src/data/queries/percentiles";
import { buildSavantSections } from "../../../src/lib/player-savant";
import type { PlayerSeason } from "../../../src/data/types";

function blank(overrides: Partial<PlayerSeason> = {}): PlayerSeason {
  return {
    playerId: "0",
    playerName: "Test",
    teamId: "1",
    teamName: "Test Team",
    season: "2025-26",
    age: 25,
    position: "SF",
    gamesPlayed: 40,
    gamesStarted: 40,
    minutes: 1200,
    points: 600,
    fieldGoalsMade: 200,
    fieldGoalsAttempted: 400,
    fieldGoalPct: 0.5,
    twoPointPct: 0.5,
    threePointersMade: 50,
    threePointersAttempted: 150,
    threePointPct: 0.33,
    freeThrowsMade: 100,
    freeThrowsAttempted: 120,
    freeThrowPct: 0.83,
    offensiveRebounds: 20,
    defensiveRebounds: 100,
    rebounds: 120,
    assists: 100,
    steals: 40,
    blocks: 20,
    turnovers: 50,
    personalFouls: 80,
    plusMinus: 0,
    trueShootingPct: 0.55,
    effectiveFieldGoalPct: 0.5,
    threePointAttemptRate: 0.3,
    freeThrowRate: 0.3,
    turnoverPct: 0.1,
    usagePct: 0.2,
    assistPct: 0.15,
    offensiveReboundPct: 0.05,
    defensiveReboundPct: 0.15,
    reboundPct: 0.1,
    stealPct: 0.02,
    blockPct: 0.02,
    pie: 0.1,
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
    drbl100: 0,
    r1Points: null,
    r1WinEquivalents: null,
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    drblO: 0,
    drblD: 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    r1WinEquivalents: 0,
    drblSeasonalImpact: 0,
    drblL: 0,
    drblMeanLeverage: 0,
    drblDisagreement: 0,
    drblUncertainty: 0,
    drblIntervalLo: 0,
    drblIntervalHi: 0,
    ...overrides,
  };
}

describe("player-page metric percentile integrity", () => {
  it("synthetic binding: each DRBL row maps to its own percentile", () => {
    const league: PlayerSeason[] = [];
    for (let i = 0; i < 100; i++) {
      league.push(
        blank({
          playerId: `p${i}`,
          minutes: 1200,
          drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
          r1WinEquivalents: i,
          drbl100: i,
          drblP: i,
          drblLn: i,
          drblB: i,
          drblO: i,
          drblD: i,
        })
      );
    }
    const focal = blank({
      playerId: "focal",
      minutes: 1200,
      drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
      r1WinEquivalents: 7,
      drbl100: 19,
      drblP: 31,
      drblLn: 43,
      drblB: 57,
      drblO: 71,
      drblD: 89,
    });
    const pct = computePlayerPercentiles(focal, league, 500);
    const byKey = Object.fromEntries(pct.map((p) => [p.key, p.percentile]));
    // Distinct synthetic targets must remain distinct after ranking.
    assert.deepEqual(
      [
        byKey.r1WinEquivalents,
        byKey.drbl100,
        byKey.drblP,
        byKey.drblLn,
        byKey.drblB,
        byKey.drblO,
        byKey.drblD,
      ],
      [...new Set([
        byKey.r1WinEquivalents,
        byKey.drbl100,
        byKey.drblP,
        byKey.drblLn,
        byKey.drblB,
        byKey.drblO,
        byKey.drblD,
      ])]
    );
    // Ordering of raw values preserved in percentiles.
    assert.ok(byKey.r1WinEquivalents! < byKey.drbl100!);
    assert.ok(byKey.drbl100! < byKey.drblP!);
    assert.ok(byKey.drblP! < byKey.drblLn!);
    assert.ok(byKey.drblLn! < byKey.drblB!);
    assert.ok(byKey.drblB! < byKey.drblO!);
    assert.ok(byKey.drblO! < byKey.drblD!);

    const sections = buildSavantSections(focal, pct);
    const value = sections.find((s) => s.id === "value")!;
    const expected: Record<string, number> = {
      r1WinEquivalents: byKey.r1WinEquivalents!,
      drbl100: byKey.drbl100!,
      drblP: byKey.drblP!,
      drblLn: byKey.drblLn!,
      drblB: byKey.drblB!,
      drblO: byKey.drblO!,
      drblD: byKey.drblD!,
    };
    for (const [key, want] of Object.entries(expected)) {
      const row = value.metrics.find((m) => m.key === key);
      assert.ok(row, key);
      assert.equal(row!.percentile, want, key);
      assert.equal(barPositionPercent(row!.percentile), want, `${key} bar`);
    }
  });

  it("upstream metric-specific percentiles: P/LN/B orderings can diverge", () => {
    const a = blank({
      playerId: "A",
      minutes: 1200,
      drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
      drblP: 5,
      drblLn: 1,
      drblB: 3,
      drbl100: 5,
      drblO: 5,
      drblD: 1,
      r1WinEquivalents: 5,
    });
    const b = blank({
      playerId: "B",
      minutes: 1200,
      drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
      drblP: 1,
      drblLn: 5,
      drblB: 5,
      drbl100: 1,
      drblO: 1,
      drblD: 5,
      r1WinEquivalents: 1,
    });
    const mid = blank({
      playerId: "M",
      minutes: 1200,
      drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
      drblP: 3,
      drblLn: 3,
      drblB: 1,
      drbl100: 3,
      drblO: 3,
      drblD: 3,
      r1WinEquivalents: 3,
    });
    const league = [a, b, mid];
    const pctA = Object.fromEntries(
      computePlayerPercentiles(a, league, 500).map((p) => [p.key, p.percentile])
    );
    const pctB = Object.fromEntries(
      computePlayerPercentiles(b, league, 500).map((p) => [p.key, p.percentile])
    );
    assert.ok(pctA.drblP! > pctB.drblP!);
    assert.ok(pctA.drblLn! < pctB.drblLn!);
    assert.ok(pctA.drblB! < pctB.drblB!);
  });

  it("cross-season: 2024-25 and 2025-26 distributions do not silently mix", () => {
    const s25 = blank({
      playerId: "x",
      season: "2025-26",
      minutes: 1200,
      drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
      drbl100: 2,
      drblP: 2,
      drblLn: 2,
      drblB: 2,
      drblO: 2,
      drblD: 2,
      r1WinEquivalents: 2,
    });
    const league25 = [
      s25,
      blank({
        playerId: "low",
        season: "2025-26",
        minutes: 1200,
        drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
        drbl100: 0,
        drblP: 0,
        drblLn: 0,
        drblB: 0,
        drblO: 0,
        drblD: 0,
        r1WinEquivalents: 0,
      }),
    ];
    const league24 = [
      blank({
        playerId: "x",
        season: "2024-25",
        minutes: 1200,
        drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
        drbl100: 2,
        drblP: 2,
        drblLn: 2,
        drblB: 2,
        drblO: 2,
        drblD: 2,
        r1WinEquivalents: 2,
      }),
      blank({
        playerId: "elite",
        season: "2024-25",
        minutes: 1200,
        drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
        drbl100: 10,
        drblP: 10,
        drblLn: 10,
        drblB: 10,
        drblO: 10,
        drblD: 10,
        r1WinEquivalents: 10,
      }),
      blank({
        playerId: "low",
        season: "2024-25",
        minutes: 1200,
        drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
        drbl100: 0,
        drblP: 0,
        drblLn: 0,
        drblB: 0,
        drblO: 0,
        drblD: 0,
        r1WinEquivalents: 0,
      }),
    ];
    const p25 = computePlayerPercentiles(s25, league25, 500).find(
      (p) => p.key === "drbl100"
    )!.percentile;
    const p24 = computePlayerPercentiles(
      league24[0]!,
      league24,
      500
    ).find((p) => p.key === "drbl100")!.percentile;
    assert.notEqual(p25, p24);
    assert.ok(p25 > p24);
  });

  it("metadata-only default zeros are excluded from DRBL percentile universe", () => {
    const real = blank({
      playerId: "real",
      minutes: 1200,
      drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000.5,
      drbl100: 0, // true zero ability, but valid estimate
      drblP: 0,
      drblLn: 0,
      drblB: 0,
      drblO: 0,
      drblD: 0,
      r1WinEquivalents: 0,
    });
    const meta = blank({
      playerId: "meta",
      minutes: 1200,
      drblUncertainty: 0,
      drbl100: 0,
      drblP: 0,
      drblLn: 0,
      drblB: 0,
      drblO: 0,
      drblD: 0,
      r1WinEquivalents: 0,
    });
    const elite = blank({
      playerId: "elite",
      minutes: 1200,
      drblUncertainty: 1, rawAbilityRate: 1, drblPossessions: 2000,
      drbl100: 5,
      drblP: 5,
      drblLn: 5,
      drblB: 5,
      drblO: 5,
      drblD: 5,
      r1WinEquivalents: 5,
    });
    assert.equal(hasValidDrblEstimate(real), true);
    assert.equal(hasValidDrblEstimate(meta), false);

    const league = [real, meta, elite];
    const pct = computePlayerPercentiles(real, league, 500);
    const d100 = pct.find((p) => p.key === "drbl100");
    assert.ok(d100);
    // Universe is {real, elite} only ??midrank of lower value ??25
    assert.equal(d100!.percentile, 25);

    // Meta player has no DRBL percentile rows
    const metaPct = computePlayerPercentiles(meta, league, 500).filter((p) =>
      p.key.startsWith("drbl")
    );
    assert.equal(metaPct.length, 0);
  });

  it("every DRBL metric declares its own percentileField", () => {
    const drbl = PLAYER_PERCENTILE_METRICS.filter((m) =>
      m.key.startsWith("drbl")
    );
    const fields = new Set(drbl.map((m) => m.percentileField));
    assert.equal(fields.size, drbl.length);
    for (const m of drbl) {
      assert.ok(m.eligible, m.key);
      assert.ok(m.percentileField?.endsWith("Percentile"), m.key);
    }
  });
});
