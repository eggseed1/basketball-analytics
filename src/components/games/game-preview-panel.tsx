"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type CSSProperties } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { percentileColor } from "@/components/player/percentile-rankings";
import type {
  GamePreviewData,
  PreviewPlayer,
  PreviewPlayerStatId,
  PreviewSide,
  PreviewTeamRow,
} from "@/data/queries/game-preview";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { distinctTeamColors } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const SIDES: PreviewSide[] = ["away", "home"];

const PLAYER_ROWS: Array<{
  id: PreviewPlayerStatId;
  label: string;
  format: (v: number) => string;
}> = [
  { id: "ppg", label: "Points", format: (v) => v.toFixed(1) },
  { id: "rpg", label: "Rebounds", format: (v) => v.toFixed(1) },
  { id: "apg", label: "Assists", format: (v) => v.toFixed(1) },
  { id: "spg", label: "Steals", format: (v) => v.toFixed(1) },
  { id: "bpg", label: "Blocks", format: (v) => v.toFixed(1) },
  { id: "tov", label: "Turnovers", format: (v) => v.toFixed(1) },
  { id: "ts", label: "True shooting", format: pct1 },
  { id: "fg3", label: "3-point %", format: pct1 },
  { id: "usg", label: "Usage", format: pct1 },
  { id: "bpm", label: "BPM", format: signed1 },
  { id: "darko", label: "DARKO", format: signed1 },
];

