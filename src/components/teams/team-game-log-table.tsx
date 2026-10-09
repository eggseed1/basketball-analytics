"use client";

import { useMemo, useState } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import type { TeamGameBox } from "@/lib/team-game-box";
import { cn } from "@/lib/utils";

export type TeamGameLogPhase = "regular" | "playin" | "playoffs";

export type TeamGameLogRow = {
  id: string;
  href: string;
  date: string;
  dateLabel: string;
  phase: TeamGameLogPhase;
  home: boolean;
  oppAbbr: string;
  result: "W" | "L";
  teamScore: number;
  oppScore: number;
  overtime: boolean;
  team: TeamGameBox | null;
  opp: TeamGameBox | null;
};

const PHASES: Array<{ id: TeamGameLogPhase; label: string }> = [
  { id: "regular", label: "Regular season" },
  { id: "playin", label: "Play-In" },
  { id: "playoffs", label: "Playoffs" },
];

type Column = {
  key: string;
  label: string;
  title: string;
  /** Sort value; null sorts last. */
  value: (r: TeamGameLogRow) => number | null;
  cell: (r: TeamGameLogRow) => string;
  /** Footer average over games with box totals. */
  avg?: (rows: TeamGameLogRow[]) => string;
  box?: boolean;
};

const DASH = "—";

function pct(made: number, att: number): number | null {
  return att > 0 ? made / att : null;
}

function fmtPct(v: number | null): string {
  return v == null ? DASH : (v * 100).toFixed(1);
}

function sum(rows: TeamGameLogRow[], pick: (b: TeamGameBox) => number, side: "team" | "opp" = "team"): number {
  return rows.reduce((acc, r) => acc + pick(r[side]!), 0);
}

function shooting(key: string, label: string, title: string, made: (b: TeamGameBox) => number, att: (b: TeamGameBox) => number): Column[] {
  return [
    {
      key,
      label,
      title: `${title} made-attempted`,
      box: true,
      value: (r) => (r.team ? made(r.team) : null),
      cell: (r) => (r.team ? `${made(r.team)}-${att(r.team)}` : DASH),
      avg: (rows) => `${(sum(rows, made) / rows.length).toFixed(1)}-${(sum(rows, att) / rows.length).toFixed(1)}`,
    },
    {
      key: `${key}pct`,
      label: `${label}%`,
      title: `${title} percentage`,
      box: true,
      value: (r) => (r.team ? pct(made(r.team), att(r.team)) : null),
      cell: (r) => (r.team ? fmtPct(pct(made(r.team), att(r.team))) : DASH),
      avg: (rows) => fmtPct(pct(sum(rows, made), sum(rows, att))),
    },
  ];
}

function count(key: string, label: string, title: string, pick: (b: TeamGameBox) => number, side: "team" | "opp" = "team"): Column {
  return {
    key,
    label,
    title,
    box: true,
    value: (r) => (r[side] ? pick(r[side]!) : null),
    cell: (r) => (r[side] ? String(pick(r[side]!)) : DASH),
    avg: (rows) => (sum(rows, pick, side) / rows.length).toFixed(1),
  };
}

const COLUMNS: Column[] = [
  {
    key: "result",
    label: "Result",
    title: "Result and final score",
    value: (r) => r.teamScore - r.oppScore,
    cell: (r) => `${r.result} ${r.teamScore}–${r.oppScore}${r.overtime ? " OT" : ""}`,
  },
  {
    key: "margin",
    label: "+/-",
    title: "Point margin",
    value: (r) => r.teamScore - r.oppScore,
    cell: (r) => {
      const m = r.teamScore - r.oppScore;
      return m > 0 ? `+${m}` : String(m);
    },
    avg: (rows) => {
      const m = rows.reduce((acc, r) => acc + r.teamScore - r.oppScore, 0) / rows.length;
      return `${m > 0 ? "+" : ""}${m.toFixed(1)}`;
    },
  },
  ...shooting("fg", "FG", "Field goals", (b) => b.fgm, (b) => b.fga),
  ...shooting("tp", "3P", "Threes", (b) => b.tpm, (b) => b.tpa),
  ...shooting("ft", "FT", "Free throws", (b) => b.ftm, (b) => b.fta),
  count("oreb", "OREB", "Offensive rebounds", (b) => b.oreb),
  count("reb", "REB", "Rebounds", (b) => b.reb),
  count("ast", "AST", "Assists", (b) => b.ast),
  count("stl", "STL", "Steals", (b) => b.stl),
  count("blk", "BLK", "Blocks", (b) => b.blk),
  count("tov", "TOV", "Turnovers", (b) => b.tov),
  count("pf", "PF", "Personal fouls", (b) => b.pf),
  {
    key: "oppfgpct",
    label: "Opp FG%",
    title: "Opponent field goal percentage",
    box: true,
    value: (r) => (r.opp ? pct(r.opp.fgm, r.opp.fga) : null),
    cell: (r) => (r.opp ? fmtPct(pct(r.opp.fgm, r.opp.fga)) : DASH),
    avg: (rows) => fmtPct(pct(sum(rows, (b) => b.fgm, "opp"), sum(rows, (b) => b.fga, "opp"))),
  },
  {
    key: "opptppct",
    label: "Opp 3P%",
    title: "Opponent three-point percentage",
    box: true,
    value: (r) => (r.opp ? pct(r.opp.tpm, r.opp.tpa) : null),
    cell: (r) => (r.opp ? fmtPct(pct(r.opp.tpm, r.opp.tpa)) : DASH),
    avg: (rows) => fmtPct(pct(sum(rows, (b) => b.tpm, "opp"), sum(rows, (b) => b.tpa, "opp"))),
  },
  count("oppreb", "Opp REB", "Opponent rebounds", (b) => b.reb, "opp"),
  count("opptov", "Opp TOV", "Opponent turnovers", (b) => b.tov, "opp"),
];

