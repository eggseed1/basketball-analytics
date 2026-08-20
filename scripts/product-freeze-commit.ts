/**
 * PRODUCT.FREEZE commit orchestrator — stages coherent groups and commits.
 * Run from repo root on product/freeze-p18 with dirty worktree intact.
 */
import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "product-freeze");
mkdirSync(OUT, { recursive: true });

function sh(cmd: string, opts?: { allowFail?: boolean }) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (e: unknown) {
    if (opts?.allowFail) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return (err.stdout || err.stderr || err.message || "").toString();
    }
    throw e;
  }
}

function add(paths: string[]) {
  const existing = paths.filter((p) => existsSync(path.join(ROOT, p)));
  if (!existing.length) return 0;
  // batch to avoid command line limits
  const chunk = 40;
  for (let i = 0; i < existing.length; i += chunk) {
    const part = existing.slice(i, i + chunk);
    sh(`git add -- ${part.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(" ")}`);
  }
  return existing.length;
}

function commit(subject: string, body: string) {
  const staged = sh("git diff --cached --name-only");
  if (!staged) {
    console.log("SKIP empty:", subject);
    return null;
  }
  const msg = `${subject}\n\n${body}`;
  // write message file to avoid shell quoting issues
  const msgPath = path.join(OUT, "_commit_msg.txt");
  writeFileSync(msgPath, msg);
  sh(`git commit -F "${msgPath}"`);
  const sha = sh("git rev-parse HEAD");
  const stat = sh("git show --stat --format= --oneline -1");
  const files = staged.split(/\n/).filter(Boolean);
  appendFileSync(
    path.join(OUT, "13_commit_manifest.csv"),
    `${sha},${JSON.stringify(subject)},${files.length},"${stat.split("\n").pop()?.replace(/"/g, "'") || ""}"\n`
  );
  console.log("COMMIT", sha.slice(0, 7), subject, "files=", files.length);
  return { sha, files: files.length, subject };
}

// Initialize manifest
writeFileSync(
  path.join(OUT, "13_commit_manifest.csv"),
  "sha,subject,files,stat_summary\n"
);

const commits: Array<{ sha: string; files: number; subject: string }> = [];

// --- GROUP 1: Identity / history foundation ---
add([
  "src/data/history/player-universe.ts",
  "src/data/history/player-career.ts",
  "src/data/history/player-career-types.ts",
  "src/data/history/player-game-log.ts",
  "src/data/history/product.ts",
  "src/data/history/types.ts",
  "src/data/history/raw-archive-box.ts",
  "src/data/history/raw-archive-shots.ts",
  "src/data/identity/franchise-registry.ts",
  "src/data/identity/team-search.ts",
  "src/lib/player-page-contract.ts",
  "src/lib/player-destination.ts",
  "src/lib/historical-team-brand.ts",
  "src/lib/nba-brand.ts",
  "src/data/providers/historical/season-range.ts",
  "src/app/api/players/directory/route.ts",
  "src/app/api/players/search/route.ts",
  "src/app/api/search/route.ts",
]);
{
  const c = commit(
    "product: freeze historical and current player identity foundation",
    "Durably commit P18 player-universe / history loaders, franchise registry hooks, and destination identity contracts used by the validated product."
  );
  if (c) commits.push(c);
}

// --- GROUP 2: Media ---
add([
  "src/data/media/get-player-media.ts",
  "src/data/media/player-media.ts",
  "src/data/media/portrait-lookup-store.ts",
  "src/data/media/portrait-lookup.json",
  "src/data/media/sync-player-media.ts",
  "src/lib/player-media-resolve.ts",
  "src/components/brand/player-headshot.tsx",
  "src/components/player/player-headshot.tsx",
]);
{
  const c = commit(
    "product: freeze player media and temporal identity presentation",
    "Canonical media resolver/presentation paths and headshot consumers. No provider CDN URL construction in UI."
  );
  if (c) commits.push(c);
}

