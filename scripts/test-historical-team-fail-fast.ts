/**
 * Historical team destination must fail fast — never multi-minute provider waits.
 * Run: npx tsx scripts/test-historical-team-fail-fast.ts
 *
 * Provider mode: ESPN NBADataProvider is constructed inside getTeamRoster /
 * getTeamSeasonBoard. This test does not use getDataProvider() and must not
 * silently pass against LocalDataProvider sample rows (slug ids like "okc").
 */
import assert from "node:assert/strict";

import {
  getTeamSeasonBoard,
  isTeamSeasonBoardSupported,
  TEAM_SEASON_BOARD_EARLIEST_SEASON,
} from "../src/data/queries/team-seasons";
import {
  getTeamSeasonEvidence,
  TEAM_SEASON_EVIDENCE_BUDGET_MS,
} from "../src/data/queries/team-season-evidence";
import {
  getTeamRoster,
  isTeamRosterBoardSupported,
  TEAM_ROSTER_BOARD_EARLIEST_START_YEAR,
} from "../src/data/queries/players";
import { getTeamAssets } from "../src/data/queries/team-assets";
import { clearEspnCache } from "../src/data/providers/nba/espn-client";
import { resolveTeamIdentityFallback } from "../src/lib/team-destination";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";

async function main() {
  // Pre-ESPN floor: no network, instant unsupported.
  assert.equal(isTeamSeasonBoardSupported("1978-79"), false);
  assert.equal(isTeamSeasonBoardSupported(TEAM_SEASON_BOARD_EARLIEST_SEASON), true);
  assert.equal(isTeamSeasonBoardSupported("2024-25"), true);

  assert.equal(isTeamRosterBoardSupported("1978-79"), false);
  assert.equal(isTeamRosterBoardSupported("1995-96"), false);
  assert.equal(isTeamRosterBoardSupported("1999-00"), false);
  assert.equal(
    isTeamRosterBoardSupported(
      `${TEAM_ROSTER_BOARD_EARLIEST_START_YEAR}-${String(
        TEAM_ROSTER_BOARD_EARLIEST_START_YEAR + 1
      ).slice(2)}`
    ),
    true
  );
  assert.equal(isTeamRosterBoardSupported("2024-25"), true);

  clearEspnCache();
  const t0 = Date.now();
  const board1978 = await getTeamSeasonBoard("1978-79");
  const boardMs = Date.now() - t0;
  assert.equal(board1978.status, "unsupported");
  assert.ok(board1978.rows.length === 0);
  assert.ok(board1978.warning?.includes("Historical team metrics unavailable"));
  assert.ok(board1978.error?.includes("unsupported_before_"));
  assert.ok(
    boardMs < 200,
    `1978-79 board must be instant skip, got ${boardMs}ms`
  );

  // Identity still authoritative without board.
  const identity = resolveTeamIdentityFallback("25", "1978-79", "era");
  assert.ok(identity);
  assert.equal(identity!.fullName, "Seattle SuperSonics");
  assert.equal(identity!.abbreviation, "SEA");
  const brand = resolveHistoricalTeamBrand("25", "1978-79", "era");
  assert.ok(brand);
  assert.equal(brand!.displayName, "Seattle SuperSonics");
  assert.notEqual(brand!.abbreviation, "OKC");

  // Roster / assets: instant unsupported — never ESPN athlete board.
  const tr = Date.now();
  const roster1978 = await getTeamRoster("25", "1978-79", { minimumGames: 10 });
  const rosterMs = Date.now() - tr;
  assert.equal(roster1978.status, "unsupported");
  assert.equal(roster1978.players.length, 0);
  assert.ok(
    roster1978.warning?.includes("Historical roster data unavailable")
  );
  assert.ok(rosterMs < 200, `1978 roster must be instant, got ${rosterMs}ms`);

  const ta = Date.now();
  const assets1978 = await getTeamAssets({
    teamId: "25",
    abbreviation: "OKC",
    season: "1978-79",
    minimumGames: 10,
  });
  const assetsMs = Date.now() - ta;
  assert.equal(assets1978.playerBoardStatus, "unsupported");
  assert.equal(assets1978.players.length, 0);
  assert.ok(
    assets1978.warning?.includes("Historical player assets unavailable")
  );
  const playersCat = assets1978.categories.find((c) => c.id === "players");
  assert.equal(playersCat?.availability, "unsupported");
  assert.ok(assetsMs < 200, `1978 assets must be instant, got ${assetsMs}ms`);

  // 1995-96 New Jersey — identity preserved; no modern Brooklyn roster.
  const njIdentity = resolveTeamIdentityFallback("17", "1995-96", "era");
  assert.ok(njIdentity);
  assert.match(njIdentity!.fullName, /New Jersey Nets/i);
  const njRoster = await getTeamRoster("17", "1995-96", { minimumGames: 10 });
  assert.equal(njRoster.status, "unsupported");
  assert.equal(njRoster.players.length, 0);

  // Games / evidence: local archive only — no BDL rediscovery.
  const {
    getSeasonGamesArchive,
    getTeamSeasonGames,
  } = await import("../src/data/queries/games");

  const arch1978 = await getSeasonGamesArchive("1978-79");
  assert.equal(arch1978.source, "unavailable");
  assert.equal(arch1978.games.length, 0);

  const tg1978 = Date.now();
  const games1978 = await getTeamSeasonGames({
    teamId: "25",
    season: "1978-79",
    abbreviation: "SEA",
  });
  const gamesMs = Date.now() - tg1978;
  assert.equal(games1978.source, "unavailable");
  assert.equal(games1978.games.length, 0);
  assert.ok(
    games1978.warning && /Historical game archive unavailable|unavailable/i.test(games1978.warning)
  );
  assert.ok(gamesMs < 200, `1978 games must skip BDL, got ${gamesMs}ms`);

  const te = Date.now();
  const evidence = await getTeamSeasonEvidence({
    teamId: "25",
    season: "1978-79",
    abbreviation: "SEA",
    fullName: "Seattle SuperSonics",
  });
  const evidenceMs = Date.now() - te;
  assert.ok(evidenceMs < 200, `1978 evidence must be instant, got ${evidenceMs}ms`);
  assert.equal(evidence.games.length, 0);
  assert.ok(
    evidence.error && /Historical evidence unavailable/i.test(evidence.error),
    `expected honest evidence error, got ${evidence.error}`
  );

  // Cached historical season: disk archive → Seattle games, no remote crawl.
  const arch1996 = await getSeasonGamesArchive("1996-97");
  assert.equal(arch1996.source, "disk_cache");
  assert.ok(arch1996.games.length >= 1000);

  const t96 = Date.now();
  const games1996 = await getTeamSeasonGames({
    teamId: "25",
    season: "1996-97",
    abbreviation: "SEA",
  });
  const games1996Ms = Date.now() - t96;
  assert.equal(games1996.source, "disk_cache");
  assert.ok(
    games1996.games.length >= 70,
    `expected Sonics slate, got ${games1996.games.length}`
  );
  assert.ok(
    games1996.games.every(
      (g) =>
        g.homeTeamId === "25" ||
        g.awayTeamId === "25" ||
        (g.homeTeamAbbr ?? "").toUpperCase() === "SEA" ||
        (g.awayTeamAbbr ?? "").toUpperCase() === "SEA"
    ),
    "1996 games must be Seattle-scoped (not Portland BDL 25 collision)"
  );
  assert.ok(games1996Ms < 500, `1996 archive games must be fast, got ${games1996Ms}ms`);

  const ev1996 = await getTeamSeasonEvidence({
    teamId: "25",
    season: "1996-97",
    abbreviation: "SEA",
    fullName: "Seattle SuperSonics",
  });
  assert.ok(!ev1996.error, ev1996.error ?? "expected evidence from cache");
  assert.ok(ev1996.games.length >= 1);
  assert.match(ev1996.subject.fullName, /Seattle SuperSonics/i);

  // Current-season board + roster still works (live ESPN).
  clearEspnCache();
  const modern = await getTeamSeasonBoard("2024-25");
  assert.equal(modern.status, "ok");
  assert.ok(
    modern.rows.length >= 25,
    `expected full board, got ${modern.rows.length}`
  );
  const okc = modern.rows.find(
    (t) => t.teamId === "25" || t.abbreviation === "OKC"
  );
  assert.ok(okc, "2024-25 OKC present on ESPN board");
  assert.match(okc!.fullName, /Thunder|Oklahoma/i);

  const modernRoster = await getTeamRoster("25", "2024-25", {
    minimumGames: 10,
  });
  assert.equal(modernRoster.status, "ok");
  assert.ok(
    modernRoster.players.length >= 5,
    `expected OKC roster rows, got ${modernRoster.players.length}`
  );
  assert.ok(
    modernRoster.players.every((p) => p.season === "2024-25"),
    "modern roster must not mix seasons"
  );
  assert.ok(
    modernRoster.players.every((p) => p.teamId === "25"),
    "2024-25 roster must be canonical ESPN OKC (25), not PHX (21) or sample slug okc"
  );
  assert.ok(
    modernRoster.players.every((p) => /^\d+$/.test(p.playerId)),
    "ESPN roster player ids are numeric athlete ids, not local sample slugs"
  );

  const modernAssets = await getTeamAssets({
    teamId: "25",
    abbreviation: "OKC",
    season: "2024-25",
    minimumGames: 10,
  });
  assert.equal(modernAssets.playerBoardStatus, "ok");
  assert.ok(modernAssets.players.length >= 5);

  assert.ok(TEAM_SEASON_EVIDENCE_BUDGET_MS <= 10_000);

  console.log("test-historical-team-fail-fast: ok", {
    boardMs,
    rosterMs,
    assetsMs,
    gamesMs,
    evidenceMs,
    games1996Ms,
    modernRows: modern.rows.length,
    modernRoster: modernRoster.players.length,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