const GAME_COL = "sticky left-0 z-10 w-[8.5rem] min-w-[8.5rem] bg-background/95 backdrop-blur-md sm:w-[11rem] sm:min-w-[11rem] lg:bg-transparent lg:backdrop-blur-none";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function TeamGameLogTable({ rows, season, boxNote }: { rows: TeamGameLogRow[]; season: string; boxNote?: string | null }) {
  const phases = PHASES.filter((p) => rows.some((r) => r.phase === p.id));
  const [phase, setPhase] = useState<TeamGameLogPhase>(phases[0]?.id ?? "regular");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });

  const hasBox = rows.some((r) => r.team);
  const columns = hasBox ? COLUMNS : COLUMNS.filter((c) => !c.box);

  const visible = useMemo(() => {
    const list = rows.filter((r) => r.phase === phase);
    if (sort.key === "date") return sort.dir === "asc" ? list : [...list].reverse();
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return list;
    return [...list].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }, [rows, phase, sort]);

  const filtered = rows.filter((r) => r.phase === phase);
  const withBox = filtered.filter((r) => r.team && r.opp);
  const wins = filtered.filter((r) => r.result === "W").length;

  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "asc" : "desc" }));

  if (!rows.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No final games on file for {season} yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {phases.length > 1 ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Season type">
            {phases.map((p) => (
              <Chip key={p.id} active={phase === p.id} onClick={() => setPhase(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
        ) : (
          <p className={cn(type.caption, "font-semibold text-muted-foreground")}>{phases[0]?.label}</p>
        )}
        <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {filtered.length} games · {wins}-{filtered.length - wins}
        </p>
      </div>

      <div className="board-scroll-host overflow-x-auto rounded-md">
        <table className="w-full min-w-[60rem] text-left">
          <thead className={cn(type.caption, "uppercase tracking-wide text-muted-foreground")}>
            <tr className="border-b border-border/60">
              <th className={cn(GAME_COL, "py-2 pl-2 pr-3 font-semibold")} aria-sort={sort.key === "date" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                <button type="button" onClick={() => toggle("date")} className="uppercase tracking-wide hover:text-foreground">
                  Game{sort.key === "date" ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-2 py-2 text-right font-semibold"
                  aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <button type="button" title={col.title} onClick={() => toggle(col.key)} className="uppercase tracking-wide hover:text-foreground">
                    {col.label}
                    {sort.key === col.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-b border-border/40 hover:bg-foreground/[0.03]">
                <td className={cn(GAME_COL, "py-1.5 pl-2 pr-3")}>
                  <TransitionLink href={r.href} className="flex min-w-0 items-baseline gap-1.5 underline-offset-2 hover:underline">
                    <span className={cn(type.caption, "shrink-0 tabular-nums text-muted-foreground")}>{r.dateLabel}</span>
                    <span className={cn(type.bodySm, "truncate font-semibold")}>
                      {r.home ? "vs" : "@"} {r.oppAbbr}
                    </span>
                  </TransitionLink>
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      type.caption,
                      "whitespace-nowrap px-2 py-1.5 text-right tabular-nums",
                      col.key === "result" && "font-semibold",
                      col.key === "result" && (r.result === "W" ? "text-positive" : "text-negative")
                    )}
                  >
                    {col.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {withBox.length ? (
            <tfoot className={cn(type.caption, "font-semibold")}>
              <tr className="border-t border-border/60">
                <td className={cn(GAME_COL, "py-2 pl-2 pr-3 text-muted-foreground")}>
                  Average{withBox.length < filtered.length ? ` (${withBox.length} games)` : ""}
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    {col.avg ? col.avg(withBox) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {boxNote ? <p className={cn(type.caption, "text-muted-foreground")}>{boxNote}</p> : null}
    </div>
  );
}
