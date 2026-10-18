import { runAskDrbl } from "@/query-engine";

import type { D1Database } from "./env";
import { needsMeasure, planFromArgs, reviewMeasure } from "./measure";
import type { ToolSpec } from "./model";
import { nameKeyOf } from "./schema";
import { guardSql, SQL_ROW_LIMIT } from "./sql-guard";

export type ToolOutput = {
  ok: boolean;
  /** What the model sees. */
  data: unknown;
  /** One line for the visible trace. */
  summary: string;
  /** The SQL that ran, shown in the trace. */
  sql?: string;
  links?: Array<{ label: string; href: string }>;
};

export type ToolContext = { db?: D1Database; question?: string; measure?: { ready: boolean } };

type Tool = {
  spec: ToolSpec;
  label: (args: Record<string, unknown>) => string;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutput>;
};

const MAX_TOOL_CHARS = 12000;

function noDatabase(): ToolOutput {
  return { ok: false, data: { error: "The database isn't available right now." }, summary: "Database unavailable" };
}

const findPlayer: Tool = {
  spec: {
    type: "function",
    function: {
      name: "find_player",
      description:
        "Look up players by name (partial names and missing accents are fine). Returns ids, latest team and seasons played. Use before other queries when a name might be misspelled or ambiguous.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Player name or part of it" } },
        required: ["name"],
      },
    },
  },
  label: (args) => `Looked up ${String(args.name ?? "a player")}`,
  async run(args, ctx) {
    if (!ctx.db) return noDatabase();
    const key = nameKeyOf(String(args.name ?? ""));
    if (!key) return { ok: false, data: { error: "Give a name." }, summary: "No name given" };
    const { results = [] } = await ctx.db
      .prepare(
        "SELECT name, name_key, espn_id, nba_id, bref_id, team, first_season, last_season FROM players WHERE name_key = ?1 OR name_key LIKE ?2 ORDER BY (name_key = ?1) DESC, last_season DESC LIMIT 8"
      )
      .bind(key, `%${key}%`)
      .all();
    return {
      ok: true,
      data: results,
      summary: results.length ? `${results.length} match${results.length === 1 ? "" : "es"}` : "No match",
      links: results
        .slice(0, 3)
        .filter((r) => r.espn_id)
        .map((r) => ({ label: String(r.name), href: `/players/${r.espn_id}` })),
    };
  },
};

const runSql: Tool = {
  spec: {
    type: "function",
    function: {
      name: "run_sql",
      description: `Run one read-only SQLite SELECT against the DRBL database (tables described in the system prompt). Returns at most ${SQL_ROW_LIMIT} rows. Select only the columns you need and ORDER BY + LIMIT for rankings.`,
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A single SELECT statement" },
          purpose: { type: "string", description: "Short plain-English description of what the query finds" },
        },
        required: ["sql", "purpose"],
      },
    },
  },
  label: (args) => String(args.purpose ?? "Queried the database"),
  async run(args, ctx) {
    if (!ctx.db) return noDatabase();
    if (ctx.question && needsMeasure(ctx.question) && !ctx.measure?.ready) {
      return {
        ok: false,
        data: {
          error:
            "Call set_measure first. Say what would make a player the answer, which column is overall impact, which column is the hole, and which measure you are rejecting.",
        },
        summary: "Need a measure first",
      };
    }
    const raw = String(args.sql ?? "");
    const guarded = guardSql(raw);
    if (!guarded.ok) return { ok: false, data: { error: guarded.error }, summary: guarded.error, sql: raw };
    try {
      const { results = [] } = await ctx.db.prepare(guarded.sql).all();
      const truncated = results.length > SQL_ROW_LIMIT;
      const rows = truncated ? results.slice(0, SQL_ROW_LIMIT) : results;
      return {
        ok: true,
        data: { rows, rowCount: rows.length, truncated },
        summary: `${rows.length}${truncated ? "+" : ""} row${rows.length === 1 ? "" : "s"}`,
        sql: raw,
        links: rows
          .filter((r) => r.espn_id && r.name)
          .slice(0, 5)
          .map((r) => ({ label: String(r.name), href: `/players/${r.espn_id}` })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^D1_ERROR:\s*/, "") : "Query failed";
      return { ok: false, data: { error: message }, summary: message.slice(0, 140), sql: raw };
    }
  },
};

