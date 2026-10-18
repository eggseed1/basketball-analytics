/**
 * Run: npx tsx --test src/ask-agent/ask-agent.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAskAgent, type AskAgentEvent } from "./agent";
import type { AskAgentEnv, D1Database, KvNamespace } from "./env";
import { checkGrounding } from "./grounding";
import { reviewMeasure } from "./measure";
import { presentAskAnswer } from "./present";
import { askAgentSystemPrompt } from "./prompt";
import { nameKeyOf } from "./schema";
import { guardSql, SQL_ROW_LIMIT } from "./sql-guard";

test("the prompt asks for a measure before a shape-of-game query", () => {
  const prompt = askAgentSystemPrompt("2026-10-16");
  assert.match(prompt, /call set_measure before run_sql/);
  assert.match(prompt, /Never rank by the minimum of those three/);
  assert.match(prompt, /0\.12 is 0\.12, not 12%/);
});

test("a complete-game plan has to use the DARKO ends", () => {
  const question = "Who is the most interchangeable player, with no holes, in any system?";
  const rejected = reviewMeasure(question, {
    claim: "Highest floor of the DRBL components",
    level: "drbl_per100",
    hole: "min of drbl offense, defense, and playmaking",
    rejected: "box score",
  });
  assert.equal(rejected.ok, false);
  const accepted = reviewMeasure(question, {
    claim: "The best player whose weaker end is still well above average",
    level: "impact_ratings.total",
    hole: "the weaker of impact_ratings.offense and impact_ratings.defense",
    rejected: "A DRBL floor can stay high for a specialist",
  });
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.match(accepted.guidance, /several players/);
});

test("guardSql wraps a single SELECT with a row cap", () => {
  const out = guardSql("SELECT name FROM players WHERE team = 'DEN';");
  assert.deepEqual(out, {
    ok: true,
    sql: `SELECT * FROM (SELECT name FROM players WHERE team = 'DEN') LIMIT ${SQL_ROW_LIMIT + 1}`,
  });
  assert.equal(guardSql("WITH t AS (SELECT 1 AS x) SELECT x FROM t").ok, true);
  assert.equal(guardSql("SELECT replace(name, '.', '') FROM players").ok, true);
  assert.equal(guardSql("SELECT * FROM transactions WHERE description LIKE '%; delete%'").ok, true);
});

test("guardSql refuses writes, stacked statements, comments and system tables", () => {
  for (const sql of [
    "DELETE FROM players",
    "SELECT 1; DROP TABLE players",
    "SELECT 1 -- hi",
    "SELECT 1 /* hi */",
    "PRAGMA table_info(players)",
    "SELECT * FROM sqlite_master",
    "SELECT * FROM _cf_KV",
    "WITH x AS (SELECT 1) INSERT INTO players SELECT * FROM x",
    "",
    `SELECT '${"a".repeat(4001)}'`,
  ]) {
    assert.equal(guardSql(sql).ok, false, sql);
  }
});

test("presentAskAnswer hides the query and keeps the sentence", () => {
  const raw =
    "OKC has 15.66 WAR, the most of any team【" +
    '{"sql":"SELECT team_id, SUM(wins_above_r1) as total_war FROM drbl_ratings","purpose":"Top 5"}' +
    "】. Shai leads them.";
  const out = presentAskAnswer(raw);
  assert.equal(out.includes("sql"), false);
  assert.equal(out.includes("team_id"), false);
  assert.equal(out.includes("【"), false);
  assert.match(out, /^OKC has 15\.66 WAR, the most of any team\. Shai leads them\.$/);
});

test("nameKeyOf strips accents, punctuation and suffixes", () => {
  assert.equal(nameKeyOf("Nikola Jokić"), "nikola jokic");
  assert.equal(nameKeyOf("Shai Gilgeous-Alexander"), nameKeyOf("shai gilgeous alexander"));
  assert.equal(nameKeyOf("Jaren Jackson Jr."), "jaren jackson");
  assert.equal(nameKeyOf("Gary Payton II"), "gary payton");
});

