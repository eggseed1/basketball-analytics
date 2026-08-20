import type { ReactNode } from "react";
import { TransitionLink } from "@/components/continuity/query-nav";

import type { HistoryPlayerSeason } from "@/data/history/player-career-types";
import {
  deriveRates,
  presentAdditive,
  presentMinutes,
  presentPct,
  toPlayerSeasonTotals,
  type PlayerSeasonTotals,
} from "@/data/history/player-season-totals";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import {
  parsePlayerStatMode,
  playerHref,
  type PlayerStatMode,
} from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

type ColId =
  | "season"
  | "age"
  | "team"
  | "gp"
  | "gs"
  | "min"
  | "fg"
  | "fga"
  | "fgPct"
  | "threeP"
  | "threePa"
  | "threePct"
  | "twoP"
  | "twoPa"
  | "twoPct"
  | "ft"
  | "fta"
  | "ftPct"
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "pts"
  | "efg"
  | "ts"
  | "view";

type ColDef = {
  id: ColId;
  label: string;
  sticky?: "season" | "age" | "team";
  align?: "left" | "right";
};

/** Single column contract for header / body / footer. */
export const CAREER_TABLE_COLUMNS: ColDef[] = [
  { id: "season", label: "Season", sticky: "season", align: "left" },
  { id: "age", label: "Age", sticky: "age", align: "right" },
  { id: "team", label: "Team", sticky: "team", align: "left" },
  { id: "gp", label: "GP", align: "right" },
  { id: "gs", label: "GS", align: "right" },
  { id: "min", label: "MIN", align: "right" },
  { id: "fg", label: "FG", align: "right" },
  { id: "fga", label: "FGA", align: "right" },
  { id: "fgPct", label: "FG%", align: "right" },
  { id: "threeP", label: "3P", align: "right" },
  { id: "threePa", label: "3PA", align: "right" },
  { id: "threePct", label: "3P%", align: "right" },
  { id: "twoP", label: "2P", align: "right" },
  { id: "twoPa", label: "2PA", align: "right" },
  { id: "twoPct", label: "2P%", align: "right" },
  { id: "ft", label: "FT", align: "right" },
  { id: "fta", label: "FTA", align: "right" },
  { id: "ftPct", label: "FT%", align: "right" },
  { id: "reb", label: "REB", align: "right" },
  { id: "ast", label: "AST", align: "right" },
  { id: "stl", label: "STL", align: "right" },
  { id: "blk", label: "BLK", align: "right" },
  { id: "tov", label: "TOV", align: "right" },
  { id: "pts", label: "PTS", align: "right" },
  { id: "efg", label: "eFG%", align: "right" },
  { id: "ts", label: "TS%", align: "right" },
  { id: "view", label: "", align: "left" },
];

function teamAbbr(t: PlayerSeasonTotals): string {
  if (t.teamGrain === "multi") return "TOT";
  return (
    getCanonicalTeamFromProvider("nba", t.primaryTeamId)?.abbr ?? "—"
  );
}

function stickyClass(col: ColDef, kind: "th" | "td"): string {
  if (!col.sticky) return "";
  const base =
    kind === "th"
      ? "sticky z-20 bg-secondary/95"
      : "sticky z-10 bg-background/95";
  if (col.sticky === "season") return cn(base, "left-0");
  if (col.sticky === "age") return cn(base, "left-[4.5rem]");
  return cn(base, "left-[7.25rem]");
}