// --- GROUP 3: Performance / history surfaces ---
add([
  "src/data/queries/request-cache.ts",
  "src/components/system/web-vitals-reporter.tsx",
  "src/app/layout.tsx",
  "next.config.ts",
  "src/app/api/history/product/route.ts",
  "src/app/history/[season]/page.tsx",
  "src/components/history/historical-game-experience.tsx",
  "src/components/history/historical-game-surface.tsx",
  "src/lib/history/capabilities.ts",
  "src/lib/history/history-season-page.ts",
  "src/lib/history/performers.ts",
  "src/lib/history/score-flow.ts",
  "src/components/time-machine/time-machine-landing.tsx",
]);
{
  const c = commit(
    "perf: freeze bounded historical rendering and data access",
    "History season paging surfaces, request caches, web-vitals instrumentation, and related layout/config needed for P18PERF budgets."
  );
  if (c) commits.push(c);
}

// --- GROUP 4: Teams / franchises / matchups / games ---
add([
  "src/data/history/team-matchup-index.ts",
  "src/app/teams/[teamId]/vs/[oppId]/page.tsx",
  "src/components/teams/franchise-timeline.tsx",
  "src/components/teams/team-matchup-preview.tsx",
  "src/components/teams/team-games-log.tsx",
  "src/components/teams/team-games-island.tsx",
  "src/components/teams/team-games-section.tsx",
  "src/components/teams/team-roster-island.tsx",
  "src/components/teams/team-page-nav.tsx",
  "src/app/franchises/[id]/page.tsx",
  "src/app/teams/[teamId]/page.tsx",
  "src/app/games/[gameId]/page.tsx",
  "src/components/games/game-unavailable.tsx",
  "src/components/games/game-identity-shell.tsx",
  "src/components/games/game-lab-view.tsx",
  "src/lib/game-presentation.ts",
  "src/lib/game-flow/resolve-score-timeline.ts",
  "src/analytics/game-lab.ts",
  "src/data/queries/game-lab.ts",
  "src/data/queries/games.ts",
  "src/data/queries/explore-players-board.ts",
  "src/app/explore/players/page.tsx",
  "src/components/explore/leaderboard-row-context.tsx",
  "src/components/explore/player-season-table.tsx",
  "scripts/test-explore-players-board.ts",
  "scripts/test-historical-team-brand.ts",
]);
{
  const c = commit(
    "product: add historical teams, franchises, and matchup history",
    "Team/franchise/matchup routes and game presentation integrity surfaces from P18C, plus related explore/query wiring."
  );
  if (c) commits.push(c);
}

// --- GROUP 5: Player statistical platform ---
add([
  "src/app/players/[playerId]/page.tsx",
  "src/components/players/historical-career-surface.tsx",
  "src/components/players/player-depth-nav.tsx",
  "src/components/players/player-depth-visuals.tsx",
  "src/components/players/player-game-log-table.tsx",
  "src/components/players/player-stat-depth-island.tsx",
  "src/components/players/player-core-island.tsx",
  "src/components/players/player-career-resume.tsx",
  "src/components/players/player-destination-identity.tsx",
  "src/components/players/player-games-island.tsx",
  "src/components/players/player-identity.tsx",
  "src/components/players/player-season-explorer.tsx",
  "src/components/shots/court-shot-chart.tsx",
  "src/lib/player-game-advanced-registry.ts",
  "src/lib/player-game-analytics.ts",
  "src/lib/shots/court-geometry.ts",
  "src/lib/shots/run-shot-link.ts",
  "src/lib/shots/shot-events.ts",
  "src/data/queries/players.ts",
  "src/data/providers/nba-data-provider.ts",
  "src/data/providers/nba/drbl-loader.ts",
  "src/data/providers/nba/season.ts",
  "src/data/transformers/balldontlie.ts",
]);
{
  const c = commit(
    "product: build deep player statistics and visualization platform",
    "P18C.1 player depth tabs, game analytics registries, shot chart primitives, and player page wiring — visualization contracts without independent Per36 math."
  );
  if (c) commits.push(c);
}

