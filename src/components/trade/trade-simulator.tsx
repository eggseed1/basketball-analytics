"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { formatNumber, formatPct } from "@/lib/format";
import { formatUsdCompact } from "@/lib/format-money";
import {
  summarizePlayerTrade,
  type TradeSimPlayer,
  type TradeSimTeam,
  type TradeSketchSide,
} from "@/lib/trade-simulator";
import type { TradeSimulatorBoard } from "@/data/queries/trade-simulator";
import { cn } from "@/lib/utils";

function signed(value: number, digits = 2): string {
  const text = formatNumber(value, digits);
  return value > 0 ? `+${text}` : text;
}

function roomLabel(value: number | null): string {
  if (value == null) return "—";
  const abs = formatUsdCompact(Math.abs(value));
  if (value > 0) return `${abs} under`;
  if (value < 0) return `${abs} over`;
  return "at line";
}

function packageBits(shape: TradeSketchSide["sentPackage"]): string {
  return [
    `${shape.count} player${shape.count === 1 ? "" : "s"}`,
    shape.avgAge != null ? `age ${formatNumber(shape.avgAge, 1)}` : null,
    shape.avgMpg != null ? `${formatNumber(shape.avgMpg, 1)} mpg` : null,
    shape.positions.length ? shape.positions.join("/") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function PlayerLink({
  player,
  className,
}: {
  player: TradeSimPlayer;
  className?: string;
}) {
  const classes = cn("truncate font-semibold underline-offset-2", className);
  if (!player.href) {
    return <span className={classes}>{player.name}</span>;
  }
  return (
    <Link href={player.href} className={cn(classes, "hover:underline")}>
      {player.name}
    </Link>
  );
}

function SideSummary({
  abbr,
  side,
}: {
  abbr: string;
  side: TradeSketchSide;
}) {
  const room = side.roomAfter ?? side.roomBefore;
  return (
    <div className="min-w-0 rounded-md border border-border/70 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {abbr}
        </p>
        <p className="truncate text-[12px] tabular-nums text-muted-foreground">
          roster {side.rosterCountBefore}→{side.rosterCountAfter}
        </p>
      </div>
      <p className="mt-1 text-[14px] font-semibold tabular-nums">
        {formatUsdCompact(side.sentSalary)} out ·{" "}
        {formatUsdCompact(side.receivedSalary)} in
      </p>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        After {formatUsdCompact(side.knownCommitmentsAfter)}
        {side.knownLineAfter ? ` · ${side.knownLineAfter}` : ""}
        {" · was "}
        {side.knownLineBefore}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
        {(
          [
            ["Cap", room.toCap],
            ["Tax", room.toTax],
            ["1st apron", room.toFirstApron],
            ["2nd apron", room.toSecondApron],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded bg-foreground/[0.04] px-2 py-1.5"
          >
            <dt className="font-semibold text-muted-foreground">{label}</dt>
            <dd className="tabular-nums text-foreground">{roomLabel(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] tabular-nums text-muted-foreground">
        DRBL {side.drblNet == null ? "—" : signed(side.drblNet)} · WAR1{" "}
        {side.war1Net == null ? "—" : signed(side.war1Net)} · BPM{" "}
        {side.bpmNet == null ? "—" : signed(side.bpmNet)}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Out {packageBits(side.sentPackage)}
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">
        In {packageBits(side.receivedPackage)}
      </p>
    </div>
  );
}

function PackageList({
  title,
  players,
}: {
  title: string;
  players: TradeSimPlayer[];
}) {
  if (!players.length) return null;
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {players.map((player) => (
          <li
            key={player.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md border border-border/60 px-3 py-2"
          >
            <div className="min-w-0">
              <PlayerLink player={player} className="text-[13px]" />
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {[
                  player.position,
                  player.age != null ? `age ${player.age}` : null,
                  player.mpg != null
                    ? `${formatNumber(player.mpg, 1)} mpg`
                    : null,
                  player.points != null
                    ? `${formatNumber(player.points, 1)} ppg`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <p className="text-right text-[13px] font-semibold tabular-nums">
              {formatUsdCompact(player.salary)}
            </p>
            <p className="col-span-2 text-[11px] leading-snug text-muted-foreground">
              {[
                player.drbl100 == null
                  ? null
                  : `DRBL ${signed(player.drbl100)}`,
                player.drblO != null && player.drblD != null
                  ? `O/D ${signed(player.drblO)}/${signed(player.drblD)}`
                  : null,
                player.war1 == null ? null : `WAR1 ${signed(player.war1)}`,
                player.bpm == null ? null : `BPM ${signed(player.bpm)}`,
                player.ts == null ? null : `TS ${formatPct(player.ts)}`,
                player.usg == null ? null : `USG ${formatPct(player.usg)}`,
                player.assists == null
                  ? null
                  : `${formatNumber(player.assists, 1)} apg`,
                player.rebounds == null
                  ? null
                  : `${formatNumber(player.rebounds, 1)} rpg`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerColumn({
  team,
  selected,
  onToggle,
}: {
  team: TradeSimTeam;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"salary" | "drbl" | "name">("salary");
  const needle = query.trim().toLowerCase();
  const players = useMemo(() => {
    const filtered = needle
      ? team.players.filter((player) =>
          player.name.toLowerCase().includes(needle)
        )
      : [...team.players];
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "drbl") {
        return (b.drbl100 ?? -999) - (a.drbl100 ?? -999);
      }
      return (
        (b.salary ?? -1) - (a.salary ?? -1) || a.name.localeCompare(b.name)
      );
    });
  }, [needle, sort, team.players]);

  return (
    <div className="sports-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex min-w-0 items-center gap-2">
        <TeamLogo teamKey={team.abbr} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{team.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatUsdCompact(team.knownCommitments)} known · {team.players.length}{" "}
            on book
            {team.playersWithoutSalary
              ? ` · ${team.playersWithoutSalary} unmatched`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-[14px] outline-none"
        />
        <select
          value={sort}
          onChange={(event) =>
            setSort(event.target.value as "salary" | "drbl" | "name")
          }
          className="h-9 shrink-0 rounded-md border border-border bg-transparent px-2 text-[13px]"
          aria-label="Sort players"
        >
          <option value="salary">Salary</option>
          <option value="drbl">DRBL</option>
          <option value="name">Name</option>
        </select>
      </div>
      <ul className="flex max-h-[22rem] flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {players.map((player) => {
          const on = selected.includes(player.id);
          return (
            <li key={player.id}>
              <label
                className={cn(
                  "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5",
                  on ? "bg-foreground/10" : "hover:bg-foreground/5"
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(player.id)}
                  aria-label={`Send ${player.name}`}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">
                    {player.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {[
                      player.position,
                      player.drbl100 == null
                        ? null
                        : `DRBL ${signed(player.drbl100)}`,
                      player.mpg != null
                        ? `${formatNumber(player.mpg, 0)} mpg`
                        : null,
                      player.points != null
                        ? `${formatNumber(player.points, 0)} ppg`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-muted-foreground">
                  {formatUsdCompact(player.salary)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TradeSimulator({
  board,
  initialA,
  initialB,
  initialGive,
  initialGet,
}: {
  board: TradeSimulatorBoard;
  initialA?: string;
  initialB?: string;
  initialGive?: string[];
  initialGet?: string[];
}) {
  const teams = board.teams;
  const [teamAId, setTeamAId] = useState(
    initialA && teams.some((team) => team.id === initialA)
      ? initialA
      : (teams[0]?.id ?? "")
  );
  const [teamBId, setTeamBId] = useState(
    initialB &&
      teams.some((team) => team.id === initialB) &&
      initialB !== initialA
      ? initialB
      : (teams.find((team) => team.id !== teamAId)?.id ?? "")
  );
  const [sendA, setSendA] = useState(initialGive ?? []);
  const [sendB, setSendB] = useState(initialGet ?? []);

  const teamA = teams.find((team) => team.id === teamAId) ?? teams[0];
  const teamB = teams.find((team) => team.id === teamBId) ?? teams[1];

  const sketch = useMemo(() => {
    if (!teamA || !teamB) return null;
    return summarizePlayerTrade(teamA, sendA, teamB, sendB, board.cap);
  }, [board.cap, teamA, teamB, sendA, sendB]);

  useEffect(() => {
    if (!teamA || !teamB) return;
    const url = new URL(window.location.href);
    url.searchParams.set("a", teamA.id);
    url.searchParams.set("b", teamB.id);
    if (sendA.length) url.searchParams.set("give", sendA.join(","));
    else url.searchParams.delete("give");
    if (sendB.length) url.searchParams.set("get", sendB.join(","));
    else url.searchParams.delete("get");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [teamA, teamB, sendA, sendB]);

  if (!teamA || !teamB || !sketch) return null;

  const toggle = (
    id: string,
    list: string[],
    setList: (next: string[]) => void
  ) => {
    setList(
      list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
    );
  };

  const hasPackage = Boolean(sketch.sentCountA || sketch.sentCountB);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold">
          Team A
          <select
            className="h-10 w-full min-w-0 rounded-md border border-border bg-transparent px-3 text-[15px]"
            value={teamA.id}
            onChange={(event) => {
              setTeamAId(event.target.value);
              setSendA([]);
            }}
          >
            {teams
              .filter((team) => team.id !== teamB.id)
              .map((team) => (
                <option key={team.id} value={team.id}>
                  {team.abbr} · {team.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold">
          Team B
          <select
            className="h-10 w-full min-w-0 rounded-md border border-border bg-transparent px-3 text-[15px]"
            value={teamB.id}
            onChange={(event) => {
              setTeamBId(event.target.value);
              setSendB([]);
            }}
          >
            {teams
              .filter((team) => team.id !== teamA.id)
              .map((team) => (
                <option key={team.id} value={team.id}>
                  {team.abbr} · {team.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <PlayerColumn
          team={teamA}
          selected={sendA}
          onToggle={(id) => toggle(id, sendA, setSendA)}
        />
        <PlayerColumn
          team={teamB}
          selected={sendB}
          onToggle={(id) => toggle(id, sendB, setSendB)}
        />
      </div>

      <section className="sports-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
        <div>
          <h2 className="text-[16px] font-bold tracking-tight">Swap sketch</h2>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {board.season} known salaries and model rates only. Not a legality
            check. Picks, exceptions, holds, and dead money are omitted.
          </p>
        </div>
        {!hasPackage ? (
          <p className="text-[13px] text-muted-foreground">
            Check players to send. The URL keeps the package.
          </p>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <SideSummary abbr={teamA.abbr} side={sketch.sideA} />
              <SideSummary abbr={teamB.abbr} side={sketch.sideB} />
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <PackageList
                title={`${teamA.abbr} sends`}
                players={teamA.players.filter((player) =>
                  sendA.includes(player.id)
                )}
              />
              <PackageList
                title={`${teamB.abbr} sends`}
                players={teamB.players.filter((player) =>
                  sendB.includes(player.id)
                )}
              />
            </div>
          </div>
        )}
        {hasPackage ? (
          <ul className="flex flex-col gap-1 text-[12px] leading-snug text-muted-foreground">
            {!sketch.completeSalary ? (
              <li>
                A moved player has no matched salary, so dollar totals are blank.
              </li>
            ) : null}
            {!sketch.completeImpact ? (
              <li>
                A moved player has no DRBL/100 row, so that impact is not summed.
              </li>
            ) : null}
            {sketch.sideA.war1Net == null || sketch.sideB.war1Net == null ? (
              <li>
                A moved player has no WAR1 row, so win equivalents are not
                summed.
              </li>
            ) : null}
            {sketch.sideA.bpmNet == null || sketch.sideB.bpmNet == null ? (
              <li>A moved player has no BPM row, so BPM is not summed.</li>
            ) : null}
            <li>
              Room figures use known commitments vs published{" "}
              {board.cap.status.toLowerCase()} lines (cap{" "}
              {formatUsdCompact(board.cap.salaryCap)}, tax{" "}
              {formatUsdCompact(board.cap.luxuryTax)}
              {board.cap.firstApron != null
                ? `, 1st apron ${formatUsdCompact(board.cap.firstApron)}`
                : ""}
              {board.cap.secondApron != null
                ? `, 2nd apron ${formatUsdCompact(board.cap.secondApron)}`
                : ""}
              ). Source: {board.cap.source}.
            </li>
          </ul>
        ) : null}
      </section>
    </div>
  );
}