function pct1(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function signed1(v: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

function formatTeamValue(row: PreviewTeamRow, v: number | null) {
  if (v == null) return "—";
  switch (row.format) {
    case "pct1":
      return pct1(v);
    case "signed1":
      return signed1(v);
    case "num2":
      return v.toFixed(2);
    default:
      return v.toFixed(1);
  }
}

function edgeOf(row: { higherIsBetter: boolean }, a: number | null, b: number | null) {
  if (a == null || b == null || a === b) return null;
  return a > b === row.higherIsBetter ? "away" : "home";
}

function topScorer(list: PreviewPlayer[]): string | null {
  const pool = list.filter((p) => p.games >= 10);
  let best: PreviewPlayer | null = null;
  for (const p of pool.length ? pool : list) {
    if ((p.stats.ppg.value ?? -1) > (best?.stats.ppg.value ?? -1)) best = p;
  }
  return best?.id ?? null;
}

function formatMeetingDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function GamePreviewPanel({ data }: { data: GamePreviewData }) {
  const { surface } = useChartTheme();
  const colors = useMemo(() => {
    const palette = distinctTeamColors(
      [data.teams.away.brandKey, data.teams.home.brandKey],
      surface
    );
    return {
      away: palette.get(data.teams.away.brandKey) ?? "var(--accent-info)",
      home: palette.get(data.teams.home.brandKey) ?? "var(--accent-warning)",
    };
  }, [data.teams.away.brandKey, data.teams.home.brandKey, surface]);

  const [picks, setPicks] = useState<Record<PreviewSide, string | null>>(() => ({
    away: topScorer(data.players.away),
    home: topScorer(data.players.home),
  }));
  const compareRef = useRef<HTMLElement>(null);

  const picked = {
    away: data.players.away.find((p) => p.id === picks.away) ?? null,
    home: data.players.home.find((p) => p.id === picks.home) ?? null,
  };

  const pickFromRotation = (side: PreviewSide, id: string) => {
    setPicks((prev) => ({ ...prev, [side]: id }));
    compareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const seasonNote = data.usesPriorSeason
    ? `Numbers are from the ${data.statsSeason} regular season. ${data.gameSeason} averages take over once both teams have played 10 games.`
    : `${data.statsSeason} regular season averages.`;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className={type.heading}>Team matchup</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {seasonNote} The small numbers are league ranks out of 30.
          </p>
        </div>
        <TeamHeader data={data} />
        {data.teamRows.length ? (
          <div className="flex flex-col gap-1.5">
            {data.teamRows.map((row, i) => (
              <TeamRow key={row.id} row={row} colors={colors} index={i} />
            ))}
          </div>
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Team season stats for {data.statsSeason} are not available yet.
          </p>
        )}
      </section>

      <section
        ref={compareRef}
        className="sports-card flex scroll-mt-20 flex-col gap-4 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className={type.heading}>Player matchup</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Pick a player from each side. Bubbles are league percentiles among{" "}
            {data.peerCount} players with 20+ games and 15+ minutes a game in{" "}
            {data.statsSeason}. Higher is better, so fewer turnovers rank higher.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          {SIDES.map((side) => (
            <PlayerPicker
              key={side}
              side={side}
              data={data}
              value={picks[side]}
              player={picked[side]}
              onChange={(id) => setPicks((prev) => ({ ...prev, [side]: id }))}
            />
          ))}
        </div>
        {picked.away || picked.home ? (
          <div className="flex flex-col gap-1">
            {PLAYER_ROWS.map((row, i) => (
              <PlayerRow
                key={row.id}
                index={i}
                label={row.label}
                format={row.format}
                away={picked.away?.stats[row.id] ?? null}
                home={picked.home?.stats[row.id] ?? null}
              />
            ))}
          </div>
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No player stats for {data.statsSeason} on either roster.
          </p>
        )}
      </section>

      <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className={type.heading}>Rotations</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {data.rosterIsCurrent
              ? `Current rosters with ${data.statsSeason} per-game averages, so some lines came with other teams. Tap a player to compare.`
              : `${data.statsSeason} per-game averages, most minutes first. Tap a player to compare.`}
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {SIDES.map((side) => (
            <RotationTable
              key={side}
              side={side}
              data={data}
              color={colors[side]}
              selectedId={picks[side]}
              onPick={(id) => pickFromRotation(side, id)}
            />
          ))}
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <h2 className={type.heading}>Recent meetings</h2>
        {data.meetings.length ? (
          <ul className="flex flex-col divide-y divide-border/60">
            {data.meetings.map((m) => {
              const awayWon = m.awayScore > m.homeScore;
              return (
                <li key={m.id} data-motion="row">
                  <Link
                    href={`/games/${m.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 text-[14px] transition-colors hover:text-foreground"
                  >
                    <span className="text-muted-foreground tabular-nums">
                      {formatMeetingDate(m.date)}
                      {m.gameType !== "regular" ? (
                        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                          {m.gameType === "playoff" ? "Playoffs" : "Play-in"}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className={cn(awayWon ? "font-bold" : "text-muted-foreground")}>
                        {m.awayAbbr} {m.awayScore}
                      </span>
                      <span className="text-muted-foreground">@</span>
                      <span className={cn(!awayWon ? "font-bold" : "text-muted-foreground")}>
                        {m.homeAbbr} {m.homeScore}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No regular season or playoff meetings on file for {data.gameSeason} or{" "}
            {data.statsSeason === data.gameSeason ? "last season" : data.statsSeason}.
          </p>
        )}
      </section>
    </div>
  );
}

function TeamHeader({ data }: { data: GamePreviewData }) {
  const block = (side: PreviewSide) => {
    const team = data.teams[side];
    return (
      <div
        className={cn(
          "flex min-w-0 items-center gap-2.5",
          side === "home" && "flex-row-reverse text-right"
        )}
      >
        <TeamLogo teamKey={team.brandKey} size="md" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight sm:text-[17px]">
            {team.abbr}
          </p>
          <p className="text-[12px] text-muted-foreground tabular-nums">
            {team.record ?? "—"}
            {team.record ? (
              <span className="hidden sm:inline"> in {data.statsSeason}</span>
            ) : null}
          </p>
        </div>
      </div>
    );
  };
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      {block("away")}
      <span className="px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        vs
      </span>
      {block("home")}
    </div>
  );
}

function RankChip({ rank, className }: { rank: number | null; className?: string }) {
  return (
    <span
      className={cn(
        "text-[10.5px] font-semibold text-muted-foreground tabular-nums",
        className
      )}
    >
      {rank != null ? formatOrdinal(rank) : "—"}
    </span>
  );
}

function TeamRow({
  row,
  colors,
  index,
}: {
  row: PreviewTeamRow;
  colors: Record<PreviewSide, string>;
  index: number;
}) {
  const edge = edgeOf(row, row.away, row.home);
  const width = (rank: number | null) =>
    rank != null ? `${Math.max(6, ((31 - rank) / 30) * 100)}%` : "0%";
  const cell = (side: PreviewSide) => {
    const value = side === "away" ? row.away : row.home;
    const rank = side === "away" ? row.awayRank : row.homeRank;
    const leads = edge === side;
    return (
      <div className={cn("flex items-center gap-2", side === "away" && "flex-row-reverse")}>
        <span
          className={cn(
            "flex w-12 shrink-0 flex-col text-[13px] leading-tight tabular-nums sm:w-14 sm:text-[14px]",
            side === "away" ? "items-end text-right" : "items-start text-left"
          )}
        >
          <span className={leads ? "font-bold" : "text-muted-foreground"}>
            {formatTeamValue(row, value)}
          </span>
          <RankChip rank={rank} className="sm:hidden" />
        </span>
        <div
          data-motion-track
          className={cn(
            "flex h-2 flex-1 overflow-hidden rounded-full bg-secondary",
            side === "away" && "justify-end"
          )}
        >
          <div
            data-motion-bar="x"
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: width(rank),
              backgroundColor: colors[side],
              opacity: leads || edge == null ? 1 : 0.4,
              transformOrigin: side === "away" ? "right" : "left",
            }}
          />
        </div>
        <RankChip rank={rank} className="hidden w-8 shrink-0 text-center sm:block" />
      </div>
    );
  };
  return (
    <div
      data-hover-item
      data-motion="row"
      style={{ "--i": index } as CSSProperties}
      className="-mx-1.5 grid grid-cols-[1fr_5.5rem_1fr] items-center gap-2 rounded-md px-1.5 py-0.5 sm:grid-cols-[1fr_8rem_1fr] sm:gap-3"
    >
      {cell("away")}
      <span className="text-center text-[11.5px] font-semibold leading-tight text-muted-foreground sm:text-[12.5px]">
        {row.label}
      </span>
      {cell("home")}
    </div>
  );
}

function PlayerPicker({
  side,
  data,
  value,
  player,
  onChange,
}: {
  side: PreviewSide;
  data: GamePreviewData;
  value: string | null;
  player: PreviewPlayer | null;
  onChange: (id: string) => void;
}) {
  const team = data.teams[side];
  const list = data.players[side];
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", side === "home" && "items-end text-right")}>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3",
          side === "home" ? "items-end sm:flex-row-reverse" : "items-start"
        )}
      >
        {player ? (
          <PlayerHeadshot
            playerId={player.id}
            espnId={player.id}
            name={player.name}
            teamKey={team.brandKey}
            size="md"
          />
        ) : (
          <TeamLogo teamKey={team.brandKey} size="md" />
        )}
        <div className="min-w-0">
          {player ? (
            <Link
              href={`/players/${player.id}`}
              className="block text-[15px] font-bold leading-tight hover:underline sm:truncate sm:text-[17px]"
            >
              {player.name}
            </Link>
          ) : (
            <p className="text-[15px] font-bold">{team.abbr}</p>
          )}
          {player ? (
            <p className="text-[12px] text-muted-foreground tabular-nums">
              {[player.pos, `${player.games} GP`, `${player.mpg.toFixed(1)} MPG`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {player?.statTeam ? (
            <p className="text-[11.5px] text-muted-foreground">
              Played for {player.statTeam} in {data.statsSeason}
            </p>
          ) : null}
          {player && !player.qualified ? (
            <p className="text-[11.5px] font-semibold text-[var(--accent-warning)]">
              Small sample
            </p>
          ) : null}
        </div>
      </div>
      {list.length ? (
        <select
          aria-label={`${team.abbr} player`}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full max-w-[16rem] truncate rounded-[var(--radius-md)] border border-border bg-card px-2.5 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-[12px] text-muted-foreground">No {data.statsSeason} stats on this roster.</p>
      )}
    </div>
  );
}

function PercentileTrack({
  side,
  stat,
  format,
}: {
  side: PreviewSide;
  stat: { value: number | null; pct: number | null } | null;
  format: (v: number) => string;
}) {
  const pct = stat?.pct;
  const color = pct != null ? percentileColor(pct / 100) : undefined;
  return (
    <div className={cn("flex items-center gap-2", side === "away" && "flex-row-reverse")}>
      <span
        className={cn(
          "w-12 shrink-0 text-[12.5px] font-medium tabular-nums sm:w-14 sm:text-[13.5px]",
          side === "away" ? "text-right" : "text-left"
        )}
      >
        {stat?.value != null ? format(stat.value) : "—"}
      </span>
      <div className="relative h-6 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-secondary" />
        {pct != null ? (
          <>
            <div
              data-motion-bar="x"
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-45 transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: color,
                [side === "away" ? "right" : "left"]: 0,
                transformOrigin: side === "away" ? "right" : "left",
              }}
            />
            <span
              className="absolute top-1/2 h-6 w-6 -translate-y-1/2 transition-[left,right] duration-500"
              style={{
                [side === "away" ? "right" : "left"]: `calc(${pct}% - ${(pct * 0.24).toFixed(2)}px)`,
              }}
            >
              <span
                data-motion-dot
                className="grid size-full place-items-center rounded-full text-[10.5px] font-bold text-white shadow-sm ring-2 ring-card tabular-nums"
                style={{ backgroundColor: color }}
              >
                {pct}
              </span>
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PlayerRow({
  label,
  format,
  away,
  home,
  index,
}: {
  index: number;
  label: string;
  format: (v: number) => string;
  away: { value: number | null; pct: number | null } | null;
  home: { value: number | null; pct: number | null } | null;
}) {
  return (
    <div
      data-hover-item
      data-motion="row"
      style={{ "--i": index } as CSSProperties}
      className="-mx-1.5 grid grid-cols-[1fr_4.75rem_1fr] items-center gap-2 rounded-md px-1.5 sm:grid-cols-[1fr_7rem_1fr] sm:gap-3"
    >
      <PercentileTrack side="away" stat={away} format={format} />
      <span className="text-center text-[11.5px] font-semibold leading-tight text-muted-foreground sm:text-[12.5px]">
        {label}
      </span>
      <PercentileTrack side="home" stat={home} format={format} />
    </div>
  );
}

function RotationTable({
  side,
  data,
  color,
  selectedId,
  onPick,
}: {
  side: PreviewSide;
  data: GamePreviewData;
  color: string;
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const team = data.teams[side];
  const list = data.players[side];
  const missing = data.noStats[side];
  const cell = "px-1.5 py-2 text-right tabular-nums";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="h-3 w-1 rounded-full" style={{ backgroundColor: color }} />
        <TeamLogo teamKey={team.brandKey} size="xs" className="!h-5 !w-5" />
        <h3 className="text-[15px] font-bold">{team.name}</h3>
      </div>
      {list.length ? (
        <div className="touch-scroll-x overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-[12.5px] sm:text-[13px]">
            <thead>
              <tr className="border-b border-border/70 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                <th className="px-1.5 py-1.5 text-left font-semibold">Player</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">GP</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">MIN</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">PTS</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">REB</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">AST</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">TS%</th>
                <th className="px-1.5 py-1.5 text-right font-semibold">DARKO</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = p.stats;
                const selected = p.id === selectedId;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onPick(p.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/40 transition-colors hover:bg-secondary/60",
                      selected && "bg-secondary"
                    )}
                    aria-selected={selected}
                  >
                    <td className="max-w-[11rem] truncate px-1.5 py-2 font-semibold">
                      {p.name}
                      {p.statTeam ? (
                        <span className="ml-1.5 text-[10.5px] font-medium text-muted-foreground">
                          {p.statTeam}
                        </span>
                      ) : null}
                    </td>
                    <td className={cell}>{p.games}</td>
                    <td className={cell}>{p.mpg.toFixed(1)}</td>
                    <td className={cell}>{s.ppg.value != null ? s.ppg.value.toFixed(1) : "—"}</td>
                    <td className={cell}>{s.rpg.value != null ? s.rpg.value.toFixed(1) : "—"}</td>
                    <td className={cell}>{s.apg.value != null ? s.apg.value.toFixed(1) : "—"}</td>
                    <td className={cell}>{s.ts.value != null ? pct1(s.ts.value) : "—"}</td>
                    <td className={cell}>{s.darko.value != null ? signed1(s.darko.value) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">No {data.statsSeason} player stats for this roster.</p>
      )}
      {missing.length ? (
        <p className="text-[12px] text-muted-foreground">
          No {data.statsSeason} NBA stats on file: {missing.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
