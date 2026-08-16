/**
 * ASK DRBL — example pool, rotation, and structured builder tests.
 * Does not change AST semantics; validates that curated examples and
 * builder-composed queries feed the existing interpret → validate pipeline.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASK_EXAMPLE_POOL,
  askExampleDiversityReport,
  displayClassesForSeed,
  hashSeed,
  pickAskExamples,
} from "../src/query-engine/ask-examples";
import {
  askBuilderHref,
  composeAskBuilderQuery,
  defaultAskBuilderState,
  parseAskBuilderParams,
  serializeAskBuilderParams,
  validateAskBuilderState,
} from "../src/query-engine/ask-builder";
import { interpretAskQuery } from "../src/query-engine/interpret";
import { validateBasketballQuery } from "../src/query-engine/validate";

const CLASS_TO_OPS: Record<string, string[]> = {
  player_stat: ["season_stat"],
  team_stat: ["team_season_stat"],
  leaderboard: ["leaderboard"],
  player_compare: ["season_compare"],
  player_rank: ["season_rank"],
  career: ["career_resume"],
  team_compare: ["team_season_compare"],
  team_rank: ["team_season_rank"],
  game: ["game_lab"],
  evidence: ["team_season_game_evidence"],
  offseason: ["offseason_summary"],
};

// --- Pool size ---
{
  assert.ok(
    ASK_EXAMPLE_POOL.length >= 40 && ASK_EXAMPLE_POOL.length <= 80,
    `pool size ${ASK_EXAMPLE_POOL.length} should be 40–80`
  );
}

// --- Every class represented ---
{
  const classes = new Set(ASK_EXAMPLE_POOL.map((e) => e.class));
  for (const cls of Object.keys(CLASS_TO_OPS)) {
    assert.ok(classes.has(cls as never), `missing class ${cls}`);
  }
}

// --- Interpret + validate (no execute — keep page-cheap validation) ---
{
  const failures: string[] = [];
  for (const ex of ASK_EXAMPLE_POOL) {
    const ast = interpretAskQuery(ex.prompt);
    const expected = CLASS_TO_OPS[ex.class] ?? [];
    if (!expected.includes(ast.operation)) {
      failures.push(
        `${ex.id}: expected op in [${expected.join(",")}] got ${ast.operation}`
      );
    }
    if (ast.unsupported?.length) {
      failures.push(`${ex.id}: unsupported ${ast.unsupported.join("; ")}`);
    }
    if (ex.metric && ast.metricId && ex.metric !== ast.metricId) {
      failures.push(
        `${ex.id}: metric expected ${ex.metric} got ${ast.metricId}`
      );
    }
    const v = validateBasketballQuery(ast);
    // Ambiguous entity resolution (empty player id) is OK at validate stage
    // for some prompts; reject only hard unsupported/invalid without path.
    if (!v.ok && v.status === "unsupported") {
      failures.push(`${ex.id}: validate unsupported`);
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
}

// --- Deterministic rotation ---
{
  const a = pickAskExamples("2026-08-15", 8);
  const b = pickAskExamples("2026-08-15", 8);
  assert.deepEqual(
    a.map((x) => x.id),
    b.map((x) => x.id)
  );
  assert.equal(a.length, 8);

  const c = pickAskExamples("2026-08-16", 8);
  const same =
    a.length === c.length && a.every((x, i) => x.id === c[i]?.id);
  assert.equal(same, false, "different day seeds should usually differ");
}

// --- Diversity of a visible strip ---
{
  const picks = pickAskExamples("seed-diversity-check", 8);
  const report = askExampleDiversityReport(picks);
  assert.ok(report.classes.length >= 6, `classes ${report.classes.join(",")}`);
  // No single player more than once in the strip
  const playerHits = picks.flatMap((e) => e.players ?? []);
  const playerCounts = new Map<string, number>();
  for (const p of playerHits) {
    playerCounts.set(p, (playerCounts.get(p) ?? 0) + 1);
  }
  for (const [p, n] of playerCounts) {
    assert.ok(n <= 1, `player ${p} appeared ${n} times`);
  }
  // LeBron / Boston should not dominate a typical strip
  assert.ok((playerCounts.get("lebron") ?? 0) <= 1);
  const bosHits = picks.filter((e) => e.teams?.includes("bos")).length;
  assert.ok(bosHits <= 2, `Boston over-represented (${bosHits})`);
}

// --- Seed-dependent class slots ---
{
  const s0 = displayClassesForSeed(0);
  const s1 = displayClassesForSeed(1);
  assert.ok(s0.includes("player_compare") || s0.includes("team_compare"));
  assert.notDeepEqual(s0, s1);
}

// --- Builder compose → same op as NL ---
{
  const state = {
    ...defaultAskBuilderState(),
    operation: "season_stat" as const,
    playerName: "Nikola Jokic",
    season: "2024-25",
    metricId: "ts_pct" as const,
  };
  const q = composeAskBuilderQuery(state);
  assert.match(q, /Jokic/i);
  assert.match(q, /TS%/i);
  assert.match(q, /2024-25/);
  const ast = interpretAskQuery(q);
  assert.equal(ast.operation, "season_stat");
  assert.equal(ast.metricId, "ts_pct");
}

{
  const state = {
    ...defaultAskBuilderState(),
    operation: "season_rank" as const,
    playerName: "Nikola Jokic",
  };
  const q = composeAskBuilderQuery(state);
  const ast = interpretAskQuery(q);
  assert.equal(ast.operation, "season_rank", q);
}

{
  const state = {
    ...defaultAskBuilderState(),
    operation: "team_season_stat" as const,
    teamAbbr: "DEN",
    season: "2023-24",
    metricId: "team_diff" as const,
  };
  const q = composeAskBuilderQuery(state);
  const ast = interpretAskQuery(q);
  assert.equal(ast.operation, "team_season_stat", q);
  assert.equal(ast.metricId, "team_diff", q);
}

// --- Builder validation ---
{
  const empty = validateAskBuilderState({
    ...defaultAskBuilderState(),
    playerName: "",
    metricId: "ts_pct",
  });
  assert.equal(empty.ok, false);

  const ok = validateAskBuilderState({
    ...defaultAskBuilderState(),
    playerName: "Nikola Jokic",
    season: "2024-25",
    metricId: "ts_pct",
  });
  assert.equal(ok.ok, true);
}

// --- Builder URL round-trip ---
{
  const state = {
    ...defaultAskBuilderState(),
    operation: "season_stat" as const,
    playerName: "Nikola Jokic",
    season: "2024-25",
    metricId: "ts_pct" as const,
  };
  const params = serializeAskBuilderParams(state);
  assert.equal(params.mode, "builder");
  assert.equal(params.player, "Nikola Jokic");
  assert.equal(params.metric, "ts_pct");
  const restored = parseAskBuilderParams(params);
  assert.equal(restored.playerName, "Nikola Jokic");
  assert.equal(restored.season, "2024-25");
  assert.equal(restored.metricId, "ts_pct");
  const href = askBuilderHref(state, true);
  assert.match(href, /mode=builder/);
  assert.match(href, /q=/);
  assert.match(href, /metric=ts_pct/);
}

// --- Result-first contract (layout unit): examples after result in view source ---
{
  const viewPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/components/ask/ask-drbl-view.tsx"
  );
  const view = fs.readFileSync(viewPath, "utf8");
  const resultIdx = view.indexOf("{hasResult && result ?");
  const examplesAfterIdx = view.indexOf("Try another question");
  const examplesBeforeIdx = view.indexOf("Try asking");
  assert.ok(resultIdx > 0);
  assert.ok(examplesBeforeIdx > 0);
  assert.ok(examplesAfterIdx > resultIdx, "post-query examples below result");
  assert.ok(view.includes('id="result"'));
  assert.ok(view.includes("Explore further"));
}

// --- Hash stability ---
{
  assert.equal(hashSeed("abc"), hashSeed("abc"));
  assert.notEqual(hashSeed("abc"), hashSeed("abd"));
}

console.log("test-ask-examples: ok");
console.log(
  `  pool=${ASK_EXAMPLE_POOL.length} sample=${pickAskExamples("2026-08-15", 8)
    .map((e) => e.class)
    .join(",")}`
);
