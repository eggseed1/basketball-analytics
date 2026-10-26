import assert from "node:assert/strict";
import test from "node:test";

import { projectSeasons, type ProjectionParams, type SeasonLine } from "@/contracts/value-model";
import { getContractValue } from "@/data/runtime/contract-value";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import {
  projectedRosterWarRows,
  projectedWar1AboveAverage,
  projectRosterPlayer,
  seasonLineOn82Games,
} from "@/lib/roster-war1-projection";

const PARAMS: ProjectionParams = {
  weights: [3, 2, 1],
  regressionPossessions: 15000,
  leagueRate: 0.0000072,
  replacementRate: -0.0001923,
  aging: { intercept: 0.00032, slope: -0.000012, min: -0.0003, max: 0.0002 },
  possessions: {
    intercept: 746,
    last: 0.57,
    prior: -0.016,
    agePenalty: -207,
    ageKnee: 30,
    salaryShare: 4153,
    salaryShareLow: 28051,
    lowShareCap: 0.05,
    bounce: 0.123,
    max: 8000,
  },
  errorByHorizon: [{ base: 0.1, perK: 0.22 }],
};

test("projected WAR1 adds the replacement gap back onto the contract wins", () => {
  const history: SeasonLine[] = [
    { season: "2025-26", possessions: 5000, war1: 6, drblWins: 6, age: 27 },
    { season: "2024-25", possessions: 4800, war1: 5, drblWins: 5, age: 26 },
  ];
  const projected = projectedWar1AboveAverage(history, 2025, 27, 2026, 0.25, PARAMS);
  const contract = projectSeasons(history, 2025, 27, [2026], new Map([[2026, 0.25]]), PARAMS)?.[0];
  assert.ok(projected);
  assert.ok(contract);
  assert.ok(Math.abs(projected.war1 - (contract.wins + PARAMS.replacementRate * contract.possessions)) < 1e-9);
  assert.ok(projected.war1 < projected.winsAboveReplacement);
});

test("2020-21 possessions and WAR1 scale onto 82 games together", () => {
  const line = seasonLineOn82Games("2020-21", 720, 3.6, 2);
  assert.equal(line.possessions, 820);
  assert.equal(line.war1, 4.1);
  const full = seasonLineOn82Games("2025-26", 1000, 2, null);
  assert.equal(full.possessions, 1000);
  assert.equal(full.drblWins, null);
});

test("Tatum's roster projection is a separate number from the baked contract card", async () => {
  const alias = getBundledPlayerIdAliasIndex().byEspn.get("4065648");
  assert.equal(alias?.nbaPlayerId, "1628369");
  const contract = getContractValue("2", "tatumja01");
  assert.equal(contract?.kind, "estimate");
  if (contract?.kind !== "estimate") return;
  const year = contract.years.find((row) => row.season === "2026-27");
  assert.ok(year);
  const projected = await projectRosterPlayer(alias.nbaPlayerId, {
    age: 28,
    capSeason: "2026-27",
    salary: year.salary,
  });
  assert.ok(projected);
  // The card is baked by the contract fit. The roster line rebuilds the next
  // season from published DRBL rows, so the two win totals are not required to match.
  assert.ok(Number.isFinite(projected.winsAboveReplacement));
  assert.ok(Number.isFinite(year.wins));
  assert.ok(projected.war1 < projected.winsAboveReplacement);
  const rows = await projectedRosterWarRows(
    [{ espnId: "4065648", name: "Jayson Tatum" }],
    getBundledPlayerIdAliasIndex()
  );
  assert.equal(rows.length, 1);
  assert.ok(rows[0] && Math.abs((rows[0].r1WinEquivalents ?? 0) - projected.war1) < 1e-9);
});

test("a roster projection leaves out a player with no contract", async () => {
  const rows = await projectedRosterWarRows(
    [
      { espnId: "no-such-player", name: "Nobody" },
    ],
    getBundledPlayerIdAliasIndex()
  );
  assert.equal(rows.length, 0);
});
