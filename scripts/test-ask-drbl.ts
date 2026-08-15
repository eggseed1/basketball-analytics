/**
 * Deterministic ASK DRBL checks (interpret → validate → safety).
 * Run: npx tsx scripts/test-ask-drbl.ts
 */
import assert from "node:assert/strict";

import {
  buildFollowUpLinks,
  buildQueryPlan,
  detectUnsupportedClauses,
  interpretAskQuery,
  metricSeasonAvailability,
  planPartialSupport,
  resolveMetric,
  resolveSeasonPhrases,
  validateBasketballQuery,
} from "../src/query-engine";
import { PLAYER_ALIASES } from "../src/query-engine/entities";

function assertJsonSafe(value: unknown) {
  const json = JSON.stringify(value);
  assert.ok(json);
  JSON.parse(json);
}

// --- Metric resolution ---
{
  assert.equal(resolveMetric("true shooting")?.id, "ts_pct");
  assert.equal(resolveMetric("TS%")?.id, "ts_pct");
  assert.equal(resolveMetric("usage rate")?.id, "usg_pct");
  assert.equal(resolveMetric("points per game")?.id, "ppg");
  assert.equal(resolveMetric("efg%")?.id, "efg_pct");
  assert.equal(
    resolveMetric("point differential", "team_season")?.id,
    "team_diff"
  );
}

// --- Season phrases ---
{
  const { seasons, notes } = resolveSeasonPhrases(
    "last season and 2012-13",
    new Date("2026-08-14T12:00:00Z")
  );
  assert.ok(seasons.includes("2012-13"));
  // Aug 2026 → current season still 2025-26; "last season" → 2024-25
  assert.ok(seasons.includes("2024-25"));
  assert.ok(notes.some((n) => /last season/i.test(n)));
}

// --- Player season + metric ---
{
  const ast = interpretAskQuery("What was LeBron's TS% in 2012-13?");
  assert.equal(ast.operation, "season_stat");
  assert.equal(ast.metricId, "ts_pct");
  assert.deepEqual(ast.when?.seasons, ["2012-13"]);
  assert.equal(ast.entities[0]?.kind, "player");
  assert.ok(!ast.unsupported?.length);
  const withId = {
    ...ast,
    entities: [
      {
        kind: "player" as const,
        id: PLAYER_ALIASES.lebron!.id,
        name: "LeBron James",
      },
    ],
  };
  const v = validateBasketballQuery(withId);
  assert.equal(v.ok, true);
  assertJsonSafe(withId);
  const plan = buildQueryPlan(withId);
  assert.ok(plan.some((r) => r.label === "Player"));
  assert.ok(plan.some((r) => r.label === "Metric" && /true shooting/i.test(r.value)));
  const links = buildFollowUpLinks(withId);
  assert.ok(links.some((l) => /player/i.test(l.label)));
  assert.ok(links.length <= 4);
}

// --- Compare ---
{
  const ast = interpretAskQuery(
    "Compare LeBron's 2008-09 and 2012-13 seasons."
  );
  assert.equal(ast.operation, "season_compare");
  assert.ok(ast.when?.seasons?.includes("2008-09"));
  assert.ok(ast.when?.seasons?.includes("2012-13"));
  const withId = {
    ...ast,
    entities: [
      {
        kind: "player" as const,
        id: PLAYER_ALIASES.lebron!.id,
        name: "LeBron James",
      },
    ],
  };
  const links = buildFollowUpLinks(withId);
  assert.ok(links.some((l) => /comparison/i.test(l.label)));
}

// --- Rank / best season methodology ---
{
  const ast = interpretAskQuery(
    "Rank LeBron's best seasons from 2008-09 through 2015-16."
  );
  assert.equal(ast.operation, "season_rank");
  assert.ok((ast.when?.seasons?.length ?? 0) >= 8);
  assert.ok(
    ast.interpretation.some((l) => /Rank My Seasons/i.test(l))
  );

  const best = interpretAskQuery("What was LeBron's best season?");
  assert.equal(best.operation, "season_rank");
}

// --- Career / peak production ---
{
  const ast = interpretAskQuery("What was LeBron's peak production season?");
  assert.equal(ast.operation, "career_resume");
  assert.ok(ast.interpretation.some((l) => /CPI/i.test(l)));
}

// --- Team ---
{
  const ast = interpretAskQuery(
    "What was Boston's point differential in 2025-26?"
  );
  assert.equal(ast.operation, "team_season_stat");
  assert.equal(ast.metricId, "team_diff");
  assert.equal(ast.entities[0]?.kind, "team");
  assert.ok(ast.entities[0]?.id);
  assert.deepEqual(ast.when?.seasons, ["2025-26"]);
  const links = buildFollowUpLinks(ast);
  assert.ok(links.some((l) => /team/i.test(l.label)));
}

// --- Leaderboard ---
{
  const ast = interpretAskQuery("Who led the NBA in TS% in 2025-26?");
  assert.equal(ast.operation, "leaderboard");
  assert.equal(ast.metricId, "ts_pct");
  const links = buildFollowUpLinks({
    ...ast,
    when: { seasons: ["2025-26"] },
  });
  assert.ok(links.some((l) => /leaderboard/i.test(l.label)));
}

