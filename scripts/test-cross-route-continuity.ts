/**
 * Cross-route navigation continuity - soft nav, loading frames, context.
 * Run: npx tsx scripts/test-cross-route-continuity.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function main() {
  const root = process.cwd();

  // Site shell wraps all routes with RouteTransitionProvider.
  const shell = read("src/components/sports/sports-shell.tsx");
  assert.ok(
    shell.includes("RouteTransitionProvider"),
    "SportsShell must wrap with RouteTransitionProvider"
  );
  assert.ok(
    shell.includes("TransitionLink"),
    "Primary nav uses TransitionLink"
  );

  const routeTransition = read(
    "src/components/continuity/route-transition.tsx"
  );
  assert.ok(routeTransition.includes("startRouteTransition"));
  assert.ok(routeTransition.includes("query-updating-bar"));

  const queryNav = read("src/components/continuity/query-nav.tsx");
  assert.ok(
    queryNav.includes("useRouteTransitionOptional"),
    "QueryNav shares route transition pending"
  );
  assert.ok(
    /scroll\s*=\s*true/.test(queryNav) || queryNav.includes("scroll = true"),
    "TransitionLink defaults scroll true for cross-route"
  );

  // Destination loading frames (not blank spinner pages).
  const loadingRoutes = [
    "src/app/games/[gameId]/loading.tsx",
    "src/app/players/[playerId]/loading.tsx",
    "src/app/teams/[teamId]/loading.tsx",
    "src/app/ask/loading.tsx",
    "src/app/history/loading.tsx",
    "src/app/compare/loading.tsx",
    "src/app/offseason/loading.tsx",
  ];
  for (const rel of loadingRoutes) {
    assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
    const src = read(rel);
    assert.ok(
      src.includes("DestinationLoadingFrame"),
      `${rel} uses DestinationLoadingFrame`
    );
  }

  // High-probability cross-route links use TransitionLink.
  const playerNotable = read(
    "src/components/players/player-notable-games.tsx"
  );
  assert.ok(
    playerNotable.includes("TransitionLink") &&
      playerNotable.includes("/games/"),
    "Player → Game notable links soft-nav"
  );

  const teamGames = read("src/components/teams/team-games-section.tsx");
  assert.ok(
    teamGames.includes("TransitionLink") && teamGames.includes("/games/"),
    "Team → Game links soft-nav"
  );
  assert.ok(
    teamGames.includes("season="),
    "Team → Game preserves season query when available"
  );

  const gameCard = read("src/components/sports/game-score-card.tsx");
  assert.ok(
    gameCard.includes("TransitionLink"),
    "GameScoreCard soft-nav to Game Lab"
  );

  const appLink = read("src/components/ui/app-link.tsx");
  assert.ok(
    appLink.includes("TransitionLink"),
    "AppLink internal path uses TransitionLink"
  );
  assert.ok(appLink.includes('"use client"'));

  // History context preservation helpers unchanged.
  const historyUrl = read("src/themes/history-url.ts");
  assert.ok(historyUrl.includes("gameLabFromHistoryHref"));
  assert.ok(historyUrl.includes('from", "history"') || historyUrl.includes("from=history") || historyUrl.includes('set("from", "history")'));
  assert.ok(historyUrl.includes("playerFromHistoryHref"));
  assert.ok(historyUrl.includes("teamFromHistoryHref"));

  const historySnap = read(
    "src/components/time-machine/time-machine-snapshot.tsx"
  );
  assert.ok(
    historySnap.includes("gameLabFromHistoryHref") &&
      historySnap.includes("TransitionLink"),
    "History → Game preserves from=history via TransitionLink"
  );
  assert.ok(
    historySnap.includes("playerFromHistoryHref"),
    "History → Player preserves season"
  );

  // Progressive game shell + era theme before analysis.
  const gamePage = read("src/app/games/[gameId]/page.tsx");
  assert.ok(
    gamePage.includes("getGameShellCached"),
    "Game page loads shell first"
  );
  assert.ok(gamePage.includes("GameIdentityShell"));
  assert.ok(gamePage.includes("Suspense"));
  assert.ok(
    gamePage.includes("omitHero"),
    "Game Lab deep body omits remounting hero"
  );
  assert.ok(
    gamePage.includes("EraThemeScope"),
    "Historical theme applies before analysis streams"
  );
  assert.ok(
    gamePage.includes("fromHistory") && gamePage.includes("backHref"),
    "Game Lab back preserves history origin"
  );

  const identityShell = read(
    "src/components/games/game-identity-shell.tsx"
  );
  assert.ok(
    identityShell.includes("resolveHistoricalTeamBrand"),
    "Identity shell uses historical brand resolver (no modern flash)"
  );

  // ASK → player season context on entry links.
  const askLinks = read("src/components/players/player-ask-links.tsx");
  assert.ok(
    askLinks.includes("season") && askLinks.includes("TransitionLink"),
    "Player ASK links pass season + soft-nav"
  );

  // Offseason → Team.
  const offseason = read("src/app/offseason/page.tsx");
  assert.ok(
    /TransitionLink[\s\S]*\/teams\//.test(offseason),
    "Offseason → Team uses TransitionLink"
  );

  // Scroll semantics: SmoothScroll resets on pathname (cross-route).
  const smooth = read("src/components/smooth-scroll.tsx");
  assert.ok(smooth.includes("usePathname"));
  assert.ok(smooth.includes("scrollTo(0, 0)"));

  // In-place query nav still scroll:false.
  assert.ok(
    queryNav.includes("scroll: false") ||
      queryNav.includes("scroll: false"),
    "replaceParams keeps scroll false"
  );

  console.log("test-cross-route-continuity: ok");
}

main();
