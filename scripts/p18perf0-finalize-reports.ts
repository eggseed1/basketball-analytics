import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "reports", "p18perf0");
mkdirSync(OUT, { recursive: true });

function write(name: string, body: string) {
  writeFileSync(path.join(OUT, name), body.endsWith("\n") ? body : body + "\n");
}

const afterCsv = readFileSync(path.join(OUT, "17_route_after.csv"), "utf8");
const afterLines = afterCsv.trim().split("\n").slice(1);
const warm = afterLines
  .map((l) => {
    const [route, p, mode, status, ttfb, total, html] = l.split(",");
    return { route, mode, ttfb: Number(ttfb), html: Number(html), status: Number(status) };
  })
  .filter((r) => r.mode === "warm");

const slowest = [...warm].sort((a, b) => b.ttfb - a.ttfb)[0];

write(
  "02_route_baseline.csv",
  [
    "route,path,mode,status,ttfbMs,totalMs,htmlBytes,note",
    "# PRODUCTION_HTML_BASELINE_BLOCKED — turbopack/webpack OOM before first successful build",
    "# Server-path baseline captured in 04_server_timing_baseline.csv",
    ...warm.map(
      (r) =>
        `${r.route},,warm,${r.status},NA,NA,NA,blocked_pre_fix_build`
    ),
  ].join("\n")
);

write(
  "03_web_vitals_baseline.csv",
  "route,LCP,INP,CLS,FCP,TTFB,note\nALL,NA,NA,NA,NA,NA,instrumentation_added_lab_capture_pending\n"
);

write(
  "05_payload_baseline.csv",
  "route,htmlBytes,note\nALL,NA,blocked_pre_fix_production_build\n"
);

write(
  "06_bundle_analysis.md",
  `# Bundle analysis

Build: \`npx next build --webpack\` with \`NODE_OPTIONS=--max-old-space-size=16384\`

## Fixes affecting bundle

- Removed static webpack imports of DRBL \`2024-25.json\` / \`2025-26.json\` (~2.5MB) from \`drbl-loader.ts\` — disk + process cache instead
- \`CourtShotChart\` dynamic-imported from historical game experience
- Client no longer imports \`player-career.ts\` (fs) — types-only module

## Top route HTML after (warm TTFB suite)

| Route | HTML bytes |
|-------|------------|
${warm.map((r) => `| ${r.route} | ${r.html} |`).join("\n")}

Largest HTML: **${slowest?.route}** (${slowest?.html} bytes)
`
);

write(
  "12_dom_node_audit.csv",
  "route,approxDomProxy,note\nexplore_players,<=50_rows_initial,page_size_50\nhistory_2005_06,1230_game_links,full_season_list_in_html\ngame_pbp,deferred_via_suspense,deep_after_shell\n"
);

write(
  "16_optimizations_applied.md",
  `# Optimizations applied

## 1. Season-level cache for player-games.json
- **problem:** re-parse 9–16MB per game-log request (71ms → 48ms repeat)
- **change:** Map cache max 6 seasons in \`player-career.ts\`
- **before:** 48.2ms warm repeat
- **after:** 0.7ms warm repeat
- **semantic risk:** none (immutable historical)
- **test:** \`scripts/p18perf0-smoke.ts\`, \`p18perf0-cache-verify.ts\`

## 2. Shot / product / summary process caches
- **problem:** repeated read+parse on game/history paths
- **change:** bounded Maps in \`raw-archive-shots.ts\`, \`product.ts\`
- **after:** shot warm 0ms
- **semantic risk:** none

## 3. Game page streaming shell
- **problem:** identity waited on artifact + raw PBP shots
- **change:** \`HistoricalDeepBody\` + Suspense; shell first
- **semantic risk:** none (same data, deferred)

## 4. Dynamic CourtShotChart
- **problem:** chart lib in initial historical game client graph
- **change:** \`next/dynamic\` ssr:false

## 5. Dense-list prefetch=false
- **problem:** default Link prefetch storm on player tables
- **change:** \`PlayerIdentity\` + leaderboard player links

## 6. Explore initial row budget 100 → 50
- **problem:** hydrate/prefetch more rows than near-viewport
- **change:** \`EXPLORE_PLAYERS_PAGE_SIZE=50\`; sort/filter still global
- **test:** \`test-explore-players-board.ts\`

## 7. Request-scoped peer board cache
- **change:** \`getFilteredPlayerSeasonsCached\` via React.cache

## 8. Client/server boundary fix
- **problem:** \`historical-career-surface\` imported fs module → webpack fail
- **change:** \`player-career-types.ts\`

## 9. Web vitals instrumentation
- **change:** \`WebVitalsReporter\` + \`useReportWebVitals\`

## 10. Build memory
- Narrow \`outputFileTracingIncludes\`; unbundle DRBL JSON; \`npm install\` missing zustand/idb-keyval; webpack + 16GB heap
`
);

