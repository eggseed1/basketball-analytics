/**
 * Cross-provider team identity + Season Evidence regression.
 * Run: npm run test:team-identity
 */
import assert from "node:assert/strict";

import {
  BDL_TEAM_ID_BY_ABBR,
  getCanonicalTeamFromProvider,
  getCanonicalTeamId,
  getProviderTeamId,
  listCanonicalTeams,
  listCrossProviderNumericCollisions,
  providerTeamKey,
  resolveCanonicalTeam,
} from "../src/data/identity/team-map";
import { guessGameProvider, providerGameKey } from "../src/data/identity/game-id";
import {
  buildTeamSeasonEvidence,
} from "../src/analytics/season-evidence";
import type { GameSummary } from "../src/data/types";
import { TEAM_BRANDS } from "../src/lib/nba-brand";

function game(
  partial: Partial<GameSummary> &
    Pick<GameSummary, "id" | "gameDate" | "homeScore" | "awayScore">
): GameSummary {
  return {
    season: "2024-25",
    homeTeamId: "2",
    awayTeamId: "21",
    homeTeamAbbr: "BOS",
    awayTeamAbbr: "OKC",
    gameType: "regular",
    status: "final",
    totalPoints: partial.homeScore + partial.awayScore,
    margin: partial.homeScore - partial.awayScore,
    absMargin: Math.abs(partial.homeScore - partial.awayScore),
    ...partial,
  };
}

console.log("canonical map: all 30 teams…");
const teams = listCanonicalTeams();
assert.equal(teams.length, 30);
for (const t of teams) {
  assert.ok(t.providerIds.espn, t.abbr);
  assert.ok(t.providerIds.bdl, t.abbr);
  assert.equal(getProviderTeamId("espn", t.canonicalTeamId), t.providerIds.espn);
  assert.equal(getProviderTeamId("bdl", t.canonicalTeamId), t.providerIds.bdl);
  assert.equal(
    getCanonicalTeamId("espn", t.providerIds.espn!),
    t.canonicalTeamId
  );
  assert.equal(
    getCanonicalTeamId("bdl", t.providerIds.bdl!),
    t.canonicalTeamId
  );
}

console.log("ESPN → canonical OKC…");
assert.equal(getCanonicalTeamId("espn", "25"), "25");
assert.equal(getCanonicalTeamFromProvider("espn", "25")?.abbr, "OKC");
{
  const r = resolveCanonicalTeam("25");
  assert.equal(r.status, "resolved");
  if (r.status === "resolved") assert.equal(r.team.abbr, "OKC");
}

console.log("BDL → canonical POR even when id = ESPN OKC…");
assert.equal(getCanonicalTeamId("bdl", "25"), "22"); // ESPN POR
assert.equal(getCanonicalTeamFromProvider("bdl", "25")?.abbr, "POR");
assert.equal(getCanonicalTeamId("bdl", "21"), "25"); // ESPN OKC
assert.equal(getCanonicalTeamFromProvider("bdl", "21")?.abbr, "OKC");

console.log("namespaced keys are distinct…");
assert.notEqual(providerTeamKey("espn", "25"), providerTeamKey("bdl", "25"));
assert.equal(
  getCanonicalTeamId("espn", "25"),
  TEAM_BRANDS.okc.espnTeamId
);
assert.notEqual(
  getCanonicalTeamId("espn", "25"),
  getCanonicalTeamId("bdl", "25")
);

console.log("collision list includes 25 OKC≠POR…");
const collisions = listCrossProviderNumericCollisions();
assert.ok(collisions.length > 0);
const c25 = collisions.find((c) => c.providerTeamId === "25");
assert.ok(c25);
assert.equal(c25!.espn?.abbr, "OKC");
assert.equal(c25!.bdl?.abbr, "POR");

console.log("unknown provider → unresolved…");
assert.equal(getCanonicalTeamId("pbp", "25"), null);
assert.equal(getProviderTeamId("pbp", "25"), null);
const unk = resolveCanonicalTeam("espn:99999");
assert.equal(unk.status, "unresolved");