function cellFor(
  t: PlayerSeasonTotals,
  col: ColId,
  mode: PlayerStatMode,
  age: string,
  playerId: string,
  fromHistory?: boolean,
  themeMode?: "historical" | "modern"
): ReactNode {
  const rates = deriveRates(t);
  switch (col) {
    case "season":
      return (
        <TransitionLink
          href={playerHref({
            playerId,
            season: t.season,
            fromHistory,
            themeMode,
          })}
          scroll={false}
          prefetch={false}
          className="underline-offset-2 hover:underline"
        >
          {t.season}
        </TransitionLink>
      );
    case "age":
      return age;
    case "team":
      return teamAbbr(t);
    case "gp":
      return t.gp;
    case "gs":
      return t.gs == null ? "—" : t.gs;
    case "min":
      return presentMinutes(t.minutesTotal, mode, t.gp);
    case "fg":
      return presentAdditive(t.fgm, mode, t.gp, t.minutesTotal);
    case "fga":
      return presentAdditive(t.fga, mode, t.gp, t.minutesTotal);
    case "fgPct":
      return presentPct(rates.fgPct);
    case "threeP":
      return presentAdditive(t.threePm, mode, t.gp, t.minutesTotal);
    case "threePa":
      return presentAdditive(t.threePa, mode, t.gp, t.minutesTotal);
    case "threePct":
      return presentPct(rates.threePct);
    case "twoP":
      return presentAdditive(t.twoPm, mode, t.gp, t.minutesTotal);
    case "twoPa":
      return presentAdditive(t.twoPa, mode, t.gp, t.minutesTotal);
    case "twoPct":
      return presentPct(rates.twoPct);
    case "ft":
      return presentAdditive(t.ftm, mode, t.gp, t.minutesTotal);
    case "fta":
      return presentAdditive(t.fta, mode, t.gp, t.minutesTotal);
    case "ftPct":
      return presentPct(rates.ftPct);
    case "reb":
      return presentAdditive(t.reb, mode, t.gp, t.minutesTotal);
    case "ast":
      return presentAdditive(t.ast, mode, t.gp, t.minutesTotal);
    case "stl":
      return presentAdditive(t.stl, mode, t.gp, t.minutesTotal);
    case "blk":
      return presentAdditive(t.blk, mode, t.gp, t.minutesTotal);
    case "tov":
      return presentAdditive(t.tov, mode, t.gp, t.minutesTotal);
    case "pts":
      return presentAdditive(t.pts, mode, t.gp, t.minutesTotal);
    case "efg":
      return presentPct(rates.efgPct);
    case "ts":
      return presentPct(rates.tsPct);
    case "view":
      return (
        <TransitionLink
          href={playerHref({
            playerId,
            season: t.season,
            fromHistory,
            themeMode,
          })}
          scroll={false}
          prefetch={false}
          className="font-semibold underline-offset-2 hover:underline"
        >
          View →
        </TransitionLink>
      );
    default:
      return "—";
  }
}

function sumCareer(rows: PlayerSeasonTotals[]): PlayerSeasonTotals {
  const first = rows[0];
  const acc: PlayerSeasonTotals = {
    playerId: first?.playerId ?? "",
    season: "Career",
    playerName: first?.playerName ?? "",
    teamIds: [],
    primaryTeamId: "",
    teamGrain: "single",
    source: "history_season",
    gp: 0,
    gs: 0,
    minutesTotal: 0,
    fgm: 0,
    fga: 0,
    threePm: 0,
    threePa: 0,
    twoPm: 0,
    twoPa: 0,
    ftm: 0,
    fta: 0,
    orb: null,
    drb: null,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: null,
    pts: 0,
  };
  for (const r of rows) {
    acc.gp += r.gp;
    if (r.gs != null) acc.gs = (acc.gs ?? 0) + r.gs;
    if (r.minutesTotal != null)
      acc.minutesTotal = (acc.minutesTotal ?? 0) + r.minutesTotal;
    if (r.fgm != null) acc.fgm = (acc.fgm ?? 0) + r.fgm;
    if (r.fga != null) acc.fga = (acc.fga ?? 0) + r.fga;
    if (r.threePm != null) acc.threePm = (acc.threePm ?? 0) + r.threePm;
    if (r.threePa != null) acc.threePa = (acc.threePa ?? 0) + r.threePa;
    if (r.ftm != null) acc.ftm = (acc.ftm ?? 0) + r.ftm;
    if (r.fta != null) acc.fta = (acc.fta ?? 0) + r.fta;
    if (r.reb != null) acc.reb = (acc.reb ?? 0) + r.reb;
    if (r.ast != null) acc.ast = (acc.ast ?? 0) + r.ast;
    if (r.stl != null) acc.stl = (acc.stl ?? 0) + r.stl;
    if (r.blk != null) acc.blk = (acc.blk ?? 0) + r.blk;
    if (r.tov != null) acc.tov = (acc.tov ?? 0) + r.tov;
    if (r.pts != null) acc.pts = (acc.pts ?? 0) + r.pts;
  }
  acc.twoPm =
    acc.fgm != null && acc.threePm != null ? acc.fgm - acc.threePm : null;
  acc.twoPa =
    acc.fga != null && acc.threePa != null ? acc.fga - acc.threePa : null;
  return acc;
}

