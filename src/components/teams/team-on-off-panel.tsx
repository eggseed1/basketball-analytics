"use client";

import { useMemo, useState } from "react";

import {
  OnOffMethodNote,
  OnOffViewToggle,
  SmallSampleTag,
  fmtCount,
  fmtPct,
  fmtRating,
  fmtSigned,
  percentileLabel,
  toneClass,
} from "@/components/on-off/on-off-parts";
import { PlayerIdentity } from "@/components/players/player-identity";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Z95, type LineupRow, type OnOffPlayerRow, type WowyStates } from "@/lib/on-off/derive";
import type { OnOffView, Ratings } from "@/lib/on-off/metrics";
import { type } from "@/lib/design-system";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

export type TeamOnOffViewData = {
  rows: OnOffPlayerRow[];
  lineups: LineupRow[];
  /** Keyed `${a}|${b}` in file order. */
  pairs: Record<string, WowyStates>;
};

type Dir = "asc" | "desc";

function useSort<K extends string>(initial: K, initialDir: Dir = "desc") {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<Dir>(initialDir);
  const toggle = (next: K, nextDefault: Dir = "desc") => {
    if (next === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setKey(next);
      setDir(nextDefault);
    }
  };
  return { key, dir, toggle };
}

function sortBy<T>(rows: T[], value: (r: T) => number | null, dir: Dir): T[] {
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return dir === "asc" ? va - vb : vb - va;
  });
}

const cellBase = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
const stickyCell = "board-sticky-frost sticky left-0 z-20";

type PlayerSortKey =
  | "poss"
  | "minutes"
  | "onNet"
  | "offNet"
  | "netDiff"
  | "netLuckAdjDiff"
  | "ortgDiff"
  | "drtgDiff"
  | "oppStartersOn"
  | "pct";

const PLAYER_SORT: Record<PlayerSortKey, (r: OnOffPlayerRow) => number | null> = {
  poss: (r) => r.poss,
  minutes: (r) => r.minutes,
  onNet: (r) => r.cmp.on.net,
  offNet: (r) => r.cmp.off.net,
  netDiff: (r) => r.cmp.netDiff,
  netLuckAdjDiff: (r) => r.cmp.netLuckAdjDiff,
  ortgDiff: (r) => r.cmp.ortgDiff,
  drtgDiff: (r) => r.cmp.drtgDiff,
  oppStartersOn: (r) => r.oppStartersOn,
  pct: (r) => r.netDiffPercentile,
};

