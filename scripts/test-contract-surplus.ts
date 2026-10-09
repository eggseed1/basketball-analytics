import assert from "node:assert/strict";

import {
  getContractSurplusMeta,
  getPlayerSurplusRows,
  getTeamSurplusRows,
} from "@/data/queries/contract-surplus";
import {
  parseTeamSurplusSpan,
  playerSurplusRankingHref,
  TEAM_SURPLUS_SPANS,
  teamSurplusRankingHref,
  teamSurplusSpanParam,
} from "@/lib/contract-surplus";

const players = getPlayerSurplusRows();
const teams = getTeamSurplusRows();
const meta = getContractSurplusMeta();

assert.equal(players.length, meta.contracts, "every valued contract is ranked");
players.forEach((p, i) => {
  assert.equal(p.rank, i + 1, `${p.name} rank is contiguous`);
  if (i) assert.ok(players[i - 1].surplus >= p.surplus, "players sorted by surplus");
  // The middle is an average and the range is 10th to 90th percentile, so option-heavy deals can sit just outside it.
  assert.ok(p.surplusLow <= p.surplusHigh, `${p.name} range is ordered`);
  assert.ok(p.name && p.name !== p.brefId, `${p.brefId} has a name`);
});
assert.equal(new Set(players.map((p) => p.brefId)).size, players.length, "one row per player");

assert.equal(teams.length, 30, "all 30 teams ranked");
teams.forEach((t, i) => {
  assert.equal(t.spans.total.rank, i + 1, `${t.teamKey} rank is contiguous`);
  const own = players.filter((p) => p.teamId === t.teamId);
  const sum = own.reduce((s, p) => s + p.surplus, 0);
  assert.equal(t.spans.total.surplus, sum, `${t.teamKey} total matches its player rows`);
  assert.equal(t.spans.total.contracts, own.length, `${t.teamKey} counts every valued contract`);
  for (const span of TEAM_SURPLUS_SPANS) {
    const s = t.spans[span];
    assert.ok(s.best && s.best.surplus >= (s.worst?.surplus ?? -Infinity), `${t.teamKey} ${span} best is above worst`);
  }
  const perSeason = own.reduce((s, p) => {
    const seasons = Number(p.lastSeason.slice(0, 4)) - Number(p.firstSeason.slice(0, 4)) + 1;
    return s + p.surplus / seasons;
  }, 0);
  assert.ok(Math.abs(t.spans.perSeason.surplus - perSeason) < 1, `${t.teamKey} per season divides by seasons left`);
});
for (const span of TEAM_SURPLUS_SPANS) {
  const ranks = teams.map((t) => t.spans[span].rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 30 }, (_, i) => i + 1), `${span} ranks run 1 to 30`);
}
// The price of a win is set from what the league paid, so one season nets out near zero.
const capSeasonNet = teams.reduce((s, t) => s + t.spans.capSeason.surplus, 0);
const capSeasonSalary = teams.reduce((s, t) => s + t.spans.capSeason.salary, 0);
assert.ok(Math.abs(capSeasonNet) < 0.05 * capSeasonSalary, "the coming season is close to even league-wide");
assert.equal(teams.filter((t) => t.conference === "East").length, 15, "15 East teams");

assert.equal(parseTeamSurplusSpan(null), "total");
for (const span of TEAM_SURPLUS_SPANS) {
  assert.equal(parseTeamSurplusSpan(teamSurplusSpanParam(span)), span, `${span} round-trips through the URL`);
}

assert.equal(teamSurplusRankingHref("okc"), "/standings/visualizations?view=surplus&team=OKC");
assert.equal(teamSurplusRankingHref(null), "/standings/visualizations?view=surplus");
assert.equal(playerSurplusRankingHref("3136193"), "/explore/players/visualizations?view=surplus&pin=3136193");

console.log(`contract surplus: ${players.length} contracts, ${teams.length} teams ok`);