// --- Offseason ---
{
  const ast = interpretAskQuery("What happened to Boston this offseason?");
  assert.equal(ast.operation, "offseason_summary");
  const links = buildFollowUpLinks(ast);
  assert.ok(links.some((l) => /offseason/i.test(l.label)));
}

// --- Unsupported PBP (no silent partial) ---
{
  const q =
    "What is Trey Murphy's FG% inside the college three with less than 6 minutes left in the fourth quarter?";
  const hits = detectUnsupportedClauses(q);
  assert.ok(hits.length >= 1);
  assert.equal(planPartialSupport(q), null);
  const ast = interpretAskQuery(q);
  assert.ok(ast.unsupported?.length);
  assert.ok(!ast.partialSupportedQuery);
  const v = validateBasketballQuery(ast);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, "unsupported");
}

// --- Partial: season + PBP ---
{
  const q =
    "What is Trey Murphy's season FG% and his FG% inside the college three with less than 6 minutes left in Q4?";
  const plan = planPartialSupport(q);
  assert.ok(plan);
  assert.ok(plan!.supportedQuery);
  assert.match(plan!.supportedQuery!, /Field goal/i);
  const ast = interpretAskQuery(q);
  assert.ok(ast.partialSupportedQuery);
  const v = validateBasketballQuery(ast);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, "partial");
}

// --- Vague clutch language ---
{
  const ast = interpretAskQuery("How good was Tatum late in close games?");
  assert.ok(ast.unsupported?.length);
  const v = validateBasketballQuery(ast);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, "ambiguous");
}

// --- Genealogy unsupported ---
{
  const ast = interpretAskQuery("How did Boston end up with Jayson Tatum?");
  assert.ok(ast.unsupported?.length);
  const v = validateBasketballQuery(ast);
  assert.equal(v.ok, false);
}

// --- Coverage: DARKO wrong season ---
{
  const darko = metricSeasonAvailability("darko", "2014-15");
  assert.equal(darko.ok, false);
  if (!darko.ok) assert.match(darko.message, /2014-15/);
  const current = metricSeasonAvailability("darko", "2025-26");
  assert.equal(current.ok, true);
  const lebronOld = metricSeasonAvailability("lebron", "2012-13");
  assert.equal(lebronOld.ok, false);
}

// --- Safety: PBP fields on AST cannot validate ---
{
  const ast = interpretAskQuery("What was Jokic's usage in 2023-24?");
  const poisoned = {
    ...ast,
    entities: [
      { kind: "player" as const, id: "3112335", name: "Nikola Jokic" },
    ],
    where: { zone: "college_three" as const },
    when: { seasons: ["2023-24"], clockMaxSeconds: 360, quarter: 4 },
  };
  const v = validateBasketballQuery(poisoned);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, "unsupported");
}

// --- Ambiguity status + resolved candidate path shape ---
{
  const ast = interpretAskQuery("What was LeBron's TS% in 2012-13?");
  const ambiguous = {
    ...ast,
    entities: [{ kind: "player" as const, id: "", name: "LeBron" }],
    ambiguous: [
      {
        kind: "player" as const,
        query: "LeBron",
        candidates: [
          { id: "1", name: "A", subtitle: "Team · SF" },
          { id: "2", name: "B" },
        ],
      },
    ],
  };
  const v = validateBasketballQuery(ambiguous);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, "ambiguous");

  const resolved = {
    ...ast,
    entities: [
      {
        kind: "player" as const,
        id: PLAYER_ALIASES.lebron!.id,
        name: "LeBron James",
      },
    ],
  };
  assert.equal(validateBasketballQuery(resolved).ok, true);
}

// --- Unknown entity ---
{
  const ast = interpretAskQuery(
    "What was Xyzabcfoobarbaz's TS% in 2012-13?"
  );
  assert.equal(ast.operation, "season_stat");
  const unresolved = {
    ...ast,
    entities: [{ kind: "player" as const, id: "", name: "Xyzabcfoobarbaz" }],
  };
  const v = validateBasketballQuery(unresolved);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.status, "no_result");
}

// --- Game matchup (not leaderboard) ---
{
  const ast = interpretAskQuery(
    "Who led Boston in scoring against Brooklyn?"
  );
  assert.equal(ast.operation, "game_lab");
  assert.equal(ast.entities.filter((e) => e.kind === "team").length, 2);
}

// --- Team entity can be force-resolved (team page deep link shape) ---
{
  const ast = interpretAskQuery(
    "Boston Celtics point differential 2025-26"
  );
  assert.equal(ast.operation, "team_season_stat");
  const forced = {
    ...ast,
    entities: [{ kind: "team" as const, id: "2", name: "BOS" }],
    ambiguous: undefined,
  };
  assert.equal(validateBasketballQuery(forced).ok, true);
}

console.log("test-ask-drbl: all assertions passed");
