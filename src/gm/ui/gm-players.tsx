"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { playerSheet } from "@/gm/engine/attributes";
import { scoutPotentialView } from "@/gm/engine/scouting";
import { perGame } from "@/gm/lib/counting";
import { countingForBoard, seasonHasGames, valueForBoard } from "@/gm/lib/season-line";
import { teamById, userTeam } from "@/gm/lib/selectors";
import { TeamLogo } from "@/components/brand/team-logo";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmCountingLine, GmLeagueState, GmPlayer, GmPosition } from "@/gm/types";
import { DRBL_PUBLIC_RATE_LABEL, WAR1_LABEL, formatWar1 } from "@/lib/drbl-public-labels";
import { UNAVAILABLE_STAT_LABEL, formatNumber } from "@/lib/format";

const POSITIONS: Array<GmPosition | "ALL"> = ["ALL", "PG", "SG", "SF", "PF", "C"];

type SortKey =
  | "war1"
  | "drbl"
  | "ovr"
  | "pot"
  | "age"
  | "name"
  | "team"
  | "pos"
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "mpg"
  | "salary";

const POS_ORDER: Record<GmPosition, number> = {
  PG: 1,
  SG: 2,
  SF: 3,
  PF: 4,
  C: 5,
};

type Rates = {
  gp: number;
  mpg: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
};

function ratesFrom(line: GmCountingLine | undefined): Rates | null {
  if (!line || line.gp < 1) return null;
  return {
    gp: line.gp,
    mpg: perGame(line.min, line.gp),
    ppg: perGame(line.pts, line.gp),
    rpg: perGame(line.reb, line.gp),
    apg: perGame(line.ast, line.gp),
    spg: perGame(line.stl, line.gp),
    bpg: perGame(line.blk, line.gp),
  };
}

function clubName(league: GmLeagueState, player: GmPlayer): string {
  if (league.draftPool.includes(player.id)) return "Draft";
  if (!player.teamId) return "FA";
  return teamById(league, player.teamId)?.abbr ?? "FA";
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE_STAT_LABEL;
  return formatNumber(value, 1);
}

function valueNum(value: number | null | undefined): string {
  return formatWar1(value, 1);
}