const drblEngine: Tool = {
  spec: {
    type: "function",
    function: {
      name: "drbl_engine",
      description:
        "Ask the site's structured question engine. Best for: player on/off splits, a team's best or worst games, Game Lab box score context, offseason summaries, season-vs-season comparisons, ranking a player's or team's seasons, team season stats, and DRBL glossary questions. Phrase it as one plain question, e.g. 'Jokic on/off in 2024-25'.",
      parameters: {
        type: "object",
        properties: { question: { type: "string" } },
        required: ["question"],
      },
    },
  },
  label: (args) => `Asked the DRBL engine: ${String(args.question ?? "")}`,
  async run(args) {
    const result = await runAskDrbl(String(args.question ?? ""));
    const data = {
      status: result.status,
      headline: result.headline,
      value: result.valueDisplay,
      details: result.detailLines,
      context: result.contextLines,
      methodology: result.methodology,
      source: result.source,
      limitations: result.limitations,
      errors: result.errors,
    };
    return {
      ok: result.status === "ok" || result.status === "partial",
      data,
      summary: result.headline ?? result.status,
      links: result.links?.slice(0, 3),
    };
  },
};

const setMeasure: Tool = {
  spec: {
    type: "function",
    function: {
      name: "set_measure",
      description:
        "Required before run_sql when the question is a judgment about the shape of a game (no holes, any system, interchangeable, complete, two-way). State the basketball claim, the overall-impact column, the hole column, and the measure you will not use. The reply tells you what to query. It does not contain the answer.",
      parameters: {
        type: "object",
        properties: {
          claim: { type: "string", description: "What basketball fact would make this player the answer" },
          level: {
            type: "string",
            description: "Overall impact column: impact_ratings.total, drbl_per100, or wins_above_r1",
          },
          hole: {
            type: "string",
            description: "The weak-side columns, or none if the question is not about a hole",
          },
          rejected: { type: "string", description: "The tempting measure you will not rank on, and why" },
        },
        required: ["claim", "level", "hole", "rejected"],
      },
    },
  },
  label: () => "Decided what to measure",
  async run(args, ctx) {
    const review = reviewMeasure(ctx.question ?? "", planFromArgs(args));
    if (!review.ok) return { ok: false, data: { error: review.error }, summary: "Measure rejected" };
    if (ctx.measure) ctx.measure.ready = true;
    return { ok: true, data: { guidance: review.guidance }, summary: "Measure set" };
  },
};

const TOOLS: Tool[] = [findPlayer, setMeasure, runSql, drblEngine];

export const ASK_AGENT_TOOL_SPECS: ToolSpec[] = TOOLS.map((t) => t.spec);

export function toolLabel(name: string, args: Record<string, unknown>): string {
  return TOOLS.find((t) => t.spec.function.name === name)?.label(args) ?? name;
}

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutput> {
  const tool = TOOLS.find((t) => t.spec.function.name === name);
  if (!tool) return { ok: false, data: { error: `Unknown tool ${name}` }, summary: `Unknown tool ${name}` };
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, data: { error: "Arguments were not valid JSON." }, summary: "Bad arguments" };
  }
  try {
    return await tool.run(args, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed";
    return { ok: false, data: { error: message }, summary: "Tool failed" };
  }
}

/** Tool output as the model sees it, trimmed so one big result can't flood the context. */
export function toolMessageContent(output: ToolOutput): string {
  const text = JSON.stringify(output.data);
  return text.length > MAX_TOOL_CHARS ? `${text.slice(0, MAX_TOOL_CHARS)}… (truncated; narrow the query)` : text;
}
