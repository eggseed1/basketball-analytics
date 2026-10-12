/**
 * Run: npx tsx --test src/ask-agent/ask-agent.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runAskAgent, type AskAgentEvent } from "./agent";
import type { AskAgentEnv, D1Database, KvNamespace } from "./env";
import { checkGrounding } from "./grounding";
import { nameKeyOf } from "./schema";
import { guardSql, SQL_ROW_LIMIT } from "./sql-guard";

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

const toolCallReply = (args: string) => ({
  choices: [
    {
      finish_reason: "tool_calls",
      message: {
        content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "run_sql", arguments: args } }],
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

test("agent stops before calling the model once the daily cap is used", async () => {
  const kv = memoryKv();
  const day = new Date().toISOString().slice(0, 10);
  await kv.put(`ask-agent:neurons:${day}`, "5000");
  const model = scriptedModel([]);
  const events = await collect({ AI: model.ai, PAGE_CACHE: kv }, "Hi");
  assert.equal(events[0]?.type, "error");
  assert.equal(model.calls.length, 0);
});
