"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { formatNumber } from "@/lib/format";
import { formatUsdCompact, formatUsdDollars } from "@/lib/format-money";
import {
  summarizePlayerTrade,
  type TradeSimTeam,
  type TradeSketchSide,
} from "@/lib/trade-simulator";
import type { TradeSimulatorBoard } from "@/data/queries/trade-simulator";
import { cn } from "@/lib/utils";

function signedDrbl(value: number): string {
  const text = formatNumber(value, 2);
  return value > 0 ? `+${text}` : text;
}

function SideSummary({
  abbr,
  side,
}: {
  abbr: string;
  side: TradeSketchSide;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {abbr}
      </p>
      <p className="text-[14px] font-semibold tabular-nums">
        {formatUsdDollars(side.sentSalary)} out · {formatUsdDollars(side.receivedSalary)} in
      </p>
      <p className="text-[13px] text-muted-foreground">
        Known commitments after: {formatUsdCompact(side.knownCommitmentsAfter)}
      </p>
      <p className="text-[13px] text-muted-foreground">
        DRBL/100 net: {side.drblNet == null ? "—" : signedDrbl(side.drblNet)}
      </p>
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
  const needle = query.trim().toLowerCase();
  const players = needle
    ? team.players.filter((player) => player.name.toLowerCase().includes(needle))
    : team.players;

  return (
    <div className="sports-card flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <TeamLogo teamKey={team.abbr} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{team.name}</p>
          <p className="text-[12px] text-muted-foreground">
            Known commitments {formatUsdCompact(team.knownCommitments)}
            {team.playersWithoutSalary
              ? ` · ${team.playersWithoutSalary} salaries unmatched`
              : ""}
          </p>
        </div>
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter players"
        className="h-9 rounded-md border border-border bg-transparent px-3 text-[14px] outline-none"
      />
      <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
        {players.map((player) => {
          const on = selected.includes(player.id);
          return (
            <li key={player.id}>
              <div
                className={cn(
                  "flex items-start justify-between gap-3 rounded-md px-2 py-1.5",
                  on ? "bg-foreground/10" : "hover:bg-foreground/5"
                )}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(player.id)}
                    aria-label={`Send ${player.name}`}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    {player.href ? (
                      <Link
                        href={player.href}
                        className="text-[14px] font-semibold underline-offset-2 hover:underline"
                      >
                        {player.name}
                      </Link>
                    ) : (
                      <span className="text-[14px] font-semibold">{player.name}</span>
                    )}
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {player.drbl100 == null
                        ? "No DRBL/100"
                        : `${signedDrbl(player.drbl100)} DRBL/100`}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                  {formatUsdCompact(player.salary)}
                </span>
              </div>
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
      : teams[0]?.id ?? ""
  );
  const [teamBId, setTeamBId] = useState(
    initialB && teams.some((team) => team.id === initialB) && initialB !== initialA
      ? initialB
      : teams.find((team) => team.id !== teamAId)?.id ?? ""
  );
  const [sendA, setSendA] = useState(initialGive ?? []);
  const [sendB, setSendB] = useState(initialGet ?? []);

  const teamA = teams.find((team) => team.id === teamAId) ?? teams[0];
  const teamB = teams.find((team) => team.id === teamBId) ?? teams[1];

  const sketch = useMemo(() => {
    if (!teamA || !teamB) return null;
    return summarizePlayerTrade(teamA, sendA, teamB, sendB);
  }, [teamA, teamB, sendA, sendB]);

  if (!teamA || !teamB || !sketch) return null;

  const toggle = (
    id: string,
    list: string[],
    setList: (next: string[]) => void
  ) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Team A
          <select
            className="h-10 rounded-md border border-border bg-transparent px-3 text-[15px]"
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
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Team B
          <select
            className="h-10 rounded-md border border-border bg-transparent px-3 text-[15px]"
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

      <div className="grid gap-4 lg:grid-cols-2">
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

      <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <div>
          <h2 className="text-[16px] font-bold tracking-tight">Swap sketch</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {board.season} player salaries only. This is not a legality check.
            Draft picks, trade exceptions, cap holds, and hard-cap rules are
            not in the ledger, so they are not in this tool.
          </p>
        </div>
        {!sketch.sentCountA && !sketch.sentCountB ? (
          <p className="text-[14px] text-muted-foreground">
            Check players to send. Each checked player leaves that team.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <SideSummary abbr={teamA.abbr} side={sketch.sideA} />
            <SideSummary abbr={teamB.abbr} side={sketch.sideB} />
          </div>
        )}
        {sketch.sentCountA || sketch.sentCountB ? (
          <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
            {!sketch.completeSalary ? (
              <li>A moved player has no matched salary, so the dollar totals are blank.</li>
            ) : null}
            {!sketch.completeImpact ? (
              <li>A moved player has no DRBL/100 row, so impact is not summed.</li>
            ) : null}
            <li>
              Published {board.cap.status.toLowerCase()} lines: cap{" "}
              {formatUsdCompact(board.cap.salaryCap)}, tax{" "}
              {formatUsdCompact(board.cap.luxuryTax)}
              {board.cap.firstApron != null
                ? `, first apron ${formatUsdCompact(board.cap.firstApron)}`
                : ""}
              {board.cap.secondApron != null
                ? `, second apron ${formatUsdCompact(board.cap.secondApron)}`
                : ""}
              . Source: {board.cap.source}. Commitments here still omit unmatched
              salaries, holds, and dead money.
            </li>
          </ul>
        ) : null}
      </section>
    </div>
  );
}
