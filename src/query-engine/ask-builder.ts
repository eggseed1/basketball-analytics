/**
 * Structured ASK builder - composes natural-language queries for the existing
 * interpret → validate → execute pipeline. Does not create a second engine.
 */

import {
  ASK_METRICS,
  metricById,
} from "./metrics";
import type { AskMetricDef, AskMetricId, QueryOperation } from "./types";
import { metricSeasonAvailability } from "./coverage";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { ALL_TEAM_ABBRS, TEAM_BRANDS, resolveTeamBrand } from "@/lib/nba-brand";
import { PLAYER_ALIASES } from "./entities";

export type AskInputMode = "natural" | "builder";

export type AskBuilderOperation =
  | "season_stat"
  | "team_season_stat"
  | "leaderboard"
  | "season_compare"
  | "team_season_compare"
  | "team_season_rank"
  | "team_season_game_evidence"
  | "season_rank"
  | "career_resume"
  | "game_lab"
  | "offseason_summary";

export type AskBuilderState = {
  operation: AskBuilderOperation;
  playerName: string;
  teamAbbr: string;
  teamAbbrB: string;
  season: string;
  seasonB: string;
  metricId: AskMetricId | "";
};

export type AskBuilderOption = {
  id: AskBuilderOperation;
  label: string;
  subject: "player" | "team" | "league" | "game";
  needsPlayer?: boolean;
  needsTeam?: boolean;
  needsTeamB?: boolean;
  needsSeason?: boolean;
  needsSeasonB?: boolean;
  needsMetric?: boolean;
  metricScope?: AskMetricDef["scope"][];
};

export const ASK_BUILDER_OPERATIONS: AskBuilderOption[] = [
  {
    id: "season_stat",
    label: "Player season stat",
    subject: "player",
    needsPlayer: true,
    needsSeason: true,
    needsMetric: true,
    metricScope: ["player_season", "either"],
  },
  {
    id: "team_season_stat",
    label: "Team season stat",
    subject: "team",
    needsTeam: true,
    needsSeason: true,
    needsMetric: true,
    metricScope: ["team_season", "either"],
  },
  {
    id: "leaderboard",
    label: "League leaderboard",
    subject: "league",
    needsSeason: true,
    needsMetric: true,
    metricScope: ["player_season", "either"],
  },
  {
    id: "season_compare",
    label: "Compare player seasons",
    subject: "player",
    needsPlayer: true,
    needsSeason: true,
    needsSeasonB: true,
  },
  {
    id: "season_rank",
    label: "Rank player seasons",
    subject: "player",
    needsPlayer: true,
  },
  {
    id: "career_resume",
    label: "Career peak / resume",
    subject: "player",
    needsPlayer: true,
  },
  {
    id: "team_season_compare",
    label: "Compare teams / team seasons",
    subject: "team",
    needsTeam: true,
    needsSeason: true,
    needsSeasonB: true,
    needsTeamB: true,
  },
  {
    id: "team_season_rank",
    label: "Rank team seasons",
    subject: "team",
    needsTeam: true,
  },
  {
    id: "team_season_game_evidence",
    label: "Season evidence (biggest wins)",
    subject: "team",
    needsTeam: true,
    needsSeason: true,
  },
  {
    id: "game_lab",
    label: "Game Lab (team matchup)",
    subject: "game",
    needsTeam: true,
    needsTeamB: true,
  },
  {
    id: "offseason_summary",
    label: "Offseason transactions",
    subject: "team",
    needsTeam: true,
  },
];

export function defaultAskBuilderState(now = new Date()): AskBuilderState {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const prior = canonicalSeasonFromStartYear(currentNbaStartYear(now) - 1);
  return {
    operation: "season_stat",
    playerName: "",
    teamAbbr: "",
    teamAbbrB: "",
    season,
    seasonB: prior,
    metricId: "ts_pct",
  };
}

export function listBuilderSeasons(count = 20, now = new Date()): string[] {
  const start = currentNbaStartYear(now);
  return Array.from({ length: count }, (_, i) =>
    canonicalSeasonFromStartYear(start - i)
  );
}

export function listBuilderTeams(): Array<{ abbr: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ abbr: string; label: string }> = [];
  for (const key of ALL_TEAM_ABBRS) {
    const brand = TEAM_BRANDS[key];
    if (!brand || seen.has(brand.abbr)) continue;
    seen.add(brand.abbr);
    out.push({ abbr: brand.abbr, label: `${brand.abbr}` });
  }
  return out.sort((a, b) => a.abbr.localeCompare(b.abbr));
}