function PlayerTable({
  rows,
  season,
  teamAbbr,
}: {
  rows: OnOffPlayerRow[];
  season: string;
  teamAbbr: string;
}) {
  const sort = useSort<PlayerSortKey>("poss");
  const sorted = useMemo(() => sortBy(rows, PLAYER_SORT[sort.key], sort.dir), [rows, sort.key, sort.dir]);
  const head = (key: PlayerSortKey, label: string, title: string, defaultDir: Dir = "desc") => (
    <SortableTableHead
      active={sort.key === key}
      dir={sort.dir}
      onClick={() => sort.toggle(key, defaultDir)}
      title={title}
    >
      {label}
    </SortableTableHead>
  );

  return (
    <div className="touch-scroll-x overflow-x-auto">
      <table className="w-full min-w-[60rem] text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(stickyCell, "z-30 px-2 text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground")}>
              Player
            </th>
            {head("poss", "Poss", "Possessions on the floor, offense plus defense")}
            {head("minutes", "Min", "Minutes on the floor")}
            {head("onNet", "On net", "Team net rating with him on the floor")}
            {head("offNet", "Off net", "Team net rating with him off the floor")}
            {head("netDiff", "Swing", "On net minus off net, with the 95% sampling range")}
            {head("netLuckAdjDiff", "Luck adj.", "Swing with opponent 3P% and FT% set to league average")}
            {head("ortgDiff", "ORtg ±", "Team offensive rating on minus off")}
            {head("drtgDiff", "DRtg ±", "Opponent points per 100 on minus off. Negative is better.", "asc")}
            {head("oppStartersOn", "Opp starters", "Opponent starters on the floor per possession with him on")}
            {head("pct", "League pct", "Percentile of his swing among players with 2,000 or more possessions")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-0">
              <td className={cn(stickyCell, "px-2 py-2")}>
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerIdentity
                    playerId={r.id}
                    nbaId={r.id}
                    name={r.name}
                    season={season}
                    teamKey={teamAbbr}
                    variant="compact"
                    href={playerHref({ playerId: r.id, season, view: "onoff" })}
                  />
                  {r.smallSample ? <SmallSampleTag /> : null}
                </div>
              </td>
              <td className={cellBase}>{fmtCount(r.poss)}</td>
              <td className={cellBase}>{fmtCount(r.minutes)}</td>
              <td className={cn(cellBase, toneClass(r.cmp.on.net))}>{fmtSigned(r.cmp.on.net)}</td>
              <td className={cn(cellBase, toneClass(r.cmp.off.net))}>{fmtSigned(r.cmp.off.net)}</td>
              <td className={cellBase}>
                <span className={cn("font-semibold", toneClass(r.cmp.netDiff))}>{fmtSigned(r.cmp.netDiff)}</span>
                {r.cmp.netDiffSe != null ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    ±{(Z95 * r.cmp.netDiffSe).toFixed(1)}
                  </span>
                ) : null}
              </td>
              <td className={cn(cellBase, toneClass(r.cmp.netLuckAdjDiff))}>{fmtSigned(r.cmp.netLuckAdjDiff)}</td>
              <td className={cn(cellBase, toneClass(r.cmp.ortgDiff))}>{fmtSigned(r.cmp.ortgDiff)}</td>
              <td className={cn(cellBase, toneClass(r.cmp.drtgDiff, false))}>{fmtSigned(r.cmp.drtgDiff)}</td>
              <td className={cellBase}>{r.oppStartersOn == null ? "—" : r.oppStartersOn.toFixed(1)}</td>
              <td className={cellBase}>{percentileLabel(r.netDiffPercentile)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateCell({ label, r }: { label: string; r: Ratings }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[var(--radius-md)] bg-foreground/[0.04] p-3">
      <p className={cn(type.caption, "truncate font-semibold text-muted-foreground")} title={label}>
        {label}
      </p>
      <p className={cn("text-xl font-bold tabular-nums", toneClass(r.net))}>{fmtSigned(r.net)}</p>
      <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
        ORtg {fmtRating(r.ortg)} · DRtg {fmtRating(r.drtg)}
      </p>
      <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
        {fmtCount(r.poss)} poss
        {r.netSe != null && r.poss > 0 ? ` · ±${(Z95 * r.netSe).toFixed(1)}` : ""}
      </p>
    </div>
  );
}

const shortName = (name: string) => name.split(" ").slice(1).join(" ") || name;

function WowyExplorer({
  players,
  pairs,
}: {
  players: Array<{ id: string; name: string }>;
  pairs: Record<string, WowyStates>;
}) {
  const [a, setA] = useState(players[0]?.id ?? "");
  const [b, setB] = useState(players[1]?.id ?? "");
  if (players.length < 2) return null;

  const direct = pairs[`${a}|${b}`];
  const swapped = pairs[`${b}|${a}`];
  const states: WowyStates | null = direct
    ? direct
    : swapped
      ? { both: swapped.both, aOnly: swapped.bOnly, bOnly: swapped.aOnly, neither: swapped.neither }
      : null;
  const nameA = players.find((p) => p.id === a)?.name ?? "";
  const nameB = players.find((p) => p.id === b)?.name ?? "";

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 rounded-[var(--radius-md)] border border-border bg-background px-2 text-[14px]"
      >
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 sm:max-w-xl">
        {select(a, setA, "Player A")}
        {select(b, setB, "Player B")}
      </div>
      {a === b ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>Pick two different players.</p>
      ) : states ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StateCell label="Both on" r={states.both} />
          <StateCell label={`${shortName(nameA)} without ${shortName(nameB)}`} r={states.aOnly} />
          <StateCell label={`${shortName(nameB)} without ${shortName(nameA)}`} r={states.bOnly} />
          <StateCell label="Both off" r={states.neither} />
        </div>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>No shared possessions for this pair.</p>
      )}
    </div>
  );
}

type LineupSortKey = "poss" | "net" | "ortg" | "drtg" | "efg" | "oppEfg";

const LINEUP_SORT: Record<LineupSortKey, (r: LineupRow) => number | null> = {
  poss: (r) => r.poss,
  net: (r) => r.ratings.net,
  ortg: (r) => r.ratings.ortg,
  drtg: (r) => r.ratings.drtg,
  efg: (r) => r.offense.efg,
  oppEfg: (r) => r.defense.efg,
};

