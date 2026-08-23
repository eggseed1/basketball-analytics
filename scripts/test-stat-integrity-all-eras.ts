import assert from "node:assert/strict";

import {
  completeCategoryMap,
  mergePlayerSeasonRows,
  transformCompleteEspnPlayerSeason,
  transformCompleteEspnTeamTotals,
} from "../src/data/providers/nba/espn-stat-integrity";
import {
  MISSING_PLAYER_STAT,
  withPlayerSeasonDefaults,
} from "../src/data/transformers/player-season-defaults";
import { formatNumber, formatPct } from "../src/lib/format";
import type {
  EspnAthleteStatsRow,
  EspnStatCategorySchema,
  EspnTeamStatsRow,
  TeamSeasonTotals,
} from "../src/data/transformers/espn";

const schema: EspnStatCategorySchema[] = [
  {
    name: "general",
    names: [
      "gamesPlayed",
      "gamesStarted",
      "minutes",
      "points",
      "assists",
      "totalRebounds",
      "offensiveRebounds",
      "defensiveRebounds",
      "steals",
      "blocks",
      "turnovers",
      "fouls",
      "fieldGoalsMade",
      "fieldGoalsAttempted",
      "threePointFieldGoalsMade",
      "threePointFieldGoalsAttempted",
      "freeThrowsMade",
      "freeThrowsAttempted",
      "fieldGoalPct",
      "threePointFieldGoalPct",
      "freeThrowPct",
      "plusMinus",
    ],
  },
];

const totals = [
  "82",
  "82",
  "2800",
  "2100",
  "700",
  "650",
  "120",
  "530",
  "0",
  "45",
  "220",
  "180",
  "780",
  "1500",
  "210",
  "600",
  "330",
  "410",
  "52.0",
  "35.0",
  "80.5",
  "+315",
];

const athleteRow: EspnAthleteStatsRow = {
  athlete: {
    id: "123",
    displayName: "Integrity Player",
    teamId: "7",
    teamName: "Denver Nuggets",
    position: { abbreviation: "G" },
  },
  categories: [{ name: "general", totals }],
};

const teamRow: EspnTeamStatsRow = {
  team: {
    id: "7",
    abbreviation: "DEN",
    displayName: "Denver Nuggets",
  },
  categories: [
    {
      name: "general",
      totals: [
        "82",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "3200",
        "7000",
        "900",
        "2500",
        "1500",
        "1900",
        "45.7",
        "36.0",
        "78.9",
        "0",
      ],
    },
  ],
};

function main() {
  // ESPN frequently ships string totals instead of numeric values.
  const map = completeCategoryMap(athleteRow.categories, schema);
  assert.equal(map.get("points"), 2100);
  assert.equal(map.get("steals"), 0, "explicit zero must survive parsing");
  assert.equal(map.get("plusMinus"), 315);

  const teamTotals = transformCompleteEspnTeamTotals(teamRow, schema);
  assert.equal(teamTotals.gamesPlayed, 82);
  assert.equal(teamTotals.fieldGoalsAttempted, 7000);

  const row = transformCompleteEspnPlayerSeason(
    athleteRow,
    "2024-25",
    new Map<string, TeamSeasonTotals>([["7", teamTotals]]),
    schema
  );
  assert.equal(row.fieldGoalsMade, 780);
  assert.equal(row.fieldGoalsAttempted, 1500);
  assert.equal(row.threePointersMade, 210);
  assert.equal(row.threePointersAttempted, 600);
  assert.equal(row.freeThrowsMade, 330);
  assert.equal(row.freeThrowsAttempted, 410);
  assert.equal(row.offensiveRebounds, 120);
  assert.equal(row.defensiveRebounds, 530);
  assert.equal(row.steals, 0, "measured zero is not missing");
  assert.ok(Number.isFinite(row.trueShootingPct));
  assert.ok(Number.isFinite(row.effectiveFieldGoalPct));

  const sparse = withPlayerSeasonDefaults({
    playerId: "123",
    playerName: "Integrity Player",
    teamId: "7",
    teamName: "Denver Nuggets",
    season: "1990-91",
    gamesPlayed: 1,
    steals: 0,
  });
  assert.equal(sparse.steals, 0);
  assert.ok(Number.isNaN(sparse.blocks));
  assert.ok(Number.isNaN(sparse.per));
  assert.equal(MISSING_PLAYER_STAT, Number.NaN);
  assert.equal(formatNumber(sparse.blocks), "—");
  assert.equal(formatPct(sparse.trueShootingPct ?? Number.NaN), "—");

  const fallback = {
    ...sparse,
    blocks: 4,
    assists: 0,
    points: 20,
  };
  const merged = mergePlayerSeasonRows(sparse, fallback);
  assert.equal(merged.steals, 0, "preferred real zero must win");
  assert.equal(merged.assists, 0, "fallback real zero must be accepted");
  assert.equal(merged.blocks, 4, "missing preferred value must be filled");
  assert.equal(merged.points, 20);

  console.log("test-stat-integrity-all-eras: ok");
}

main();