export function listBuilderPlayerSuggestions(): string[] {
  const names = new Set<string>();
  for (const row of Object.values(PLAYER_ALIASES)) {
    names.add(row.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function metricsForBuilderOperation(
  op: AskBuilderOperation
): AskMetricDef[] {
  const opt = ASK_BUILDER_OPERATIONS.find((o) => o.id === op);
  if (!opt?.needsMetric || !opt.metricScope) return [];
  const scopes = new Set(opt.metricScope);
  return ASK_METRICS.filter(
    (m) =>
      scopes.has(m.scope) &&
      m.id !== "cpi" &&
      m.id !== "points" &&
      m.id !== "rebounds" &&
      m.id !== "assists"
  );
}

export function builderOption(op: AskBuilderOperation): AskBuilderOption {
  return (
    ASK_BUILDER_OPERATIONS.find((o) => o.id === op) ?? ASK_BUILDER_OPERATIONS[0]!
  );
}

function teamName(abbr: string): string {
  const brand = resolveTeamBrand(abbr);
  if (!brand) return abbr;
  // Prefer city/nickname language the interpreter already knows.
  const map: Record<string, string> = {
    BOS: "Boston",
    OKC: "Oklahoma City",
    DEN: "Denver",
    MIN: "Minnesota",
    NYK: "New York",
    CLE: "Cleveland",
    PHX: "Phoenix",
    GSW: "Golden State",
    MIL: "Milwaukee",
    MIA: "Miami",
    DAL: "Dallas",
    MEM: "Memphis",
    ORL: "Orlando",
    IND: "Indiana",
    BKN: "Brooklyn",
    LAL: "Lakers",
    LAC: "Clippers",
    PHI: "Philadelphia",
    CHI: "Chicago",
    ATL: "Atlanta",
    CHA: "Charlotte",
    DET: "Detroit",
    WAS: "Washington",
    TOR: "Toronto",
    HOU: "Houston",
    SAS: "San Antonio",
    UTA: "Utah",
    POR: "Portland",
    SAC: "Sacramento",
    NOP: "New Orleans",
  };
  return map[brand.abbr] ?? brand.abbr;
}

function metricLabel(id: AskMetricId | ""): string {
  if (!id) return "";
  const m = metricById(id);
  if (!m) return id;
  // Prefer short forms the interpreter matches.
  if (id === "ts_pct") return "TS%";
  if (id === "efg_pct") return "eFG%";
  if (id === "usg_pct") return "usage rate";
  if (id === "fg3_pct") return "3P%";
  if (id === "fg_pct") return "FG%";
  if (id === "ft_pct") return "FT%";
  if (id === "team_diff") return "point differential";
  if (id === "team_opp_ppg") return "opponent PPG";
  if (id === "team_ppg") return "PPG";
  if (id === "team_ts") return "true shooting";
  if (id === "team_fg3") return "3P%";
  if (id === "ppg") return "PPG";
  if (id === "rpg") return "RPG";
  if (id === "apg") return "APG";
  if (id === "tov") return "turnovers";
  if (id === "mpg") return "MPG";
  return m.label;
}

/** Compose NL query text for the existing ASK pipeline. */
export function composeAskBuilderQuery(state: AskBuilderState): string {
  const opt = builderOption(state.operation);
  const player = state.playerName.trim();
  const team = state.teamAbbr ? teamName(state.teamAbbr) : "";
  const teamB = state.teamAbbrB ? teamName(state.teamAbbrB) : "";
  const metric = metricLabel(state.metricId);
  const a = state.season.trim();
  const b = state.seasonB.trim();

  switch (state.operation) {
    case "season_stat":
      return `What was ${player}'s ${metric} in ${a}?`;
    case "team_season_stat":
      if (state.metricId === "team_diff") {
        return `What was ${team}'s point differential in ${a}?`;
      }
      if (state.metricId === "team_opp_ppg") {
        return `What was ${team}'s opponent PPG in ${a}?`;
      }
      if (state.metricId === "team_ppg") {
        return `What was ${team}'s team PPG in ${a}?`;
      }
      if (state.metricId === "team_fg3") {
        return `What was ${team}'s team 3P% in ${a}?`;
      }
      if (state.metricId === "team_ts") {
        return `What was ${team}'s true shooting in ${a}?`;
      }
      if (state.metricId === "team_efg") {
        return `What was ${team}'s team eFG% in ${a}?`;
      }
      return `What was ${team}'s ${metric} in ${a}?`;
    case "leaderboard":
      if (state.metricId === "ppg") {
        return `Who led the NBA in PPG in ${a}?`;
      }
      if (state.metricId === "usg_pct") {
        return `Who had the highest usage rate in ${a}?`;
      }
      return `Who led the NBA in ${metric} in ${a}?`;
    case "season_compare":
      return `Compare ${player}'s ${a} and ${b} seasons.`;
    case "season_rank":
      return `Rank ${player}'s seasons.`;
    case "career_resume":
      return `What was ${player}'s peak production season?`;
    case "team_season_compare":
      if (state.teamAbbrB && state.teamAbbrB !== state.teamAbbr) {
        return `Compare ${team} and ${teamB} in ${a}.`;
      }
      return `Compare ${team}'s ${a} and ${b} seasons.`;
    case "team_season_rank":
      return `Rank ${team}'s recent seasons.`;
    case "team_season_game_evidence":
      return `What were ${team}'s biggest wins in ${a}?`;
    case "game_lab":
      return `Who led ${team} against ${teamB}?`;
    case "offseason_summary":
      return `What happened to ${team} this offseason?`;
    default:
      return "";
  }
}

export function askBuilderPreviewLabel(state: AskBuilderState): string {
  const q = composeAskBuilderQuery(state).trim();
  return q || "Complete the fields to preview the query.";
}

export type AskBuilderValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validateAskBuilderState(
  state: AskBuilderState
): AskBuilderValidation {
  const opt = builderOption(state.operation);
  const errors: string[] = [];
  if (opt.needsPlayer && !state.playerName.trim()) {
    errors.push("Choose a player.");
  }
  if (opt.needsTeam && !state.teamAbbr.trim()) {
    errors.push("Choose a team.");
  }
  if (
    opt.needsTeamB &&
    state.operation === "game_lab" &&
    !state.teamAbbrB.trim()
  ) {
    errors.push("Choose an opponent team.");
  }
  if (
    opt.needsTeamB &&
    state.operation === "team_season_compare" &&
    state.teamAbbrB &&
    state.teamAbbrB === state.teamAbbr &&
    !state.seasonB
  ) {
    // same-team compare needs two seasons - checked below
  }
  if (opt.needsSeason && !state.season.trim()) {
    errors.push("Choose a season.");
  }
  if (opt.needsSeasonB && !state.seasonB.trim()) {
    errors.push("Choose a second season.");
  }
  if (opt.needsSeasonB && state.season && state.seasonB && state.season === state.seasonB) {
    if (!(state.operation === "team_season_compare" && state.teamAbbrB && state.teamAbbrB !== state.teamAbbr)) {
      errors.push("Choose two different seasons.");
    }
  }
  if (opt.needsMetric && !state.metricId) {
    errors.push("Choose a metric.");
  }
  if (opt.needsMetric && state.metricId && state.season) {
    const avail = metricSeasonAvailability(state.metricId, state.season);
    if (!avail.ok) errors.push(avail.message);
  }
  if (
    state.operation === "team_season_compare" &&
    !state.teamAbbrB &&
    (!state.seasonB || state.seasonB === state.season)
  ) {
    errors.push("Add a second team or a second season for comparison.");
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function serializeAskBuilderParams(
  state: AskBuilderState
): Record<string, string> {
  const out: Record<string, string> = {
    mode: "builder",
    op: state.operation,
  };
  if (state.playerName.trim()) out.player = state.playerName.trim();
  if (state.teamAbbr) out.team = state.teamAbbr;
  if (state.teamAbbrB) out.teamB = state.teamAbbrB;
  if (state.season) out.season = state.season;
  if (state.seasonB) out.seasonB = state.seasonB;
  if (state.metricId) out.metric = state.metricId;
  return out;
}

export function parseAskBuilderParams(
  sp: Record<string, string | undefined>
): AskBuilderState {
  const base = defaultAskBuilderState();
  const op = (sp.op ?? base.operation) as AskBuilderOperation;
  const known = ASK_BUILDER_OPERATIONS.some((o) => o.id === op);
  return {
    operation: known ? op : base.operation,
    playerName: (sp.player ?? "").trim(),
    teamAbbr: (sp.team ?? "").trim().toUpperCase(),
    teamAbbrB: (sp.teamB ?? "").trim().toUpperCase(),
    season: (sp.season ?? base.season).trim(),
    seasonB: (sp.seasonB ?? base.seasonB).trim(),
    metricId: ((sp.metric ?? base.metricId) as AskMetricId | "") || "",
  };
}

export function askBuilderHref(state: AskBuilderState, includeQuery = true): string {
  const params = new URLSearchParams(serializeAskBuilderParams(state));
  if (includeQuery) {
    const q = composeAskBuilderQuery(state).trim();
    if (q) params.set("q", q);
  }
  return `/ask?${params.toString()}`;
}

/** Map builder op → QueryOperation (1:1 for supported builder ops). */
export function builderOpToQueryOperation(
  op: AskBuilderOperation
): QueryOperation {
  return op;
}