/**
 * Comprehensive career season table — canonical totals → mode views.
 */
export function PlayerCareerSeasonTable({
  playerId,
  seasons,
  viewingSeason,
  statMode = "perGame",
  ageBySeason,
  fromHistory,
  themeMode,
}: {
  playerId: string;
  seasons: HistoryPlayerSeason[];
  viewingSeason: string;
  statMode?: PlayerStatMode | string;
  ageBySeason?: Record<string, string>;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const mode = parsePlayerStatMode(statMode);
  const rows = [...seasons]
    .map(toPlayerSeasonTotals)
    .sort((a, b) => b.season.localeCompare(a.season));
  const career = rows.length ? sumCareer(rows) : null;
  const modes: PlayerStatMode[] = ["perGame", "totals", "per36"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-[12px]">
        {modes.map((m) => (
          <TransitionLink
            key={m}
            href={playerHref({
              playerId,
              season: viewingSeason,
              view: "career",
              stat: m,
              fromHistory,
              themeMode,
            })}
            scroll={false}
            prefetch={false}
            className={cn(
              "rounded-md px-2.5 py-1 font-semibold",
              mode === m
                ? "bg-foreground text-background"
                : "border border-border"
            )}
          >
            {m === "perGame" ? "Per game" : m === "totals" ? "Totals" : "Per 36"}
          </TransitionLink>
        ))}
        <span className="self-center text-muted-foreground">
          Per 100: blocked (possession denominator not validated)
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[78rem] border-collapse text-left text-[12px]">
          <thead className="border-b border-border bg-secondary/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {CAREER_TABLE_COLUMNS.map((col) => (
                <th
                  key={col.id}
                  className={cn(
                    "px-2 py-2",
                    col.align === "right" && "text-right",
                    col.id === "season" && "px-3",
                    stickyClass(col, "th")
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const active = r.season === viewingSeason;
              const age = ageBySeason?.[r.season] ?? "—";
              return (
                <tr
                  key={r.season}
                  className={cn(active && "bg-secondary/40")}
                >
                  {CAREER_TABLE_COLUMNS.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        "px-2 py-2",
                        col.align === "right" && "text-right tabular-nums",
                        col.id === "season" && "px-3 font-semibold",
                        stickyClass(col, "td")
                      )}
                    >
                      {cellFor(
                        r,
                        col.id,
                        mode,
                        age,
                        playerId,
                        fromHistory,
                        themeMode
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {career ? (
            <tfoot className="border-t-2 border-border bg-secondary/30 font-semibold">
              <tr>
                {CAREER_TABLE_COLUMNS.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      "px-2 py-2",
                      col.align === "right" && "text-right tabular-nums",
                      col.id === "season" && "px-3",
                      stickyClass(col, "td")
                    )}
                  >
                    {col.id === "season"
                      ? "Career"
                      : col.id === "age" || col.id === "team" || col.id === "view"
                        ? ""
                        : cellFor(
                            career,
                            col.id,
                            mode,
                            "",
                            playerId,
                            fromHistory,
                            themeMode
                          )}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        All modes derive from canonical season TOTALS. Percentages and TS% are
        derived from totals (TS% uses 0.44 FTA). Minutes recover ISO-8601
        PT…M…S durations from player-game rows when season aggregates were
        under-parsed.
      </p>
    </div>
  );
}