export function GmPlayersTable({ mode }: { mode: "all" | "leaders" }) {
  const league = useGmStore((s) => s.league);
  const params = useSearchParams();
  const initialTeam = params.get("team") ?? "ALL";
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("ALL");
  const [team, setTeam] = useState(initialTeam);
  const [sort, setSort] = useState<SortKey>("war1");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    if (!league) return [];
    const q = query.trim().toLowerCase();
    const draftIds = new Set(league.draftPool);
    const scout = userTeam(league).staff.scout;
    return league.players
      .filter((player) => !draftIds.has(player.id))
      .map((player) => {
        const sheet = playerSheet(player);
        const rates = ratesFrom(countingForBoard(league, player) ?? undefined);
        const value = valueForBoard(league, player);
        const scouted = scoutPotentialView(player, scout);
        return { player, sheet, rates, value, club: clubName(league, player), scouted };
      })
      .filter((row) => {
        if (mode === "leaders" && !row.player.teamId) return false;
        if (mode === "leaders" && row.value.war1 == null && !row.rates) return false;
        if (q && !row.player.name.toLowerCase().includes(q)) return false;
        if (pos !== "ALL" && row.player.position !== pos) return false;
        if (team === "FA" && row.club !== "FA") return false;
        if (team !== "ALL" && team !== "FA" && row.player.teamId !== team) {
          return false;
        }
        return true;
      });
  }, [league, mode, pos, query, team]);

  const sorted = useMemo(() => {
    const sign = dir === "asc" ? 1 : -1;
    const missingLast = sort === "war1" || sort === "drbl";
    const value = (row: (typeof rows)[number]): number | string | null => {
      switch (sort) {
        case "name":
          return row.player.name;
        case "team":
          return row.club;
        case "pos":
          return POS_ORDER[row.player.position];
        case "war1":
          return row.value.war1;
        case "drbl":
          return row.value.drbl100;
        case "age":
          return row.player.age;
        case "ovr":
          return row.sheet.overall;
        case "pot":
          return (row.scouted.low + row.scouted.high) / 2;
        case "salary":
          return row.player.contract?.annualSalaryM ?? -1;
        case "ppg":
          return row.rates?.ppg ?? -1;
        case "rpg":
          return row.rates?.rpg ?? -1;
        case "apg":
          return row.rates?.apg ?? -1;
        case "spg":
          return row.rates?.spg ?? -1;
        case "bpg":
          return row.rates?.bpg ?? -1;
        case "mpg":
          return row.rates?.mpg ?? -1;
        default:
          return 0;
      }
    };
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (missingLast) {
        const aMissing = typeof av !== "number" || !Number.isFinite(av);
        const bMissing = typeof bv !== "number" || !Number.isFinite(bv);
        if (aMissing && bMissing) return b.sheet.overall - a.sheet.overall;
        if (aMissing) return 1;
        if (bMissing) return -1;
      }
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * sign;
      }
      if (av == null || bv == null) return b.sheet.overall - a.sheet.overall;
      if (av !== bv) return (av - bv) * sign;
      return b.sheet.overall - a.sheet.overall;
    });
  }, [dir, rows, sort]);

  if (!league) return null;
  const hasSim = seasonHasGames(league);
  const statNote = hasSim
    ? "WAR1 is their DRBL/100 times possessions played in this save. Counting stats follow those games."
    : "No games yet this save. WAR1, DRBL/100, and the counting columns are the season they entered with.";

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setDir((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(key);
    setDir(key === "name" || key === "team" || key === "pos" ? "asc" : "desc");
  }

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "war1", label: WAR1_LABEL },
    { key: "drbl", label: DRBL_PUBLIC_RATE_LABEL },
    { key: "ovr", label: "OVR" },
    { key: "pot", label: "Scout" },
    { key: "age", label: "Age" },
    { key: "mpg", label: "MPG" },
    { key: "ppg", label: "PPG" },
    { key: "rpg", label: "RPG" },
    { key: "apg", label: "APG" },
    { key: "spg", label: "SPG" },
    { key: "bpg", label: "BPG" },
    { key: "salary", label: "$" },
  ];

  const focusedTeam = team !== "ALL" && team !== "FA" ? team : null;

  useEffect(() => {
    const root = document.querySelector("[data-gm]");
    if (!(root instanceof HTMLElement) || !focusedTeam) return;
    const next = teamColorStyle(focusedTeam);
    const previousPrimary = root.style.getPropertyValue("--team-primary");
    const previousSecondary = root.style.getPropertyValue("--team-secondary");
    const colors = next as Record<string, string>;
    root.style.setProperty("--team-primary", String(colors["--team-primary"] ?? ""));
    root.style.setProperty("--team-secondary", String(colors["--team-secondary"] ?? ""));
    return () => {
      root.style.setProperty("--team-primary", previousPrimary);
      root.style.setProperty("--team-secondary", previousSecondary);
    };
  }, [focusedTeam]);

  return (
    <div
      className={focusedTeam ? "gm-focus flex flex-col gap-4" : "flex flex-col gap-4"}
      style={focusedTeam ? teamColorStyle(focusedTeam) : undefined}
    >
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          {focusedTeam ? <TeamLogo teamKey={focusedTeam} size="sm" /> : null}
          {mode === "leaders" ? "League leaders" : `Players (${sorted.length})`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "leaders"
            ? `Ranked across every club. ${statNote}`
            : `Players already in the league, plus free agents. Prospects stay on the draft board. ${statNote} Scout is a range, not the true ceiling.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search names"
          aria-label="Search players"
          className="rounded-full border-0 bg-secondary px-3 py-1.5 text-[13px] font-semibold outline-none"
        />
        <select
          value={team}
          onChange={(event) => setTeam(event.target.value)}
          aria-label="Team"
          className="rounded-full border-0 bg-secondary px-3 py-1.5 text-[13px] font-semibold outline-none"
        >
          <option value="ALL">All teams</option>
          <option value="FA">Free agents</option>
          {league.teams.map((club) => (
            <option key={club.id} value={club.id}>
              {club.abbr}
            </option>
          ))}
        </select>
        {POSITIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={option === pos ? "gm-nav__link is-active" : "gm-nav__link"}
            onClick={() => setPos(option)}
          >
            {option === "ALL" ? "All" : option}
          </button>
        ))}
      </div>
      <div className={focusedTeam ? "gm-club-panel overflow-x-auto" : "arena-panel overflow-x-auto"}>
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {mode === "leaders" ? <th className="px-3 py-2">#</th> : null}
              <th className="px-3 py-2">
                <SortButton label="Player" active={sort === "name"} dir={dir} onClick={() => toggleSort("name")} />
              </th>
              <th className="px-3 py-2">
                <SortButton label="Pos" active={sort === "pos"} dir={dir} onClick={() => toggleSort("pos")} />
              </th>
              <th className="px-3 py-2">
                <SortButton label="Team" active={sort === "team"} dir={dir} onClick={() => toggleSort("team")} />
              </th>
              {columns.map((column) => (
                <th key={column.key} className="px-3 py-2">
                  <SortButton
                    label={column.label}
                    active={sort === column.key}
                    dir={dir}
                    onClick={() => toggleSort(column.key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row, index) => (
              <tr
                key={row.player.id}
                className={row.player.teamId ? "gm-club-row" : undefined}
                style={row.player.teamId ? teamColorStyle(row.player.teamId) : undefined}
              >
                {mode === "leaders" ? (
                  <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                ) : null}
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <PlayerHeadshot
                      playerId={row.player.nbaPlayerId ?? row.player.id}
                      name={row.player.name}
                      teamKey={row.player.teamId}
                      size="xs"
                    />
                    <Link href={`/gm/player/${encodeURIComponent(row.player.id)}`}>
                      {row.player.name}
                    </Link>
                  </span>
                </td>
                <td className="px-3 py-2">{row.player.position}</td>
                <td className="px-3 py-2">
                  <ClubMark teamId={row.player.teamId} label={row.club} />
                </td>
                <td className="px-3 py-2 tabular-nums">{valueNum(row.value.war1)}</td>
                <td className="px-3 py-2 tabular-nums">{valueNum(row.value.drbl100)}</td>
                <td className="px-3 py-2 tabular-nums">{row.sheet.overall}</td>
                <td className="px-3 py-2 tabular-nums" title={row.scouted.comment}>
                  {row.scouted.low}-{row.scouted.high}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.player.age}</td>
                <td className="px-3 py-2 tabular-nums">{num(row.rates?.mpg)}</td>
                <td className="px-3 py-2 tabular-nums">{num(row.rates?.ppg)}</td>
                <td className="px-3 py-2 tabular-nums">{num(row.rates?.rpg)}</td>
                <td className="px-3 py-2 tabular-nums">{num(row.rates?.apg)}</td>
                <td className="px-3 py-2 tabular-nums">{num(row.rates?.spg)}</td>
                <td className="px-3 py-2 tabular-nums">{num(row.rates?.bpg)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.player.contract
                    ? `$${formatNumber(row.player.contract.annualSalaryM, 1)}M`
                    : UNAVAILABLE_STAT_LABEL}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players match that filter.</p>
      ) : null}
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="font-medium">
      {label}
      {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}
