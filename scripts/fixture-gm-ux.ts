import { mkdirSync, writeFileSync } from "node:fs";
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise } from "../src/gm/engine/franchise";
import { rosterCount } from "../src/gm/engine/cap";
import { releasePlayer } from "../src/gm/engine/roster-decisions";
import { finishDraftWithAi } from "../src/gm/engine/progression";
import { expandDraftOrder } from "../src/gm/engine/draft-room";
import { advanceSeasonJourney } from "../src/gm/engine/season-flow";
import { emptyFaMarket } from "../src/gm/engine/free-agency";
import type { GmLeagueState, GmOffseasonStage } from "../src/gm/types";

async function main() {
  const dir = process.argv[2] ?? "/tmp/franchise-ux";
  mkdirSync(dir, { recursive: true });
  const rows = (await getBundledBrefPeerBoard("2025-26")).filter(player => player.gamesPlayed >= 5 && player.minutes >= 40 && player.fieldGoalsAttempted > 0);
  const fresh = prepareFranchise(buildLeagueFromPlayerSeasons(rows, { userTeamId: "bos", seasonCanonical: "2025-26", seed: 71 }));
  const write = (name: string, league: GmLeagueState) => writeFileSync(dir + "/" + name + ".json", exportFranchise(league));
  const stage = (id: GmOffseasonStage): GmLeagueState => ({ ...structuredClone(fresh), phase: "offseason", homeFlow: { awardsSeen: true, championSeen: true }, faMarket: { ...emptyFaMarket(71), stage: "fill", done: true }, seasonFlow: { version: 1, season: fresh.season, stage: id, completed: [], contractsRolled: true, deadMoneyRolled: true, progressionApplied: true, staffAged: true } });
  write("regular", fresh);
  write("demo", prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2026, seed: 71 })));
  write("camp", stage("training_camp"));
  let under = stage("roster_check");
  while (rosterCount("bos", under.players) > under.settings.minRoster - 2) {
    const fringe = under.players.filter(player => player.teamId === "bos" && player.contract && player.contract.annualSalaryM >= 1.2).sort((a,b) => (a.sheet?.overall ?? 70) - (b.sheet?.overall ?? 70))[0]!;
    under = releasePlayer(under, fringe.id);
  }
  write("roster-under", under);
  let over = stage("roster_check");
  const additions = over.players.filter(player => player.teamId && player.teamId !== "bos" && player.contract && player.contract.annualSalaryM >= 1.2).slice(0, 6);
  over = { ...over, players: over.players.map(player => additions.some(row => row.id === player.id) ? { ...player, teamId: "bos" } : player) };
  write("roster-over", over);
  const lotteryOrder = fresh.teams.map(team => team.id);
  const drafted = finishDraftWithAi({ ...structuredClone(fresh), phase: "draft", lotteryOrder, draftOrder: expandDraftOrder(lotteryOrder), seasonFlow: { version: 1, season: fresh.season, stage: "draft", completed: [] } });
  const rookies = advanceSeasonJourney(drafted).state;
  write("rookies", rookies);
  let market = stage("free_agency");
  const own = market.players.find(player => player.teamId === "bos" && player.contract)!;
  market = { ...market, phase: "free_agency", faMarket: { ...emptyFaMarket(71), stage: "re_signing" }, players: market.players.map(player => player.id === own.id ? { ...player, teamId: null, contract: null, rightsTeamId: "bos", rightsKind: "bird", lastSalaryM: player.contract?.annualSalaryM, serviceYears: 6 } : player), freeAgents: [...market.freeAgents, own.id] };
  write("own-market", market);
  writeFileSync(dir + "/manifest.json", JSON.stringify({ season: fresh.season, team: "bos", ownPlayerId: own.id, ownPlayerName: own.name, rookieId: rookies.players.find(player => player.teamId === "bos" && player.pendingRookieContract)?.id }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
