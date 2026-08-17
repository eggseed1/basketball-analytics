/**
 * Progressive destination shells — identity outside Suspense, deep islands.
 * Run: npx tsx scripts/test-progressive-destinations.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function main() {
  const root = process.cwd();

  // ——— PLAYER ———
  const playerPage = read("src/app/players/[playerId]/page.tsx");
  assert.ok(
    playerPage.includes("PlayerDestinationIdentity"),
    "Player identity component"
  );
  assert.ok(
    playerPage.includes("PlayerCoreIsland") &&
      playerPage.includes("PlayerGamesIsland"),
    "Player core + games islands"
  );
  assert.ok(
    playerPage.includes("DestinationClientShell"),
    "Player uses QueryNav shell"
  );
  assert.ok(
    playerPage.includes("parseDestinationHistoryArrival"),
    "Player reads history arrival"
  );
  assert.ok(
    playerPage.includes("EraThemeScope"),
    "Player can apply era theme"
  );
  assert.ok(
    playerPage.includes("resolveHistoricalTeamBrand"),
    "Player historical branding"
  );
  // Identity must not be nested inside Suspense with core
  const identityIdx = playerPage.indexOf("PlayerDestinationIdentity");
  const firstSuspense = playerPage.indexOf("<Suspense");
  assert.ok(
    identityIdx > 0 && firstSuspense > identityIdx,
    "Player identity renders before first Suspense"
  );
  assert.equal(
    /key=\{[^}]*season/.test(playerPage),
    false,
    "Player must not key Suspense on season"
  );

  assert.ok(
    existsSync(join(root, "src/components/players/player-destination-identity.tsx"))
  );
  assert.ok(
    existsSync(join(root, "src/components/players/player-core-island.tsx"))
  );
  assert.ok(
    existsSync(join(root, "src/components/players/player-games-island.tsx"))
  );
  assert.ok(existsSync(join(root, "src/lib/player-destination.ts")));

  const playerIdentity = read(
    "src/components/players/player-destination-identity.tsx"
  );
  assert.ok(
    playerIdentity.includes("scroll={false}") ||
      playerIdentity.includes("scroll={false}"),
    "Season chips use scroll false"
  );
  assert.ok(
    playerIdentity.includes("HistoricalTeamMark") ||
      playerIdentity.includes("historicalBrand"),
    "Identity supports historical mark"
  );

  const playerCore = read("src/components/players/player-core-island.tsx");
  assert.ok(
    playerCore.includes("getPlayerSeasonCached") ||
      playerCore.includes("getPlayerSeason"),
    "Core fetches season"
  );
  assert.ok(
    playerCore.includes("PlayerPercentilePanel") ||
      playerCore.includes("PlayerCareerResume"),
    "Core includes deep analytics sections"
  );

  const playerGames = read("src/components/players/player-games-island.tsx");
  assert.ok(
    playerGames.includes("getPlayerGameLogCached") ||
      playerGames.includes("getPlayerGameLog")
  );
  assert.ok(playerGames.includes("PlayerNotableGames"));

  // ——— TEAM ———
  const teamPage = read("src/app/teams/[teamId]/page.tsx");
  assert.ok(teamPage.includes("TeamDestinationIdentity"));
  assert.ok(teamPage.includes("DestinationClientShell"));
  assert.ok(teamPage.includes("parseDestinationHistoryArrival"));
  assert.ok(teamPage.includes("EraThemeScope"));
  assert.ok(teamPage.includes("resolveHistoricalTeamBrand"));
  assert.ok(
    teamPage.includes("getTeamSeasonBoardCached") ||
      teamPage.includes("getTeamSeasonStatsCached"),
    "Team page loads season board via cached query"
  );
  const teamIdentityIdx = teamPage.indexOf("TeamDestinationIdentity");
  const teamSuspense = teamPage.indexOf("<Suspense");
  assert.ok(
    teamIdentityIdx > 0 && teamSuspense > teamIdentityIdx,
    "Team identity before Suspense islands"
  );
  for (const island of [
    "TeamArcIsland",
    "TeamEvidenceIsland",
    "TeamRosterIsland",
    "TeamGamesIsland",
    "TeamTransactionsIsland",
    "TeamAssetsIsland",
  ]) {
    assert.ok(teamPage.includes(island), `Team page includes ${island}`);
  }
  assert.equal(
    /key=\{[^}]*season/.test(teamPage),
    false,
    "Team must not key Suspense on season"
  );

  // ——— HISTORY URLS ———
  const historyUrl = read("src/themes/history-url.ts");
  assert.ok(
    historyUrl.includes('set("from", "history")') &&
      historyUrl.includes("playerFromHistoryHref") &&
      historyUrl.includes("teamFromHistoryHref")
  );
  assert.ok(historyUrl.includes("parseDestinationHistoryArrival"));
  // player/team hrefs must carry from=history
  assert.ok(
    /function playerFromHistoryHref[\s\S]*from", "history"/.test(historyUrl)
  );
  assert.ok(
    /function teamFromHistoryHref[\s\S]*from", "history"/.test(historyUrl)
  );

  const snap = read(
    "src/components/time-machine/time-machine-snapshot.tsx"
  );
  assert.ok(
    snap.includes("playerFromHistoryHref(r.playerId, season, theme)") ||
      /playerFromHistoryHref\([^)]*theme/.test(snap),
    "History player links pass theme"
  );
  assert.ok(
    /teamFromHistoryHref\([^)]*theme/.test(snap),
    "History team links pass theme"
  );

  // ——— GAME STABLE HEADER ———
  const gamePage = read("src/app/games/[gameId]/page.tsx");
  assert.ok(gamePage.includes("GameIdentityShell"));
  assert.ok(gamePage.includes("omitHero"));
  const gameShellIdx = gamePage.indexOf("GameIdentityShell");
  const gameSuspense = gamePage.indexOf("<Suspense");
  assert.ok(
    gameShellIdx > 0 && gameSuspense > gameShellIdx,
    "Stable game header outside Suspense"
  );

  const gameLab = read("src/components/games/game-lab-view.tsx");
  assert.ok(gameLab.includes("omitHero"));
  assert.ok(gameLab.includes("!omitHero"));

  // ——— CACHE ———
  const cache = read("src/data/queries/request-cache.ts");
  assert.ok(cache.includes("getPlayerSeasonCached"));
  assert.ok(cache.includes("getPlayerGameLogCached"));
  assert.ok(
    cache.includes("getTeamSeasonBoardCached") ||
      cache.includes("getTeamSeasonStatsCached"),
    "request-cache exposes team season board cache"
  );
  assert.ok(
    cache.includes("getTeamRosterCached"),
    "request-cache exposes team roster cache for island dedupe"
  );
  assert.ok(
    cache.includes("getTeamSeasonGamesCached") ||
      cache.includes("getSeasonGamesArchiveCached"),
    "request-cache exposes shared season games archive for Games/Evidence"
  );

  assert.ok(existsSync(join(root, "src/lib/team-destination.ts")));
  const teamFallback = read("src/lib/team-destination.ts");
  assert.ok(teamFallback.includes("resolveTeamIdentityFallback"));
  assert.ok(
    teamPage.includes("resolveTeamIdentityFallback") &&
      teamPage.includes("boardAvailable"),
    "Team page uses identity fallback when board missing"
  );

  console.log("test-progressive-destinations: ok");
}

main();
