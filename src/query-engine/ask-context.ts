/**
 * ASK DRBL historical context - Time Machine season inheritance.
 *
 * Precedence (highest → lowest):
 * 1. Explicit season in the natural-language query
 * 2. Explicit season in the structured builder (composed into query text)
 * 3. Time Machine / shareable URL context (`season=` + optional `from=history`)
 * 4. Existing ASK default / validator behavior (no silent current-season fill)
 *
 * Date context may be carried for display / future executors but is NOT applied
 * to season-level ASK operations in this phase.
 */

import type { BasketballQueryAst, QueryOperation } from "./types";
import { parseSeasonParam } from "@/data/providers/historical/season-range";

export type AskContextSource = "time_machine" | "url" | "explicit" | "default";

export type AskContext = {
  /** Canonical YYYY-YY when present. */
  season?: string;
  /** YYYY-MM-DD - display / future only; not applied to executors yet. */
  date?: string;
  source: AskContextSource;
};

/** Ops that safely inherit a single season when the query omitted one. */
const SEASON_INHERIT_OPS = new Set<QueryOperation>([
  "season_stat",
  "team_season_stat",
  "leaderboard",
  "team_season_compare",
  "team_season_game_evidence",
]);

/** Ops where inheriting a historical season would be semantically wrong. */
const SEASON_NEVER_INHERIT_OPS = new Set<QueryOperation>([
  "offseason_summary",
  "career_resume",
  "season_compare", // needs two seasons - do not invent the second
  "season_rank",
  "team_season_rank",
  "game_lab",
  "box_score_context",
]);

export function parseAskContextFromSearchParams(
  sp: Record<string, string | string[] | undefined>
): AskContext | null {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const seasonRaw = first(sp.season)?.trim();
  const dateRaw = first(sp.date)?.trim();
  const fromRaw = (first(sp.from) ?? "").trim().toLowerCase();

  let season: string | undefined;
  if (seasonRaw) {
    try {
      season = parseSeasonParam(seasonRaw);
    } catch {
      season = undefined;
    }
  }

  const date =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;

  if (!season && !date) return null;

  const source: AskContextSource =
    fromRaw === "history" || fromRaw === "tm" ? "time_machine" : "url";

  return {
    season,
    date,
    source: season ? source : "url",
  };
}

export function operationAcceptsSeasonContext(op: QueryOperation): boolean {
  if (SEASON_NEVER_INHERIT_OPS.has(op)) return false;
  return SEASON_INHERIT_OPS.has(op);
}

/**
 * Enrich AST with Time Machine / URL season when the query left seasons empty.
 * Never overrides seasons already present on the AST (explicit query / builder).
 */
export function applyAskContext(
  ast: BasketballQueryAst,
  context: AskContext | null | undefined
): BasketballQueryAst {
  const hasExplicitSeasons = Boolean(ast.when?.seasons?.length);

  if (hasExplicitSeasons) {
    return {
      ...ast,
      seasonSource: "explicit",
    };
  }

  if (!context?.season || !operationAcceptsSeasonContext(ast.operation)) {
    return {
      ...ast,
      seasonSource: "default",
      // Preserve unused date for UI disclosure only.
      contextDate: context?.date,
      contextDateApplied: false,
    };
  }

  const source: AskContextSource =
    context.source === "time_machine" ? "time_machine" : "url";

  const note =
    source === "time_machine"
      ? "Season inferred from Time Machine context."
      : "Season inferred from shareable ASK URL context.";

  const interpretation = ast.interpretation.map((line) => {
    if (/season unresolved/i.test(line)) return context.season!;
    if (/^season unresolved$/i.test(line.trim())) return context.season!;
    return line;
  });

  // Ensure season appears in interpretation when it was missing.
  const hasSeasonLine = interpretation.some((l) =>
    l.includes(context.season!)
  );
  if (!hasSeasonLine) {
    interpretation.push(`Season: ${context.season}`);
  }
  if (!interpretation.some((l) => /inferred from/i.test(l))) {
    interpretation.push(note);
  }

  return {
    ...ast,
    when: {
      ...ast.when,
      seasons: [context.season],
    },
    seasonSource: source,
    seasonNotes: [...(ast.seasonNotes ?? []), note],
    interpretation,
    contextDate: context.date,
    contextDateApplied: false,
  };
}

export function askContextSourceLabel(
  source: AskContextSource | undefined
): string {
  switch (source) {
    case "explicit":
      return "Explicit query";
    case "time_machine":
      return "Time Machine";
    case "url":
      return "Shareable URL";
    case "default":
      return "Default / none";
    default:
      return "Default / none";
  }
}

/** Append Time Machine context params onto an ASK href. */
export function withAskContextParams(
  href: string,
  context: Pick<AskContext, "season" | "date"> & { fromHistory?: boolean }
): string {
  if (!context.season && !context.date && !context.fromHistory) return href;
  const [path, hash = ""] = href.split("#");
  const url = new URL(path!, "https://drbl.local");
  if (context.season) url.searchParams.set("season", context.season);
  if (context.date) url.searchParams.set("date", context.date);
  if (context.fromHistory) url.searchParams.set("from", "history");
  const qs = url.searchParams.toString();
  const base = `${url.pathname}${qs ? `?${qs}` : ""}`;
  return hash ? `${base}#${hash}` : base;
}

export function historyReturnHref(context: AskContext | null | undefined): string | null {
  if (!context?.season) return null;
  if (context.source !== "time_machine") return null;
  const q = new URLSearchParams();
  q.set("season", context.season);
  if (context.date) q.set("date", context.date);
  return `/history?${q.toString()}`;
}