test("checkGrounding matches rounding and unit changes", () => {
  const rows = [{ ts_pct: 0.6634, pts: 29.64, salary: 143481000, total: 7.342 }];
  const answer = "He shot 66.3% (.663) on 29.6 points, earns $143.5M and posts a 7.34 DARKO in 2024-25.";
  assert.deepEqual(checkGrounding(answer, rows), { checked: 5, unmatched: [] });
  assert.deepEqual(checkGrounding("about $143.5 million", rows), { checked: 1, unmatched: [] });
});

test("checkGrounding flags invented numbers and accepts the question's own figures", () => {
  const rows = [{ pts: 29.6 }];
  assert.deepEqual(checkGrounding("He averaged 31.2 points.", rows).unmatched, ["31.2"]);
  assert.deepEqual(checkGrounding("Among 20-point scorers in 2024‑25, 29.6.", rows, "at least 20 points").unmatched, []);
  assert.deepEqual(checkGrounding("Top 5 since 1996.", rows), { checked: 0, unmatched: [] });
  assert.deepEqual(checkGrounding("29.6 DRBL per 100 (per-100, 29.6 pts/100)", rows).unmatched, []);
});

function memoryKv(): KvNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  } as KvNamespace;
}

function fakeDb(rows: Record<string, unknown>[]): D1Database {
  return {
    prepare: () => ({
      bind() {
        return this;
      },
      all: async () => ({ results: rows }),
    }),
  } as unknown as D1Database;
}

function scriptedModel(replies: unknown[]) {
  const calls: unknown[] = [];
  return {
    calls,
    ai: {
      async run(_model: string, input: Record<string, unknown>) {
        calls.push(input);
        return replies.shift();
      },
    },
  };
}

const toolCallReply = (args: string, name = "run_sql") => ({
  choices: [
    {
      finish_reason: "tool_calls",
      message: {
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name, arguments: args } }],
      },
    },
  ],
  usage: { neurons: 10 },
});
const answerReply = (content: string, finish = "stop") => ({
  choices: [{ finish_reason: finish, message: { content } }],
  usage: { neurons: 5 },
});

async function collect(env: AskAgentEnv, question: string): Promise<AskAgentEvent[]> {
  const events: AskAgentEvent[] = [];
  await runAskAgent({ question, history: [], env, emit: (e) => events.push(e), today: "2026-10-12" });
  return events;
}

test("agent runs a tool, answers, links players and records usage", async () => {
  const model = scriptedModel([
    toolCallReply(JSON.stringify({ sql: "SELECT name, espn_id, pts FROM player_seasons", purpose: "Top scorer" })),
    answerReply("Nikola Jokić averaged 29.6 points in 2024‑25."),
  ]);
  const env: AskAgentEnv = {
    AI: model.ai,
    ASK_DB: fakeDb([{ name: "Nikola Jokić", espn_id: "3112335", pts: 29.6 }]),
    PAGE_CACHE: memoryKv(),
  };
  const events = await collect(env, "Who scored most?");
  assert.deepEqual(
    events.map((e) => e.type),
    ["step", "step_done", "answer", "usage"]
  );
  const answer = events.find((e) => e.type === "answer");
  assert.ok(answer && answer.type === "answer");
  assert.equal(answer.text, "Nikola Jokić averaged 29.6 points in 2024-25.");
  assert.deepEqual(answer.links, [{ label: "Nikola Jokić", href: "/players/3112335" }]);
  assert.deepEqual(answer.grounding.unmatched, []);
  assert.equal((model.calls[0] as { max_tokens?: number }).max_tokens, 2048);
  const usage = events.at(-1);
  assert.ok(usage && usage.type === "usage");
  assert.equal(usage.neurons, 15);
});

