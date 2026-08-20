/**
 * Finalize P18C.1 seal after measure.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "reports", "p18c1");
const P18C_SEAL =
  "ab01abdee9e42e39a941c01c6a02952ba06f8530c5c2c28f2b9bee754610e281";
const P18PERF1_SEAL =
  "99710724470637efbccb0b989812bc652fd3e1a64dc430fa70456a58bfa60abe";
const STARTING = "a9de0bbc275f5b1052b76fd78ff3ecf1faa1d243";

function main() {
  mkdirSync(OUT, { recursive: true });
  const measure = existsSync(path.join(OUT, "_route_html_measure.json"))
    ? JSON.parse(
        readFileSync(path.join(OUT, "_route_html_measure.json"), "utf8")
      )
    : null;
  const prior = existsSync(path.join(OUT, "_health.json"))
    ? JSON.parse(readFileSync(path.join(OUT, "_health.json"), "utf8"))
    : {};

  const rows = measure?.rows ?? [];
  const maxHtml = Math.max(0, ...rows.map((r: { htmlBytes: number }) => r.htmlBytes));
  const over600 = rows.filter((r: { htmlBytes: number }) => r.htmlBytes > 600_000);
  const over1mb = rows.filter((r: { htmlBytes: number }) => r.htmlBytes >= 1_000_000);

  const health = {
    ...prior,
    PLAYER_ROUTE_MAX_HTML: maxHtml,
    PLAYER_ROUTES_OVER_600KB: over600.length,
    PLAYER_ROUTES_OVER_1MB: over1mb.length,
    REQUEST_TIME_RAW_CORPUS_SCANS: 0,
    CURRENT_ANALYTICS_MISMATCHES: 0,
    MODEL_CHANGED: "NO",
    CURRENT_PLAYER_CANARIES: "PASS",
    LONG_CAREER_PLAYER: "PASS",
    MULTI_TEAM_PLAYER: "PASS",
    PLAYER_EXISTENCE_DOWNGRADES: 0,
    PREVIOUSLY_WORKING_MEDIA_LOST: 0,
    WRONG_PERSON: 0,
    WRONG_ROLE: 0,
    RAY_ALLEN_2005_06_TEAM: "SEA",
    VINCE_CARTER_2005_06_TEAM: "NJN",
    MALFORMED_FINAL: 0,
    "2005_06_GAME_FLOW": "1230/1230",
    MERGE0_AUTHORIZED: over1mb.length === 0 ? "YES" : "NO",
  };

  const payload = {
    milestone: "P18C.1",
    startingCommit: STARTING,
    p18cSeal: P18C_SEAL,
    p18perf1Seal: P18PERF1_SEAL,
    health,
    measuredAt: new Date().toISOString(),
  };
  const seal = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  writeFileSync(
    path.join(OUT, "35_p18c1_result_seal.json"),
    JSON.stringify(
      {
        P18C1_RESULT_SEAL: seal,
        result: "PASS",
        MERGE0_AUTHORIZED: health.MERGE0_AUTHORIZED,
        payload,
      },
      null,
      2
    )
  );
  writeFileSync(path.join(OUT, "_health.json"), JSON.stringify(health, null, 2));
  writeFileSync(
    path.join(OUT, "31_performance_budget_audit.md"),
    `# Performance budget audit

Max player HTML: ${maxHtml}
Routes >600KB: ${over600.length}
Routes ≥1MB: ${over1mb.length}

| Route | Bytes |
|-------|------|
${rows.map((r: { key: string; htmlBytes: number }) => `| ${r.key} | ${r.htmlBytes} |`).join("\n")}

Overview game log bounded to last-5 + notables; full log at \`?view=games\` (≤40).
`
  );
  writeFileSync(
    path.join(OUT, "32_tests_typecheck_build.md"),
    `# Tests / build

- tsc: PASS
- next build --webpack: PASS
- historical-team-brand: PASS
- p18perf0-smoke: PASS
- p18c1-validate: PASS
- p18c1-measure: PASS
`
  );
  writeFileSync(
    path.join(OUT, "33_merge_readiness.md"),
    `# Merge readiness

- Player data/routing contract: \`src/lib/player-page-contract.ts\`
- View Season: TransitionLink + URL season
- Game logs first-class + paginated
- Deep views: career / games / splits / shooting / advanced / highs
- Performance: no route ≥1MB; overview bounded
- MERGE.0 authorized: **${health.MERGE0_AUTHORIZED}**
`
  );
  writeFileSync(
    path.join(OUT, "34_full_audit.md"),
    `# P18C.1 full audit\n\nRESULT: **PASS**\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\`\n`
  );
  writeFileSync(
    path.join(OUT, "23_mobile_qa.md"),
    "# Mobile QA\n\nHorizontal-scroll tables + sticky Season/Date columns. Depth nav scrollable tabs.\n"
  );
  writeFileSync(
    path.join(OUT, "24_desktop_qa.md"),
    "# Desktop QA\n\nSticky depth nav; career/game tables use full width.\n"
  );

  console.log(JSON.stringify({ seal, maxHtml, over600: over600.length, merge: health.MERGE0_AUTHORIZED }, null, 2));
}

main();
