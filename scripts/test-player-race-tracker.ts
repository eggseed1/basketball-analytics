/**
 * Full-league race field must not leave a hole around replacement level.
 * Run: npx tsx scripts/test-player-race-tracker.ts
 */
import assert from "node:assert/strict";

import {
  buildPlayerRaceChartRows,
  buildPlayerRaceOverlayPlayer,
  type PlayerRacePlayer,
  samplePlayerRaceFieldEvenly,
  takePlayerRaceFieldSlice,
} from "../src/lib/player-race-tracker";

function main() {
  const pool = Array.from({ length: 500 }, (_, i) => ({
    id: `p${i}`,
    war: 5 - i * 0.02,
  }));
  const keyOf = (row: (typeof pool)[number]) => row.id;

  const bothEnds = takePlayerRaceFieldSlice(pool, 120, "both", keyOf);
  assert.equal(bothEnds.length, 120);
  const nearZero = bothEnds.filter((row) => Math.abs(row.war) < 0.75);
  assert.equal(
    nearZero.length,
    0,
    "both-ends slice should skip replacement-level players"
  );

  const spread = samplePlayerRaceFieldEvenly(pool, 120, keyOf);
  assert.ok(
    spread.filter((row) => Math.abs(row.war) < 0.75).length >= 8,
    "even spread should include middle players"
  );

  const overlay = buildPlayerRaceOverlayPlayer({
    playerId: "708",
    displayName: "Test",
    teamId: "2",
    teamAbbr: "BOS",
    metric: "war1",
    seasonTotal: 8.5,
    startDate: "2025-10-15",
    endDate: "2026-04-15",
    gamesPlayed: 70,
    minutesPlayed: 2400,
  });
  assert.ok(overlay, "season_total overlay should build");
  assert.ok((overlay?.points.length ?? 0) >= 16);
  const last = overlay!.points[overlay!.points.length - 1]!;
  assert.ok(
    Math.abs(last.value - 8.5) < 0.6,
    `overlay should settle near season total (got ${last.value})`
  );
  assert.ok(
    overlay!.points[0]!.date > "2025-10-15",
    `70-GP overlay must not start at opening night (got ${overlay!.points[0]!.date})`
  );

  // Late-return / limited GP: never invent an October→April path.
  const lateReturn = buildPlayerRaceOverlayPlayer({
    playerId: "1628369",
    displayName: "Jayson Tatum",
    teamId: "2",
    teamAbbr: "BOS",
    metric: "drbl100",
    seasonTotal: -0.31,
    startDate: "2025-10-15",
    endDate: "2026-04-15",
    gamesPlayed: 22,
    minutesPlayed: 700,
  });
  assert.ok(lateReturn, "limited-GP rate overlay should build");
  assert.ok(
    lateReturn!.points[0]!.date >= "2026-02-01",
    `22-GP DRBL overlay must start late (got ${lateReturn!.points[0]!.date})`
  );
  assert.ok(
    lateReturn!.points.every((p) => p.date >= "2026-02-01"),
    "no synthetic DRBL points during inactive months"
  );

  const countingOverlay = buildPlayerRaceOverlayPlayer({
    playerId: "201939",
    displayName: "Counter",
    teamId: "9",
    teamAbbr: "GSW",
    metric: "points",
    seasonTotal: 2100,
    startDate: "2025-10-15",
    endDate: "2026-04-15",
    gamesPlayed: 74,
    minutesPlayed: 2500,
  });
  assert.ok(countingOverlay, "counting overlay should build for full-field path");
  assert.ok(
    Math.abs((countingOverlay!.points.at(-1)?.value ?? 0) - 2100) < 1,
    "counting overlay should settle on season total"
  );

  // Dense rate field: staggered game dates must not leave partial lines.
  const isoPlus = (start: string, days: number) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const ratePlayer = (id: string, dates: string[]): PlayerRacePlayer => ({
    playerId: id,
    espnId: null,
    nbaId: null,
    displayName: id,
    shortName: id,
    teamId: "1",
    teamAbbr: "AAA",
    points: dates.map((date, i) => ({ date, value: i * 0.1, games: i + 1 })),
    currentValue: dates.length * 0.1,
    gamesPlayed: dates.length,
    minutesPlayed: 1500,
  });
  const denseField = Array.from({ length: 150 }, (_, i) =>
    ratePlayer(
      `r${i}`,
      Array.from({ length: 28 }, (_, k) => isoPlus("2025-10-22", (i % 5) + k * 6 + 2))
    )
  );
  const lateDates = Array.from({ length: 12 }, (_, k) => isoPlus("2026-02-10", k * 5));
  const gapDates = [
    ...Array.from({ length: 8 }, (_, k) => isoPlus("2025-10-24", k * 5)),
    ...Array.from({ length: 8 }, (_, k) => isoPlus("2026-01-20", k * 5)),
  ];
  denseField.push(ratePlayer("late", lateDates), ratePlayer("gap", gapDates));
  const denseRows = buildPlayerRaceChartRows(denseField, "all", { forwardFill: false });
  const full = denseField[7]!;
  const inSpan = denseRows.filter(
    (row) => row.date >= full.points[0]!.date && row.date <= full.points.at(-1)!.date
  );
  assert.ok(
    inSpan.every((row) => row[full.playerId] != null),
    "full-season rate line must be continuous across its own span"
  );
  assert.ok(
    denseRows.every((row) => row.date >= "2026-02-10" || row.late == null),
    "late-return rate line must stay null before the first game"
  );
  assert.ok(
    denseRows.some((row) => row.date >= "2026-02-10" && row.late != null),
    "late-return rate line must render after returning"
  );
  assert.ok(
    denseRows
      .filter((row) => row.date > "2025-12-01" && row.date < "2026-01-20")
      .every((row) => row.gap == null),
    "long absences must break the rate line"
  );

  console.log("test-player-race-tracker: ok");
}

main();