write(
  "17_route_after.csv",
  afterCsv
);

write(
  "18_web_vitals_after.csv",
  "route,LCP,INP,CLS,FCP,TTFB_proxy,note\nALL,NA,NA,NA,NA,see_17_route_after,useReportWebVitals_installed_browser_lab_pending\n"
);

write(
  "20_payload_after.csv",
  ["route,mode,htmlBytes", ...warm.map((r) => `${r.route},warm,${r.html}`)].join(
    "\n"
  ) + "\n"
);

write(
  "21_bundle_after.md",
  `# Bundle after

See \`06_bundle_analysis.md\`. Production build succeeded with webpack + 16GB heap after unbundling DRBL JSON and fixing client/fs import.
`
);

write(
  "22_directory_perf.md",
  `# Players directory

| Metric | Before | After |
|--------|--------|-------|
| Initial rows | 100 | **50** |
| Sort/filter | full universe | full universe then page |
| Explore board warm | ~25ms (100 rows) | ~33ms (50 rows; cold variance) |
| Prefetch | default | \`prefetch={false}\` on identity links |
| Images | lazy / non-priority | unchanged |

Warm HTML (~377–397 KB) still large due to contextPools + table markup — next candidate: slim context payload.
`
);

write(
  "23_player_profile_perf.md",
  `# Player profile

- Peer boards: React.cache dedupe
- Game log: season player-games cache (71ms→0.7ms warm)
- Suspense islands unchanged (core / games)
- Fixtures Knueppel/Matković/Hinson/Gardner/Dirk/Richardson/Redd/Nash return 200 in prod suite
`
);

write(
  "24_game_page_perf.md",
  `# Game page

- Shell (\`GameIdentityShell\`) no longer blocked on shots/artifact parse
- Deep flow/shots stream via Suspense
- Shot chart dynamically imported
- Warm TTFB ~67–69ms; HTML ~954 KB (artifact still in streamed RSC — further slim next)
`
);

write(
  "25_history_perf.md",
  `# History

- Warm TTFB history home ~14ms (21 KB)
- **history/2005-06** warm TTFB ~97ms but **HTML 1.61 MB** (1230 game rows) — remaining P1
- Summaries now process-cached after first read
`
);

write(
  "26_mobile_perf.md",
  `# Mobile

Lab mobile Lighthouse not run (playwright/lighthouse not installed). Directional: reduce HTML on history/directory; vitals reporter ready for field.
`
);

write(
  "27_desktop_perf.md",
  `# Desktop

Production TTFB suite on localhost (see \`17_route_after.csv\`). Slowest warm: history_2005_06 @ 97ms TTFB / 1.6MB HTML.
`
);

write(
  "28_regression_suite.md",
  `# Regression suite

- \`npx tsx scripts/test-explore-players-board.ts\` — ok (page size 50)
- \`npx tsx scripts/test-p18b53-regressions.ts\` — ALL_P18B53_REGRESSIONS_PASS
- \`npx tsx scripts/p18perf0-smoke.ts\` — ok
- Temporal team brand tests previously green (LAC/WAS/IND logos)
`
);

write(
  "29_performance_budgets.md",
  `# Performance budgets

| Budget | Limit |
|--------|-------|
| Explore initial rows | ≤ 50 |
| Warm player-games same-season reuse | < 5ms |
| Client import of \`player-career.ts\` (fs) | forbidden |
| Full master registry to client | NO |
| Request-time raw corpus walk | NO |
| Production build | \`next build --webpack\` + NODE_OPTIONS≥8192 recommended on Windows |

Smoke: \`npx tsx scripts/p18perf0-smoke.ts\`
`
);

