import assert from "node:assert/strict";

import {
  getContractSurplusMeta,
  getPlayerSurplusRows,
  getTeamSurplusRows,
} from "@/data/queries/contract-surplus";
import { playerSurplusRankingHref, teamSurplusRankingHref } from "@/lib/contract-surplus";

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
  assert.equal(t.rank, i + 1, `${t.teamKey} rank is contiguous`);
  const sum = players.filter((p) => p.teamId === t.teamId).reduce((s, p) => s + p.surplus, 0);
  assert.equal(t.surplus, sum, `${t.teamKey} total matches its player rows`);
  assert.ok(t.best && t.best.surplus >= (t.worst?.surplus ?? -Infinity), `${t.teamKey} best is above worst`);
});
assert.equal(teams.filter((t) => t.conference === "East").length, 15, "15 East teams");

assert.equal(teamSurplusRankingHref("okc"), "/standings/visualizations?view=surplus&team=OKC");
assert.equal(teamSurplusRankingHref(null), "/standings/visualizations?view=surplus");
assert.equal(playerSurplusRankingHref("3136193"), "/explore/players/visualizations?view=surplus&pin=3136193");

console.log(`contract surplus: ${players.length} contracts, ${teams.length} teams ok`);