console.log("Season Evidence: ESPN 25 must not select BDL POR game…");
{
  const porBlowout = game({
    id: "15908541",
    gameDate: "2025-02-22",
    homeTeamId: "25", // BDL POR
    awayTeamId: "4", // BDL CHA
    homeTeamAbbr: "POR",
    awayTeamAbbr: "CHA",
    homeScore: 141,
    awayScore: 88,
  });
  const okcWin = game({
    id: "okc-real",
    gameDate: "2025-01-15",
    homeTeamId: "21", // BDL OKC
    awayTeamId: "2",
    homeTeamAbbr: "OKC",
    awayTeamAbbr: "BOS",
    homeScore: 130,
    awayScore: 100,
  });

  // Bug reproduction shape: canonical OKC with ESPN id wrongly in matchTeamIds.
  const evidence = buildTeamSeasonEvidence({
    subject: {
      teamId: "25",
      abbreviation: "OKC",
      fullName: "Oklahoma City Thunder",
      matchTeamIds: ["21"], // BDL OKC only
      matchAbbrs: ["OKC"],
    },
    season: "2024-25",
    games: [porBlowout, okcWin],
  });
  assert.ok(!evidence.games.some((g) => g.gameId === "15908541"));
  assert.ok(evidence.games.some((g) => g.gameId === "okc-real"));

  // Abbr-first: even if ESPN 25 is wrongly passed as matchTeamId, POR abbr blocks it.
  const poisoned = buildTeamSeasonEvidence({
    subject: {
      teamId: "25",
      abbreviation: "OKC",
      fullName: "Oklahoma City Thunder",
      matchTeamIds: ["25"], // ESPN OKC / BDL POR collision
      matchAbbrs: ["OKC"],
    },
    season: "2024-25",
    games: [porBlowout, okcWin],
  });
  assert.ok(
    !poisoned.games.some((g) => g.gameId === "15908541"),
    "abbr-first must reject POR when subject is OKC"
  );
  assert.ok(poisoned.games.some((g) => g.gameId === "okc-real"));
}

console.log("game id namespaces…");
assert.equal(guessGameProvider("401585814"), "espn");
assert.equal(guessGameProvider("15908541"), "bdl");
assert.notEqual(
  providerGameKey("espn", "15908541"),
  providerGameKey("bdl", "15908541")
);

console.log("BDL abbr table covers all TEAM_BRANDS…");
for (const abbr of Object.keys(BDL_TEAM_ID_BY_ABBR)) {
  assert.ok(resolveCanonicalTeam(abbr).status === "resolved", abbr);
}

async function liveOkcRegression() {
  console.log("live query: OKC 2024-25 must not include POR shell game…");
  const { getTeamSeasonEvidence } = await import(
    "../src/data/queries/team-season-evidence"
  );
  const { getGameShell } = await import("../src/data/queries/games");
  const ev = await getTeamSeasonEvidence({
    teamId: "25",
    season: "2024-25",
    abbreviation: "OKC",
    fullName: "Oklahoma City Thunder",
  });
  assert.equal(ev.error, null);
  assert.deepEqual(ev.subject.matchTeamIds, ["21"]);
  assert.ok(!ev.games.some((g) => g.gameId === "15908541"));
  for (const card of ev.games) {
    assert.notEqual(card.opponentLabel, "OKC");
  }
  const shell = await getGameShell("15908541");
  assert.ok(shell);
  assert.equal(shell!.game.homeTeamAbbr, "POR");
  assert.equal(shell!.game.awayTeamAbbr, "CHA");
  const por = await getTeamSeasonEvidence({
    teamId: "22",
    season: "2024-25",
    abbreviation: "POR",
  });
  assert.ok(por.games.some((g) => g.gameId === "15908541"));
}

liveOkcRegression()
  .then(() => {
    console.log("OK — team-identity");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