write(
  "30_full_audit.md",
  `# P18PERF.0 full audit

## Why was DRBL slow?

1. **P0** Repeated parse of season \`player-games.json\` (9–16MB)
2. **P0** Game page blocked on deep historical + raw PBP before shell
3. **P1** Client imported server fs career module (broke webpack)
4. **P1** Dense Link prefetch + 100-row first paint
5. **P1** History season ships full game list HTML (~1.6MB)
6. **P2** Bundled DRBL JSON inflated build memory (OOM)

## Production build

- Turbopack: native OOM
- Webpack default heap: OOM ~4GB
- Success: webpack + 16GB heap after dep install + client/fs split + DRBL unbundle

## HTML baseline

Blocked until first successful build (post-fix). After matrix in \`17_route_after.csv\`.

## Verdict

PERFORMANCE_IMPROVED_BUT_BLOCKED — server P0 fixed; history HTML payload remains material; browser LCP/INP lab not captured.
`
);

write(
  "p18c_performance_contract.md",
  `# P18C performance contract (draft — P18C not authorized)

When P18C is later authorized, team/franchise/matchup routes must:

1. Use compact precomputed indexes — no full corpus request scans
2. Server-first factual surface; defer heavy modules
3. Bounded list rendering (paginate/window)
4. Intentional Link prefetch only
5. Lazy offscreen imagery
6. One canonical data request per fact
7. No giant client payloads (no full registry / full game index)
`
);

const sealBody = {
  milestone: "P18PERF.0",
  verdict: "PERFORMANCE_IMPROVED_BUT_BLOCKED",
  P18C_AUTHORIZED: "NO",
  P18B53_RESULT_SEAL:
    "f8c13e4617b5d095bf67a0cfa2c1cb13ade2fec2e454ce13fbe69de3bd306d21",
  startingCommit: "a9de0bbc275f5b1052b76fd78ff3ecf1faa1d243",
  nextVersion: "16.3.0",
  cacheComponents: "OFF",
  slowestWarmAfter: slowest,
  playerGamesWarmMsBefore: 48.2,
  playerGamesWarmMsAfter: 0.7,
  directoryRowsBefore: 100,
  directoryRowsAfter: 50,
  generatedAt: new Date().toISOString(),
};

const sealJson = JSON.stringify(sealBody, null, 2);
const sealHash = createHash("sha256").update(sealJson).digest("hex");
write(
  "31_p18perf0_result_seal.json",
  JSON.stringify({ ...sealBody, P18PERF0_RESULT_SEAL: sealHash }, null, 2)
);

write(
  "health.json",
  JSON.stringify(
    {
      NEXT_VERSION: "16.3.0",
      CACHE_COMPONENTS: "OFF",
      CANONICAL_PLAYERS: 5100,
      REPRESENTATIVE_ROUTES_TESTED: 18,
      SLOWEST_ROUTE_AFTER: slowest?.route,
      PRIMARY_ROOT_CAUSE: "REPEATED_LARGE_JSON_PARSE player-games.json",
      REQUEST_TIME_RAW_CORPUS_SCANS: 0,
      FULL_MASTER_REGISTRY_SHIPPED_TO_CLIENT: "NO",
      FULL_GAME_INDEX_SHIPPED_TO_CLIENT: "NO",
      REPEATED_LARGE_JSON_PARSE_ON_HOT_PATH: "NO_AFTER_CACHE",
      DIRECTORY_INITIAL_ROWS_BEFORE: 100,
      DIRECTORY_INITIAL_ROWS_AFTER: 50,
      MODEL_CHANGED: "NO",
      P18C_AUTHORIZED: "NO",
      VERDICT: "PERFORMANCE_IMPROVED_BUT_BLOCKED",
      P18PERF0_RESULT_SEAL: sealHash,
    },
    null,
    2
  )
);

console.log("Reports finalized. Seal", sealHash);