test("agent retries a cut-off or garbled reply instead of showing it", async () => {
  const model = scriptedModel([
    toolCallReply('{"sql": "SELECT name FROM pla'),
    answerReply("<|start|>assistant<|channel|>commentary"),
    answerReply("No data on that."),
  ]);
  const events = await collect({ AI: model.ai, ASK_DB: fakeDb([]), PAGE_CACHE: memoryKv() }, "Anything?");
  const answer = events.find((e) => e.type === "answer");
  assert.ok(answer && answer.type === "answer");
  assert.equal(answer.text, "No data on that.");
  assert.equal(events.filter((e) => e.type === "step").length, 0);
});

test("a shape-of-game question cannot query until the measure is accepted", async () => {
  let queries = 0;
  const db = fakeDb([{ name: "Giannis Antetokounmpo", total: 6.5 }]);
  const inner = db.prepare.bind(db);
  db.prepare = () => {
    queries += 1;
    return inner();
  };
  const model = scriptedModel([
    toolCallReply(JSON.stringify({ sql: "SELECT MIN(offense, defense, playmaking) FROM drbl_ratings", purpose: "Lowest component" })),
    toolCallReply(
      JSON.stringify({
        claim: "Best player whose weaker end stays high",
        level: "impact_ratings.total",
        hole: "weaker of impact_ratings.offense and impact_ratings.defense",
        rejected: "DRBL component floor",
      }),
      "set_measure"
    ),
    toolCallReply(JSON.stringify({ sql: "SELECT name, total FROM impact_ratings", purpose: "Weaker end" })),
    answerReply("Giannis holds up on both ends. Jokic is the best player on the list."),
  ]);
  const events = await collect(
    { AI: model.ai, ASK_DB: db, PAGE_CACHE: memoryKv() },
    "Who has no holes and would fit any coaching system?"
  );
  const steps = events.filter((e) => e.type === "step_done");
  assert.equal(steps[0]?.type, "step_done");
  if (steps[0]?.type === "step_done") {
    assert.equal(steps[0].ok, false);
    assert.equal(steps[0].summary, "Need a measure first");
  }
  assert.equal(steps[1]?.type, "step_done");
  if (steps[1]?.type === "step_done") assert.equal(steps[1].summary, "Measure set");
  assert.equal(queries, 1);
  const answer = events.find((e) => e.type === "answer");
  assert.ok(answer && answer.type === "answer");
  assert.match(answer.text, /Giannis/);
});

test("agent answers from the rows it has once it runs out of steps", async () => {
  const tool = toolCallReply(JSON.stringify({ sql: "SELECT 1", purpose: "Another lookup" }));
  const model = scriptedModel([
    tool,
    tool,
    tool,
    tool,
    tool,
    tool,
    tool,
    answerReply("Victor Wembanyama has the highest floor of the three skills in 2025-26."),
  ]);
  const events = await collect(
    { AI: model.ai, ASK_DB: fakeDb([{ name: "Victor Wembanyama" }]), PAGE_CACHE: memoryKv() },
    "Who is the most interchangeable?"
  );
  const answer = events.find((e) => e.type === "answer");
  assert.ok(answer && answer.type === "answer");
  assert.match(answer.text, /Victor Wembanyama/);
  assert.equal(events.some((e) => e.type === "error"), false);
  const last = model.calls.at(-1) as { tools?: unknown; messages: Array<{ content?: string }> };
  assert.equal(last.tools, undefined);
  assert.match(last.messages.at(-1)?.content ?? "", /Stop querying/);
});

test("agent stops before calling the model once the daily cap is used", async () => {
  const kv = memoryKv();
  const day = new Date().toISOString().slice(0, 10);
  await kv.put(`ask-agent:neurons:${day}`, "5000");
  const model = scriptedModel([]);
  const events = await collect({ AI: model.ai, PAGE_CACHE: kv }, "Hi");
  assert.equal(events[0]?.type, "error");
  assert.equal(model.calls.length, 0);
});
