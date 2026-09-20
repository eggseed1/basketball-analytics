"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, Copy, RotateCcw, X } from "lucide-react";

import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPct } from "@/lib/format";
import { formatUsdCompact } from "@/lib/format-money";
import { resolveTeamBrand } from "@/lib/nba-brand";
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

function deltaClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return "text-muted-foreground";
  }
  return value > 0 ? "text-delta-up" : "text-delta-down";
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

function ChipPlayer({
  player,
  teamKey,
  onRemove,
}: {
  player: TradeSimPlayer;
  teamKey: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background/70 px-2 py-1.5">
      <PlayerHeadshot
        nbaId={player.id}
        name={player.name}
        teamKey={teamKey}
        size="xs"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold leading-tight">
          {player.name}
        </p>
        <p className="truncate text-[10px] tabular-nums text-muted-foreground">
          {formatUsdCompact(player.salary)}
          {player.drbl100 != null ? ` · ${signed(player.drbl100)}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${player.name}`}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function ImpactStat({
  label,
  value,
  digits = 2,
}: {
  label: string;
  value: number | null;
  digits?: number;
}) {
  return (
    <div className="min-w-0 rounded-md bg-background/55 px-2.5 py-2 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[18px] font-bold tabular-nums leading-none",
          deltaClass(value)
        )}
      >
        {value == null ? "—" : signed(value, digits)}
      </p>
    </div>
  );
}

function SideImpact({
  team,
  side,
  align = "left",
}: {
  team: TradeSimTeam;
  side: TradeSketchSide;
  align?: "left" | "right";
}) {
  const room = side.roomAfter ?? side.roomBefore;
  const brand = resolveTeamBrand(team.abbr);
  const right = align === "right";
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/60 bg-background/40 p-3",
        right && "text-right"
      )}
      style={
        brand
          ? ({
              borderColor: `color-mix(in oklab, ${brand.primary} 35%, transparent)`,
              boxShadow: right
                ? `inset -3px 0 0 0 ${brand.primary}`
                : `inset 3px 0 0 0 ${brand.primary}`,
            } as CSSProperties)
          : undefined
      }
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2",
          right && "flex-row-reverse"
        )}
      >
        <TeamLogo teamKey={team.abbr} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold">{team.abbr}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatUsdCompact(side.sentSalary)} out ·{" "}
            {formatUsdCompact(side.receivedSalary)} in
          </p>
        </div>
        <Badge
          variant={
            side.drblNet != null && side.drblNet > 0.05
              ? "positive"
              : side.drblNet != null && side.drblNet < -0.05
                ? "negative"
                : "neutral"
          }
          size="sm"
        >
          {side.drblNet == null ? "DRBL —" : `DRBL ${signed(side.drblNet)}`}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <ImpactStat label="DRBL" value={side.drblNet} />
        <ImpactStat label="WAR1" value={side.war1Net} />
        <ImpactStat label="BPM" value={side.bpmNet} />
      </div>
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
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        After {formatUsdCompact(side.knownCommitmentsAfter)}
        {side.knownLineAfter ? ` · ${side.knownLineAfter}` : ""}
        {" · roster "}
        {side.rosterCountBefore}→{side.rosterCountAfter}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Out {packageBits(side.sentPackage)} · In{" "}
        {packageBits(side.receivedPackage)}
      </p>
    </div>
  );
}

