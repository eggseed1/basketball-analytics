import assert from "node:assert/strict";

import { getHistoricalGames } from "../src/data/queries/historical";
import { getLeagueStandings } from "../src/data/queries/standings";
import { buildPlayoffBracket, buildProjectedPlayoffBracket } from "../src/lib/playoff-bracket";
import type { StandingRow } from "../src/data/types/standings";

function standing(
  partial: Partial<StandingRow> & Pick<StandingRow, "teamId" | "abbreviation">
): StandingRow {
  return {
    displayName: partial.abbreviation,
    conference: partial.conference ?? "West",
    rank: partial.rank ?? 1,
    wins: partial.wins ?? 40,
    losses: partial.losses ?? 30,
    winPct: partial.winPct ?? 0.571,
    gamesBehind: partial.gamesBehind ?? 0,
    differential: partial.differential ?? 3,
    ppg: partial.ppg ?? 110,
    oppPpg: partial.oppPpg ?? 107,
    streak: partial.streak ?? "W1",
    homeRecord: partial.homeRecord ?? "20-15",
    roadRecord: partial.roadRecord ?? "20-15",
    lastTen: partial.lastTen ?? "6-4",
    playoffSeed: partial.playoffSeed ?? partial.rank ?? 1,
    ...partial,
  };
}

async function main() {
  const westRows = [
    "OKC",
    "SAS",
    "DEN",
    "LAL",
    "HOU",
    "MIN",
    "POR",
    "PHX",
    "NOP",
    "GSW",
  ].map((abbr, i) =>
    standing({
      teamId: String(i + 1),
      abbreviation: abbr,
      conference: "West",
      rank: i + 1,
      playoffSeed: i + 1,
    })
  );

  const projected = buildProjectedPlayoffBracket({
    season: "2025-26",
    standings: {
      season: "2025-26",
      conferences: [
        { conference: "West", rows: westRows },
        { conference: "East", rows: [] },
      ],
    },
  });

  assert.equal(projected.mode, "projected");
  assert.equal(projected.west.firstRound[0]?.top.team?.abbreviation, "OKC");
  assert.equal(projected.west.firstRound[0]?.bottom.label, "9/10");
  assert.equal(projected.west.playIn[0]?.top.team?.abbreviation, "NOP");
  assert.equal(projected.west.playIn[1]?.top.team?.abbreviation, "POR");

  const [games, standings] = await Promise.all([
    getHistoricalGames({ season: "2023-24" }),
    getLeagueStandings("2023-24"),
  ]);
  const playoffGames = games.filter(
    (g) => g.gameType === "playoff" || g.gameType === "play-in"
  );
  assert.ok(playoffGames.length > 0, "expected 2023-24 playoff games");

  const completed = buildPlayoffBracket({
    season: "2023-24",
    standings,
    games: playoffGames,
    now: new Date("2024-07-01"),
  });
  assert.equal(completed.mode, "complete");
  assert.equal(completed.source, "results");
  assert.equal(
    completed.finals.top.winner || completed.finals.bottom.winner,
    true
  );
  const finalsWinner = completed.finals.top.winner
    ? completed.finals.top.team?.abbreviation
    : completed.finals.bottom.team?.abbreviation;
  assert.equal(finalsWinner, "BOS");
  assert.equal(completed.finals.result, "4-1");

  // Snapshot-backed seasons should fully fill (15 best-of-7 series).
  const { getRuntimeSnapshotGames } = await import(
    "../src/data/runtime/game-snapshot"
  );
  const { computeStandingsFromGameArchive } = await import(
    "../src/lib/standings-from-games"
  );
  for (const season of ["2021-22", "2022-23", "2023-24", "2024-25"] as const) {
    const seasonGames = getRuntimeSnapshotGames(season);
    const standingsArchive = computeStandingsFromGameArchive(
      season,
      seasonGames
    );
    assert.ok(standingsArchive, `standings archive ${season}`);
    for (const conf of standingsArchive.conferences) {
      for (const row of conf.rows) {
        row.playoffSeed = row.rank;
      }
    }
    const playoff = seasonGames.filter(
      (g) => g.gameType === "playoff" || g.gameType === "play-in"
    );
    const model = buildPlayoffBracket({
      season,
      standings: standingsArchive,
      games: playoff,
      now: new Date("2025-08-01"),
    });
    assert.equal(model.mode, "complete", season);
    const seriesSlots = [
      ...model.east.firstRound,
      ...model.west.firstRound,
      ...model.east.semifinals,
      ...model.west.semifinals,
      model.east.conferenceFinals,
      model.west.conferenceFinals,
      model.finals,
    ];
    const filled = seriesSlots.filter(
      (m) => m.top.team && m.bottom.team && m.result && (m.top.winner || m.bottom.winner)
    );
    assert.equal(filled.length, 15, `${season} expected full bracket`);
    assert.ok(
      model.finals.top.winner || model.finals.bottom.winner,
      `${season} finals winner`
    );
  }

  console.log("playoff-bracket checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