// --- GROUP 6: Minutes / career integrity ---
add([
  "src/lib/parse-basketball-minutes.ts",
  "src/data/history/player-season-totals.ts",
  "src/data/history/player-season-shots.ts",
  "src/components/players/player-career-season-table.tsx",
  "src/components/players/player-season-court-chart.tsx",
]);
{
  const c = commit(
    "fix: normalize player season minutes and derived stat rates",
    "Canonical parseBasketballMinutes handles ISO-8601 durations (PT37M15.00S) and MM:SS. Career Per36/rates derive from PlayerSeasonTotals grain; court chart uses offline shot index loader. Fixes Trae 2020+ null Per36 and 2019-20 inflated rates."
  );
  if (c) commits.push(c);
}

// --- GROUP 7: Front office ---
add([
  "data/cba/league-cap-seasons.json",
  "data/front-office/v1/manifest.json",
  "data/front-office/v1/snapshot.json",
  "data/front-office/v1/sync-diff.json",
  // skip previous-snapshot.json duplicate bulk if large — include for sync contract
  "data/front-office/v1/previous-snapshot.json",
  ...Array.from({ length: 30 }, (_, i) => `data/front-office/v1/teams/${i + 1}.json`),
  "src/data/types/front-office.ts",
  "src/data/front-office/load-team-front-office.ts",
  "src/lib/format-money.ts",
  "src/app/teams/[teamId]/payroll/page.tsx",
  "src/app/teams/[teamId]/draft-assets/page.tsx",
  "src/components/teams/team-payroll-view.tsx",
  "src/components/teams/team-draft-assets-view.tsx",
  "src/components/teams/team-front-office-island.tsx",
  "src/components/teams/team-front-office-summary.tsx",
  "src/components/teams/payroll-commitments-chart.tsx",
  "src/components/teams/payroll-contract-timeline.tsx",
  "scripts/sync-team-front-office.ts",
]);
{
  const c = commit(
    "product: add partial team payroll and front-office capability contracts",
    "Payroll & Contracts is PARTIAL (single-season salary commitments; options/guarantees UNKNOWN). Draft Assets schema/IA ready but DATA BLOCKED_SOURCE_REQUIRED — UI shows Unavailable, never false zero. No Cap Space invention. Cap thresholds OFFICIAL 2025-26 from NBA Communications."
  );
  if (c) commits.push(c);
}

// --- GROUP 8: Generators + permanent tests ---
const scripts = sh(
  'git ls-files --others --exclude-standard "scripts/p18*" "scripts/test-p18*" "scripts/sync-team-front-office.ts"'
)
  .split(/\n/)
  .filter(Boolean);
add(scripts);
{
  const c = commit(
    "test: freeze P18 product generators and regression scripts",
    "Milestone generators, sync tooling, and permanent P18 regression scripts needed to reproduce validated artifacts and firewalls."
  );
  if (c) commits.push(c);
}

// Anything product remaining?
const remain = sh(
  "git status --short"
)
  .split(/\n/)
  .filter(Boolean)
  .filter((l) => !l.includes("reports/"))
  .filter((l) => !l.includes("data/raw/"))
  .filter((l) => !l.includes("data/drbl/raw"))
  .filter((l) => !l.includes("scripts/merge0"))
  .filter((l) => !l.includes("scripts/_dbg"))
  .filter((l) => !l.includes("scripts/product-freeze"))
  .filter((l) => !l.includes("product-freeze"));

writeFileSync(
  path.join(OUT, "_remaining_after_planned_commits.txt"),
  remain.join("\n") + "\n"
);
console.log("REMAINING_PRODUCTISH", remain.length);
console.log(remain.slice(0, 40).join("\n"));

writeFileSync(
  path.join(OUT, "_commits.json"),
  JSON.stringify({ commits, tip: sh("git rev-parse HEAD") }, null, 2)
);
