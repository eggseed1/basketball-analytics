import assert from "node:assert/strict";

import {
  currentPayoffSeason,
  getPayoffSeason,
  getPlayerPayoff,
  getTeamPayoff,
  payoffLeftOutNote,
  payoffSeasonOptions,
  payoffSeasons,
  payoffWaiting,
  sampleIndexes,
} from "@/data/runtime/salary-payoff";
import {
  cumulativeWins,
  earnedValue,
  paceSeries,
  paidOffDate,
  payoffSeries,
  projectedPct,
  seasonDayShare,
  shortDate,
  type PayoffSeasonFile,
} from "@/lib/salary-payoff";

// ---- Math on a small made-up season
const toy: PayoffSeasonFile = {
  kind: "nightly",
  opener: "2026-10-20",
  end: "2026-10-29",
  cap: 100_000_000,
  minimum: 1_000_000,
  pricePerWin: 10_000_000,
  dates: ["2026-10-20", "2026-10-22", "2026-10-24"],
  players: {
    a: ["Climber", "1", 5_000_000, [10, 20, 30], "100"],
    b: ["Below replacement", "1", 5_000_000, [-50, -10, 0], "200"],
  },
  leftOut: { noValue: 0, noSalary: 0, partial: 0 },
};

assert.equal(seasonDayShare("2026-10-19", toy.opener, toy.end), 0, "nothing before the opener");
assert.equal(seasonDayShare("2026-10-20", toy.opener, toy.end), 0.1, "opening night is one day of ten");
assert.equal(seasonDayShare("2026-10-29", toy.opener, toy.end), 1, "last day is the whole season");
assert.equal(seasonDayShare("2026-11-30", toy.opener, toy.end), 1, "capped after the season");
assert.deepEqual(cumulativeWins([10, 20, 30]), [0.1, 0.3, 0.6], "deltas add up");
assert.equal(earnedValue(-2, 0.5, toy), 500_000, "below replacement earns only the minimum's share");
assert.deepEqual(paceSeries(toy).map((p) => Math.round(p)), [10, 30, 50], "pace follows days");

const climber = payoffSeries(toy, "a")!;
assert.deepEqual(climber.earned, [1_100_000, 3_300_000, 6_500_000], "minimum share plus wins at the price");
assert.deepEqual(climber.pct.map((p) => Math.round(p)), [22, 66, 130]);
assert.equal(paidOffDate(climber, toy.dates), "2026-10-24", "first date at or past 100%");
assert.equal(projectedPct(climber, toy)!.toFixed(0), "260", "projection scales by the share of season gone");
assert.equal(projectedPct(climber, { ...toy, dates: ["2026-10-20"] }), null, "no projection on opening night");

const below = payoffSeries(toy, "b")!;
assert.ok(below.earned.every((e) => e >= 0), "earned never goes negative");
assert.equal(paidOffDate(below, toy.dates), null);
assert.equal(payoffSeries(toy, "missing"), null);
assert.equal(shortDate("2026-10-20"), "Oct 20");
assert.deepEqual(sampleIndexes(5, 10), [0, 1, 2, 3, 4], "short series kept whole");
const sampled = sampleIndexes(166, 90);
assert.equal(sampled[0], 0);
assert.equal(sampled.at(-1), 165, "sampling keeps the last night");
assert.ok(sampled.length <= 90);

// ---- Baked snapshot
const seasons = payoffSeasons();
assert.ok(seasons.length, "at least one season is baked");
for (const season of seasons) {
  const found = getPayoffSeason(season)!;
  const { meta, players } = found;
  assert.ok(meta.dates.length, `${season} has dates`);
  assert.deepEqual([...meta.dates].sort(), meta.dates, `${season} dates ascend`);
  assert.ok(meta.dates[0] >= meta.opener && meta.dates.at(-1)! <= meta.end, `${season} dates sit in the regular season`);
  assert.ok(meta.pace.every((p, i) => i === 0 || p >= meta.pace[i - 1]), `${season} pace never falls`);
  assert.ok(players.length > 100, `${season} has a real field`);
  const keys = new Set<string>();
  players.forEach((p, i) => {
    assert.equal(p.rank, i + 1, `${p.name} rank is contiguous`);
    assert.ok(!keys.has(p.key), `${p.name} listed once`);
    keys.add(p.key);
    assert.ok(p.salary >= meta.minimum, `${p.name} salary is at least the minimum; partial deals are left out`);
    assert.equal(p.pct.length, meta.dates.length, `${p.name} has a point per date`);
    assert.ok(p.pct.every((v) => Number.isFinite(v) && v >= 0), `${p.name} percents are finite`);
    if (i) assert.ok((players[i - 1].pct.at(-1) ?? 0) >= (p.pct.at(-1) ?? 0), "sorted by share covered");
    if (p.paidOff) assert.ok(meta.dates.includes(p.paidOff), `${p.name} paid-off date is a reading`);
  });
  const note = payoffLeftOutNote(meta);
  if (note) assert.ok(!/\b1 (salaries|players)\b/.test(note), "left-out counts agree in number");

  const first = players[0];
  if (first.nbaId) assert.equal(getPlayerPayoff(first.nbaId, season)?.player.key, first.key, "player lookup finds his line");
  const team = getTeamPayoff(first.teamId, season)!;
  assert.ok(team.players.every((p) => p.teamId === first.teamId), "team lines are that team's");
  const salary = team.players.reduce((s, p) => s + p.salary, 0);
  assert.equal(team.total.salary, salary, "team total salary adds up");
  const earned = team.players.reduce((s, p) => s + (p.earned.at(-1) ?? 0), 0);
  assert.ok(Math.abs((team.total.earned.at(-1) ?? 0) - earned) < 1, "team total earned adds up");
}
// ---- Seasons stay separate
const current = currentPayoffSeason();
assert.ok(payoffSeasonOptions().includes(current), "this league year is always offered");
assert.equal(payoffSeasonOptions()[0], current, "newest first");
const waiting = payoffWaiting(current);
if (!getPayoffSeason(current)) {
  assert.ok(waiting, "this league year without lines says it's waiting");
  assert.ok(waiting!.previous == null || waiting!.previous < current, "points back to a finished season");
  assert.equal(getPlayerPayoff(getPayoffSeason(waiting!.previous)?.players[0]?.nbaId, current), null, "no carrying last season's line forward");
} else {
  assert.equal(waiting, null, "a season with lines isn't waiting");
}
for (const season of seasons) if (season !== current) assert.equal(payoffWaiting(season), null, `${season} never waits`);
assert.equal(getPayoffSeason("1999-00"), null, "a season with no lines is null, not another season");

assert.equal(getPlayerPayoff(null), null);
assert.equal(getPlayerPayoff("no-such-player"), null);
assert.equal(getTeamPayoff("no-such-team"), null);

console.log(`salary payoff ok · ${seasons.map((s) => `${s} ${getPayoffSeason(s)!.meta.kind}`).join(", ")}`);
