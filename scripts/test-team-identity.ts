/**
 * Cross-provider team identity + Season Evidence regression.
 * Run: npm run test:team-identity
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
import { TEAM_BRANDS, resolveTeamBrand } from "../src/lib/nba-brand";
import {
  applyGameFilters,
  applyPlayerSeasonFilters,
} from "../src/data/queries/filter-utils";
import { filtersFromSearchParams } from "../src/lib/search-params";
import {
  expandPlayerSeasonTeamMatchIds,
  expandTeamFilterMatchIds,
  normalizeTeamParam,
  offseasonTeamHref,
  playersExploreTeamHref,
  teamMatchIds,
  teamProfileHref,
} from "../src/lib/team-identity";
import {
  ensureGameTeamIdentity,
  gameSideBrandKey,
  normalizeGameTeamSide,
} from "../src/lib/game-team-identity";
import { transformBdlGame } from "../src/data/transformers/balldontlie";
import { transformEspnScheduleEvent } from "../src/data/transformers/espn";
import type { BdlGame } from "../src/data/providers/balldontlie/client";
import type { EspnScheduleEvent } from "../src/data/transformers/espn";

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
  assert.ok(t.providerIds.nba, `${t.abbr} missing nba id`);
  assert.equal(getProviderTeamId("espn", t.canonicalTeamId), t.providerIds.espn);
  assert.equal(getProviderTeamId("bdl", t.canonicalTeamId), t.providerIds.bdl);
  assert.equal(getProviderTeamId("nba", t.canonicalTeamId), t.providerIds.nba);
  assert.equal(
    getCanonicalTeamId("espn", t.providerIds.espn!),
    t.canonicalTeamId
  );
  assert.equal(
    getCanonicalTeamId("bdl", t.providerIds.bdl!),
    t.canonicalTeamId
  );
  assert.equal(
    getCanonicalTeamId("nba", t.providerIds.nba!),
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

console.log("URL / filter normalization…");
{
  const bos = normalizeTeamParam("BOS");
  assert.ok(bos);
  assert.equal(bos!.canonicalTeamId, "2");
  assert.equal(bos!.abbr, "BOS");

  const okc = normalizeTeamParam("25");
  assert.equal(okc!.abbr, "OKC");
  assert.ok(okc!.matchIds.includes("21")); // BDL OKC

  const porViaBdl = normalizeTeamParam("bdl:25");
  assert.equal(porViaBdl!.abbr, "POR");
  assert.equal(porViaBdl!.canonicalTeamId, "22");

  assert.equal(normalizeTeamParam("ALL"), null);
  assert.equal(normalizeTeamParam(""), null);
  assert.equal(normalizeTeamParam("not-a-real-team"), null);

  assert.equal(playersExploreTeamHref("BOS"), "/explore/players?team=2");
  assert.equal(teamProfileHref("okc", "2024-25"), "/teams/25?season=2024-25");
  assert.equal(offseasonTeamHref("DEN"), "/offseason?team=7");

  const fromAbbr = filtersFromSearchParams({ team: "OKC", season: "2024-25" });
  assert.equal(fromAbbr.team, "25");
  assert.equal(fromAbbr.teamAbbr, "OKC");

  const games = [
    game({
      id: "okc-bdl",
      gameDate: "2025-01-15",
      homeTeamId: "21",
      awayTeamId: "2",
      homeTeamAbbr: "OKC",
      awayTeamAbbr: "BOS",
      homeScore: 130,
      awayScore: 100,
    }),
    game({
      id: "por-bdl",
      gameDate: "2025-02-22",
      homeTeamId: "25",
      awayTeamId: "4",
      homeTeamAbbr: "POR",
      awayTeamAbbr: "CHA",
      homeScore: 141,
      awayScore: 88,
    }),
  ];
  const filteredOkc = applyGameFilters(games, fromAbbr);
  assert.equal(filteredOkc.length, 1);
  assert.equal(filteredOkc[0]!.id, "okc-bdl");

  // Provider-scoped BDL id without abbr (Season Evidence style) still exact-matches.
  assert.equal(applyGameFilters(games, { team: "21" }).length, 1);
  assert.equal(applyGameFilters(games, { team: "21" })[0]!.id, "okc-bdl");

  const players = [
    {
      playerId: "1",
      playerName: "A",
      teamId: "25",
      season: "2024-25",
      position: "C",
      minutes: 1000,
      gamesPlayed: 50,
    },
  ] as never;
  assert.equal(
    applyPlayerSeasonFilters(players, filtersFromSearchParams({ team: "OKC" }))
      .length,
    1
  );
  assert.ok(expandTeamFilterMatchIds("25").includes("21"));
  assert.ok(
    !expandPlayerSeasonTeamMatchIds("25").includes("21"),
    "player-season filters must not treat BDL OKC 21 as ESPN PHX"
  );
  assert.ok(expandPlayerSeasonTeamMatchIds("25").includes("25"));
  assert.ok(expandPlayerSeasonTeamMatchIds("25").includes("okc"));

  const mixedBoard = [
    {
      playerId: "phx-star",
      playerName: "PHX",
      teamId: "21",
      season: "2024-25",
      position: "G",
      minutes: 1000,
      gamesPlayed: 50,
    },
    {
      playerId: "okc-espn",
      playerName: "OKC ESPN",
      teamId: "25",
      season: "2024-25",
      position: "G",
      minutes: 1000,
      gamesPlayed: 50,
    },
    {
      playerId: "okc-local",
      playerName: "OKC sample",
      teamId: "okc",
      season: "2024-25",
      position: "G",
      minutes: 1000,
      gamesPlayed: 50,
    },
  ] as never;
  const okcBoard = applyPlayerSeasonFilters(mixedBoard, { team: "25" });
  assert.deepEqual(
    okcBoard.map((row) => row.playerId).sort(),
    ["okc-espn", "okc-local"]
  );
}

console.log("client-safe identity modules must not import Node fs…");
{
  const root = process.cwd();
  for (const rel of [
    "src/lib/team-identity.ts",
    "src/data/identity/team-map.ts",
    "src/lib/game-team-identity.ts",
    "src/lib/transaction-player-link.ts",
    "src/lib/player-season-resolve.ts",
  ]) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.doesNotMatch(src, /node:fs|fs\/promises|from ["']fs["']/);
    assert.doesNotMatch(src, /data\/queries\//);
  }
}

console.log("historical game transforms: BDL → canonical…");
{
  const raw = {
    id: 15908541,
    date: "2025-02-22T00:00:00.000Z",
    season: 2024,
    status: "Final",
    period: 4,
    time: " ",
    postseason: false,
    home_team_score: 141,
    visitor_team_score: 88,
    home_team: {
      id: 25,
      abbreviation: "POR",
      city: "Portland",
      conference: "West",
      division: "Northwest",
      full_name: "Portland Trail Blazers",
      name: "Trail Blazers",
    },
    visitor_team: {
      id: 4,
      abbreviation: "CHA",
      city: "Charlotte",
      conference: "East",
      division: "Southeast",
      full_name: "Charlotte Hornets",
      name: "Hornets",
    },
  } as BdlGame;
  const g = transformBdlGame(raw);
  assert.equal(g.teamIdProvider, "bdl");
  assert.equal(g.homeProviderTeamId, "25");
  assert.equal(g.awayProviderTeamId, "4");
  assert.equal(g.homeTeamId, "22"); // ESPN POR
  assert.equal(g.awayTeamId, "30"); // ESPN CHA
  assert.equal(g.homeTeamAbbr, "POR");
  assert.equal(gameSideBrandKey(g, "home"), "POR");
  assert.notEqual(resolveTeamBrand(gameSideBrandKey(g, "home"))?.abbr, "OKC");
}

console.log("historical game transforms: ESPN → canonical…");
{
  const event = {
    id: "401585814",
    date: "2024-10-22T23:30:00Z",
    status: { type: { name: "STATUS_FINAL", completed: true } },
    competitions: [
      {
        competitors: [
          {
            homeAway: "home",
            id: "25",
            score: "110",
            team: {
              id: "25",
              abbreviation: "OKC",
              displayName: "Oklahoma City Thunder",
            },
          },
          {
            homeAway: "away",
            id: "2",
            score: "95",
            team: {
              id: "2",
              abbreviation: "BOS",
              displayName: "Boston Celtics",
            },
          },
        ],
      },
    ],
  } as EspnScheduleEvent;
  const g = transformEspnScheduleEvent(event, "2024-25");
  assert.ok(g);
  assert.equal(g!.teamIdProvider, "espn");
  assert.equal(g!.homeProviderTeamId, "25");
  assert.equal(g!.homeTeamId, "25");
  assert.equal(g!.homeTeamAbbr, "OKC");
  assert.equal(g!.awayTeamId, "2");
  assert.equal(gameSideBrandKey(g!, "home"), "OKC");
}

console.log("same franchise across providers → same canonical…");
{
  const bdlOkc = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: "21",
    abbr: "OKC",
  });
  const espnOkc = normalizeGameTeamSide({
    provider: "espn",
    providerTeamId: "25",
    abbr: "OKC",
  });
  assert.equal(bdlOkc.resolved, true);
  assert.equal(espnOkc.resolved, true);
  assert.equal(bdlOkc.canonicalTeamId, espnOkc.canonicalTeamId);
  assert.equal(bdlOkc.canonicalTeamId, "25");
}

console.log("abbr-first branding vs bare numeric collision…");
{
  const legacyBdlPor = {
    id: "legacy-por",
    season: "2024-25",
    gameDate: "2025-02-22",
    homeTeamId: "25",
    awayTeamId: "4",
    homeTeamAbbr: "POR",
    awayTeamAbbr: "CHA",
    homeScore: 141,
    awayScore: 88,
    gameType: "regular" as const,
    status: "final" as const,
  };
  assert.equal(gameSideBrandKey(legacyBdlPor, "home"), "POR");
  assert.equal(resolveTeamBrand(gameSideBrandKey(legacyBdlPor, "home"))?.abbr, "POR");

  const noAbbrBdl = ensureGameTeamIdentity(
    {
      ...legacyBdlPor,
      homeTeamAbbr: undefined,
      awayTeamAbbr: undefined,
    },
    "bdl"
  );
  assert.equal(noAbbrBdl.homeTeamId, "22");
  assert.equal(noAbbrBdl.homeProviderTeamId, "25");
  assert.equal(gameSideBrandKey(noAbbrBdl, "home"), "POR");

  // Unsafe guess forbidden: bare ESPN resolve of BDL 25 must not win without provider.
  assert.equal(resolveTeamBrand("25")?.abbr, "OKC");
  assert.notEqual(gameSideBrandKey(noAbbrBdl, "home"), "OKC");
}

console.log("invalid provider id → unresolved, no fabricate…");
{
  const bad = normalizeGameTeamSide({
    provider: "bdl",
    providerTeamId: "99999",
    abbr: undefined,
  });
  assert.equal(bad.resolved, false);
  assert.equal(bad.canonicalTeamId, "99999");
  assert.equal(getCanonicalTeamFromProvider("bdl", "99999"), null);
}

console.log("normalized rows: explore filter OKC ≠ POR…");
{
  const games = [
    game({
      id: "okc-norm",
      gameDate: "2025-01-15",
      homeTeamId: "25",
      awayTeamId: "2",
      homeProviderTeamId: "21",
      awayProviderTeamId: "2",
      teamIdProvider: "bdl",
      homeTeamAbbr: "OKC",
      awayTeamAbbr: "BOS",
      homeScore: 130,
      awayScore: 100,
    }),
    game({
      id: "por-norm",
      gameDate: "2025-02-22",
      homeTeamId: "22",
      awayTeamId: "30",
      homeProviderTeamId: "25",
      awayProviderTeamId: "4",
      teamIdProvider: "bdl",
      homeTeamAbbr: "POR",
      awayTeamAbbr: "CHA",
      homeScore: 141,
      awayScore: 88,
    }),
  ];
  const fromAbbr = filtersFromSearchParams({ team: "OKC", season: "2024-25" });
  const filtered = applyGameFilters(games, fromAbbr);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]!.id, "okc-norm");
  // Bare 21 is canonical ESPN PHX, not BDL OKC. Provider-scoped BDL uses bdl:21.
  assert.equal(applyGameFilters(games, { team: "21" }).length, 0);
  assert.equal(applyGameFilters(games, { team: "bdl:21" }).length, 1);
  assert.equal(applyGameFilters(games, { team: "bdl:21" })[0]!.id, "okc-norm");
  assert.equal(applyGameFilters(games, { team: "22" })[0]!.id, "por-norm");
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
  if (ev.error) {
    console.log(`  (skip OKC evidence assert — ${ev.error})`);
  } else {
    const okc = resolveCanonicalTeam("25");
    assert.equal(okc.status, "resolved");
    if (okc.status === "resolved") {
      assert.deepEqual(ev.subject.matchTeamIds, teamMatchIds(okc.team));
    }
    assert.ok(!ev.games.some((g) => g.gameId === "15908541"));
    for (const card of ev.games) {
      assert.notEqual(card.opponentLabel, "OKC");
    }
  }
  const shell = await getGameShell("15908541");
  if (shell) {
    assert.equal(shell.game.homeTeamAbbr, "POR");
    assert.equal(shell.game.awayTeamAbbr, "CHA");
    // Canonical POR after identity normalization (when provider path applied).
    const ensured = ensureGameTeamIdentity(shell.game, "bdl");
    assert.equal(ensured.homeTeamId, "22");
    assert.equal(ensured.homeProviderTeamId, "25");
    assert.equal(gameSideBrandKey(ensured, "home"), "POR");
  } else {
    console.log("  (skip shell assert — game 15908541 unavailable in this environment)");
  }
  const por = await getTeamSeasonEvidence({
    teamId: "22",
    season: "2024-25",
    abbreviation: "POR",
  });
  if (por.games.length) {
    assert.ok(por.games.some((g) => g.gameId === "15908541"));
  } else {
    console.log("  (skip POR evidence assert — schedule unavailable)");
  }
}

async function runP17_2IdentityExtensions() {
  console.log("NBA Stats TEAM_ID → canonical → brand → route (30/30)…");
  const { isNbaStatsTeamIdFormat } = await import(
    "../src/data/identity/team-map"
  );
  const { teamProfileHref } = await import("../src/lib/team-identity");
  for (const t of teams) {
    const nbaId = t.providerIds.nba!;
    assert.ok(isNbaStatsTeamIdFormat(nbaId), nbaId);
    assert.equal(getCanonicalTeamId("nba", nbaId), t.canonicalTeamId);
    const named = resolveCanonicalTeam(`nba:${nbaId}`);
    assert.equal(named.status, "resolved");
    const bare = resolveCanonicalTeam(nbaId);
    assert.equal(bare.status, "resolved");
    if (bare.status === "resolved") {
      assert.equal(bare.team.canonicalTeamId, t.canonicalTeamId);
    }
    const brand = resolveTeamBrand(t.canonicalTeamId);
    assert.ok(brand, t.abbr);
    assert.equal(brand!.abbr, t.abbr);
    assert.equal(
      teamProfileHref(t.canonicalTeamId),
      `/teams/${t.canonicalTeamId}`
    );
  }
  // Bare short numeric must NOT be treated as NBA.
  assert.equal(isNbaStatsTeamIdFormat("25"), false);
  assert.equal(getCanonicalTeamId("nba", "25"), null);

  console.log("NBA player-season normalize: no raw id leak…");
  const { normalizeNbaPlayerSeasonTeam } = await import(
    "../src/data/transformers/stats-nba"
  );
  const okc = normalizeNbaPlayerSeasonTeam({
    teamId: "1610612760",
    teamAbbreviation: "OKC",
  });
  assert.equal(okc.teamId, "25");
  assert.equal(okc.teamIdProvider, "nba");
  assert.equal(okc.providerTeamId, "1610612760");
  assert.equal(okc.nbaTeamId, "1610612760");
  assert.equal(resolveTeamBrand(okc.teamId)?.abbr, "OKC");
  assert.notEqual(okc.teamId, "1610612760");

  const tot = normalizeNbaPlayerSeasonTeam({
    teamId: "0",
    teamAbbreviation: "TOT",
  });
  assert.equal(tot.teamId, "TOT");
  assert.equal(resolveTeamBrand(tot.teamId), undefined);
}

runP17_2IdentityExtensions()
  .then(() => liveOkcRegression())
  .then(() => {
    console.log("OK — team-identity");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