function PackageList({
  title,
  teamKey,
  players,
  align = "left",
}: {
  title: string;
  teamKey: string;
  players: TradeSimPlayer[];
  align?: "left" | "right";
}) {
  if (!players.length) return null;
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground",
          align === "right" && "text-right"
        )}
      >
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {players.map((player) => (
          <li
            key={player.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 rounded-md border border-border/60 px-2.5 py-2"
          >
            <PlayerHeadshot
              nbaId={player.id}
              name={player.name}
              teamKey={teamKey}
              size="sm"
            />
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
            <p className="col-span-3 text-[11px] leading-snug text-muted-foreground">
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
  align = "left",
}: {
  team: TradeSimTeam;
  selected: string[];
  onToggle: (id: string) => void;
  align?: "left" | "right";
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"salary" | "drbl" | "name">("salary");
  const brand = resolveTeamBrand(team.abbr);
  const right = align === "right";
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
    <div
      className="sports-card flex min-w-0 flex-col gap-3 overflow-hidden p-0"
      style={
        brand
          ? ({
              boxShadow: right
                ? `inset -3px 0 0 0 ${brand.primary}`
                : `inset 3px 0 0 0 ${brand.primary}`,
            } as CSSProperties)
          : undefined
      }
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2.5 px-3 pt-3 sm:px-4 sm:pt-4",
          right && "flex-row-reverse text-right"
        )}
      >
        <TeamLogo teamKey={team.abbr} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{team.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatUsdCompact(team.knownCommitments)} known ·{" "}
            {selected.length ? (
              <span className="font-semibold text-foreground">
                {selected.length} in deal
              </span>
            ) : (
              `${team.players.length} on book`
            )}
            {team.playersWithoutSalary
              ? ` · ${team.playersWithoutSalary} unmatched`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2 px-3 sm:px-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a player"
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
      <ul className="flex max-h-[26rem] flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 pb-3 sm:px-3 sm:pb-4">
        {players.map((player) => {
          const on = selected.includes(player.id);
          return (
            <li key={player.id}>
              <button
                type="button"
                onClick={() => onToggle(player.id)}
                aria-pressed={on}
                aria-label={
                  on ? `Remove ${player.name} from deal` : `Add ${player.name}`
                }
                className={cn(
                  "grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-[var(--duration-fast)]",
                  on
                    ? "bg-foreground/10 ring-1 ring-foreground/20"
                    : "hover:bg-foreground/5"
                )}
              >
                <div className="relative">
                  <PlayerHeadshot
                    nbaId={player.id}
                    name={player.name}
                    teamKey={team.abbr}
                    size="sm"
                  />
                  {on ? (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </div>
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
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-semibold tabular-nums">
                    {formatUsdCompact(player.salary)}
                  </span>
                  {on ? (
                    <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Sending
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? (
        <Check data-icon="inline-start" />
      ) : (
        <Copy data-icon="inline-start" />
      )}
      {copied ? "Copied" : "Copy link"}
    </Button>
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

  const swapTeams = () => {
    setTeamAId(teamB.id);
    setTeamBId(teamA.id);
    setSendA(sendB);
    setSendB(sendA);
  };

  const clearDeal = () => {
    setSendA([]);
    setSendB([]);
  };

  const playersA = teamA.players.filter((player) => sendA.includes(player.id));
  const playersB = teamB.players.filter((player) => sendB.includes(player.id));
  const hasPackage = Boolean(sketch.sentCountA || sketch.sentCountB);

  const aWins =
    sketch.sideA.drblNet != null &&
    sketch.sideB.drblNet != null &&
    sketch.sideA.drblNet > sketch.sideB.drblNet + 0.05;
  const bWins =
    sketch.sideA.drblNet != null &&
    sketch.sideB.drblNet != null &&
    sketch.sideB.drblNet > sketch.sideA.drblNet + 0.05;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <MatchupWashCard
        awayTeamKey={teamA.abbr}
        homeTeamKey={teamB.abbr}
        intensity="subtle"
        className="min-w-0 p-3 sm:p-4"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={swapTeams}
              aria-label="Swap sides"
            >
              <ArrowLeftRight data-icon="inline-start" />
              Flip
            </Button>
            {hasPackage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearDeal}
              >
                <RotateCcw data-icon="inline-start" />
                Clear
              </Button>
            ) : null}
            <CopyLinkButton />
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3">
            <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold">
              <span className="flex min-w-0 items-center gap-2">
                <TeamLogo teamKey={teamA.abbr} size="sm" />
                <span className="truncate">Team A · {teamA.abbr}</span>
              </span>
              <select
                className="h-10 w-full min-w-0 rounded-md border border-border bg-background/80 px-2 text-[14px] sm:px-3 sm:text-[15px]"
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
            <div className="flex h-10 items-center justify-center px-0.5">
              <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
            <label className="flex min-w-0 flex-col gap-1 text-right text-[12px] font-semibold">
              <span className="flex min-w-0 items-center justify-end gap-2">
                <span className="truncate">Team B · {teamB.abbr}</span>
                <TeamLogo teamKey={teamB.abbr} size="sm" />
              </span>
              <select
                className="h-10 w-full min-w-0 rounded-md border border-border bg-background/80 px-2 text-right text-[14px] sm:px-3 sm:text-[15px]"
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
        </div>
      </MatchupWashCard>

      <section className="sports-card min-w-0 p-3 sm:p-4">
        {!hasPackage ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-[15px] font-bold tracking-tight">
              Tap players to build the deal
            </p>
            <p className="max-w-md text-[13px] leading-snug text-muted-foreground">
              {teamA.abbr} on the left, {teamB.abbr} on the right. Click a name
              to send them — the tray and DRBL board update as you go.
            </p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-bold tracking-tight">
                  The deal
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {playersA.length + playersB.length} player
                  {playersA.length + playersB.length === 1 ? "" : "s"} moving
                </p>
              </div>
              {aWins || bWins ? (
                <Badge variant="elite" size="sm">
                  {aWins
                    ? `${teamA.abbr} edges DRBL`
                    : `${teamB.abbr} edges DRBL`}
                </Badge>
              ) : sketch.completeImpact ? (
                <Badge variant="neutral" size="sm">
                  Even on DRBL
                </Badge>
              ) : null}
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {teamA.abbr} sends →
                </p>
                {playersA.length ? (
                  playersA.map((player) => (
                    <ChipPlayer
                      key={player.id}
                      player={player}
                      teamKey={teamA.abbr}
                      onRemove={() => toggle(player.id, sendA, setSendA)}
                    />
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[12px] text-muted-foreground">
                    Nobody yet
                  </p>
                )}
              </div>
              <div className="flex items-center justify-center py-1 sm:pt-7">
                <div className="flex size-9 items-center justify-center rounded-full border border-border bg-background">
                  <ArrowLeftRight className="size-4" />
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-right text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  ← {teamB.abbr} sends
                </p>
                {playersB.length ? (
                  playersB.map((player) => (
                    <ChipPlayer
                      key={player.id}
                      player={player}
                      teamKey={teamB.abbr}
                      onRemove={() => toggle(player.id, sendB, setSendB)}
                    />
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[12px] text-muted-foreground">
                    Nobody yet
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
        <PlayerColumn
          team={teamA}
          selected={sendA}
          align="left"
          onToggle={(id) => toggle(id, sendA, setSendA)}
        />
        <PlayerColumn
          team={teamB}
          selected={sendB}
          align="right"
          onToggle={(id) => toggle(id, sendB, setSendB)}
        />
      </div>

      {hasPackage ? (
        <section className="sports-card flex min-w-0 flex-col gap-3 p-3 sm:p-4">
          <div>
            <h2 className="text-[16px] font-bold tracking-tight">
              Impact board
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Model nets and room to published {board.season} lines — not a
              legality check. Picks, exceptions, holds, and dead money are
              omitted.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
            <SideImpact team={teamA} side={sketch.sideA} align="left" />
            <SideImpact team={teamB} side={sketch.sideB} align="right" />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
            <PackageList
              title={`${teamA.abbr} package`}
              teamKey={teamA.abbr}
              players={playersA}
              align="left"
            />
            <PackageList
              title={`${teamB.abbr} package`}
              teamKey={teamB.abbr}
              players={playersB}
              align="right"
            />
          </div>
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
        </section>
      ) : null}
    </div>
  );
}