function LineupTable({ lineups }: { lineups: LineupRow[] }) {
  const sort = useSort<LineupSortKey>("poss");
  const sorted = useMemo(() => sortBy(lineups, LINEUP_SORT[sort.key], sort.dir), [lineups, sort.key, sort.dir]);
  const head = (key: LineupSortKey, label: string, title: string, defaultDir: Dir = "desc") => (
    <SortableTableHead active={sort.key === key} dir={sort.dir} onClick={() => sort.toggle(key, defaultDir)} title={title}>
      {label}
    </SortableTableHead>
  );
  const plain = (label: string, title: string) => (
    <th className="px-2 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" title={title}>
      {label}
    </th>
  );
  if (!lineups.length) {
    return <p className={cn(type.bodySm, "text-muted-foreground")}>No five-man group has 40 possessions yet.</p>;
  }
  return (
    <div className="touch-scroll-x overflow-x-auto">
      <table className="w-full min-w-[56rem] text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(stickyCell, "z-30 px-2 text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground")}>
              Lineup
            </th>
            {head("poss", "Poss", "Possessions, offense plus defense")}
            {plain("Min", "Minutes together")}
            {head("ortg", "ORtg", "Points scored per 100 possessions")}
            {head("drtg", "DRtg", "Points allowed per 100 possessions", "asc")}
            {head("net", "Net", "ORtg minus DRtg")}
            {head("efg", "eFG%", "Effective field goal percentage")}
            {plain("TOV%", "Turnovers per 100 possessions")}
            {plain("ORB%", "Share of own misses rebounded")}
            {plain("FT rate", "Free throws made per field goal attempt")}
            {head("oppEfg", "Opp eFG%", "Opponent effective field goal percentage", "asc")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.ids.join("-")} className="border-b border-border/60 last:border-0">
              <td className={cn(stickyCell, "max-w-[18rem] px-2 py-2 text-left")}>
                <span className="block truncate" title={l.names.join(", ")}>
                  {l.names.map(shortName).join(" · ")}
                </span>
              </td>
              <td className={cellBase}>{fmtCount(l.poss)}</td>
              <td className={cellBase}>{fmtCount(l.minutes)}</td>
              <td className={cellBase}>{fmtRating(l.ratings.ortg)}</td>
              <td className={cellBase}>{fmtRating(l.ratings.drtg)}</td>
              <td className={cn(cellBase, "font-semibold", toneClass(l.ratings.net))}>
                {fmtSigned(l.ratings.net)}
                {l.ratings.netSe != null ? (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    ±{(Z95 * l.ratings.netSe).toFixed(0)}
                  </span>
                ) : null}
              </td>
              <td className={cellBase}>{fmtPct(l.offense.efg)}</td>
              <td className={cellBase}>{fmtPct(l.offense.tovPct)}</td>
              <td className={cellBase}>{fmtPct(l.offense.orbPct)}</td>
              <td className={cellBase}>{fmtPct(l.offense.ftRate, 0)}</td>
              <td className={cellBase}>{fmtPct(l.defense.efg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TeamOnOffPanel({
  season,
  teamAbbr,
  games,
  pairPlayerIds,
  views,
}: {
  season: string;
  teamAbbr: string;
  games: number;
  pairPlayerIds: string[];
  views: Record<OnOffView, TeamOnOffViewData>;
}) {
  const [view, setView] = useState<OnOffView>("clean");
  const data = views[view];
  const pairPlayers = useMemo(() => {
    const ids = new Set(pairPlayerIds);
    return views.all.rows.filter((r) => ids.has(r.id)).map((r) => ({ id: r.id, name: r.name }));
  }, [pairPlayerIds, views.all.rows]);

  return (
    <section id="onoff" className="scroll-mt-16 flex flex-col gap-8" aria-label="On/off">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-bold tracking-tight">On/off</h2>
          <p className={cn(type.bodySm, "mt-1 max-w-prose text-muted-foreground")}>
            How {teamAbbr} played per 100 possessions with each player on the floor and off
            it. {season} regular season, {games} games.
          </p>
        </div>
        <OnOffViewToggle value={view} onChange={setView} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>Players</h3>
        <PlayerTable rows={data.rows} season={season} teamAbbr={teamAbbr} />
        <p className={cn(type.caption, "text-muted-foreground")}>
          Swing is on net minus off net. The ± figure is the 95% range from sampling noise, so a
          +4 swing with ±8 could easily be zero. Small sample marks fewer than 1,000 possessions
          on or off.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>With and without</h3>
        <p className={cn(type.bodySm, "max-w-prose text-muted-foreground")}>
          Pick two regulars to split the season into the four ways they shared the floor.
        </p>
        <WowyExplorer players={pairPlayers} pairs={data.pairs} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={type.heading}>Five-man lineups</h3>
        <LineupTable lineups={data.lineups} />
        <p className={cn(type.caption, "text-muted-foreground")}>
          Most-used groups with at least 40 possessions. Lineup net ratings swing a lot in a few
          hundred possessions, so lean on the four factors as much as the net figure.
        </p>
      </div>

      <OnOffMethodNote />
    </section>
  );
}
