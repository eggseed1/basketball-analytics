/**
 * Continuity helpers — transition-aware URL updates must not blank UI.
 * Run: npx tsx scripts/test-ui-continuity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function main() {
  const root = join(process.cwd());

  // Explore players must NOT remount Suspense on every query via key={boardKey}.
  const playersPage = readFileSync(
    join(root, "src/app/explore/players/page.tsx"),
    "utf8"
  );
  assert.equal(
    /key=\{boardKey\}/.test(playersPage),
    false,
    "Explore Players Suspense must not use boardKey remount"
  );
  assert.ok(
    playersPage.includes("ExplorePlayersClientShell"),
    "Explore Players uses shared QueryNav shell"
  );
  assert.ok(
    playersPage.includes("No remount key") ||
      playersPage.includes("already-revealed"),
    "Documents continuity intent"
  );

  const historyPage = readFileSync(
    join(root, "src/app/history/page.tsx"),
    "utf8"
  );
  assert.ok(
    historyPage.includes("HistorySnapshotLoader"),
    "History snapshot loads in Suspense island"
  );
  assert.ok(
    historyPage.includes("HistoryClientShell"),
    "History uses QueryNav shell"
  );
  assert.equal(
    /key=\{[^}]*season/.test(historyPage),
    false,
    "History must not key Suspense on season"
  );

  const queryNav = readFileSync(
    join(root, "src/components/continuity/query-nav.tsx"),
    "utf8"
  );
  assert.ok(queryNav.includes("startTransition"));
  assert.ok(queryNav.includes("QueryUpdatingChrome"));
  assert.ok(queryNav.includes("TransitionLink"));
  assert.ok(queryNav.includes("replaceHref"));
  assert.ok(
    queryNav.includes("useRouteTransitionOptional"),
    "QueryNav integrates RouteTransitionProvider"
  );

  const routeTransition = readFileSync(
    join(root, "src/components/continuity/route-transition.tsx"),
    "utf8"
  );
  assert.ok(routeTransition.includes("RouteTransitionProvider"));

  const shell = readFileSync(
    join(root, "src/components/sports/sports-shell.tsx"),
    "utf8"
  );
  assert.ok(
    shell.includes("RouteTransitionProvider"),
    "Site shell stays mounted with route transition chrome"
  );

  const askView = readFileSync(
    join(root, "src/components/ask/ask-drbl-view.tsx"),
    "utf8"
  );
  assert.ok(
    askView.includes("staleResult") && askView.includes("displayResult"),
    "ASK keeps prior result during pending queries"
  );

  const gamefeed = readFileSync(
    join(root, "src/components/sports/gamefeed.tsx"),
    "utf8"
  );
  assert.ok(
    gamefeed.includes("QueryNavProvider") &&
      gamefeed.includes("TransitionLink"),
    "Scores Gamefeed uses transition-aware navigation"
  );

  const offseasonPage = readFileSync(
    join(root, "src/app/offseason/page.tsx"),
    "utf8"
  );
  assert.ok(
    offseasonPage.includes("OffseasonClientShell"),
    "Offseason uses QueryNav shell"
  );

  const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
  assert.ok(globals.includes("query-updating-bar"));
  assert.ok(globals.includes('[data-updating="true"]'));

  console.log("test-ui-continuity: ok");
}

main();
