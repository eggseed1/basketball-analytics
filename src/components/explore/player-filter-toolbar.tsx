"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Position, Team } from "@/data/types";
import {
  PLAYER_SORT_OPTIONS,
  getPlayerSortOption,
  parseSortDir,
} from "@/lib/player-explore-sort";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

const POSITIONS: Array<Position | "ALL"> = [
  "ALL",
  "PG",
  "SG",
  "SF",
  "PF",
  "C",
];

const MIN_MINUTES_OPTIONS = [
  { value: "0", label: "Any" },
  { value: "500", label: "500+" },
  { value: "1000", label: "1,000+" },
  { value: "1500", label: "1,500+" },
  { value: "2000", label: "2,000+" },
];

export interface PlayerFilterToolbarProps {
  seasons: string[];
  teams: Team[];
  defaultSeason: string;
}

export function PlayerFilterToolbar({
  seasons,
  teams,
  defaultSeason,
}: PlayerFilterToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const season = searchParams.get("season") ?? defaultSeason;
  const team = searchParams.get("team") ?? "ALL";
  const position = (searchParams.get("position") as Position | "ALL") ?? "ALL";
  const minimumMinutes = searchParams.get("minimumMinutes") ?? "0";
  const playerQuery = searchParams.get("player") ?? "";
  const sortKey = getPlayerSortOption(searchParams.get("sort")).key;
  const sortDir = parseSortDir(searchParams.get("dir"));

  const [playerDraft, setPlayerDraft] = useState(playerQuery);
  const [draftSource, setDraftSource] = useState(playerQuery);
  const [seasonDraft, setSeasonDraft] = useState(season);

  if (playerQuery !== draftSource) {
    setDraftSource(playerQuery);
    setPlayerDraft(playerQuery);
  }

  useEffect(() => {
    setSeasonDraft(season);
  }, [season]);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (
          value === null ||
          value === "" ||
          value === "ALL" ||
          (key === "minimumMinutes" && value === "0")
        ) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      // Drop default sort from the URL to keep links clean.
      if (
        (next.get("sort") ?? "pointsPerGame") === "pointsPerGame" &&
        (next.get("dir") ?? "desc") === "desc"
      ) {
        next.delete("sort");
        next.delete("dir");
      }

      if (!next.get("season")) {
        next.set("season", defaultSeason);
      }
      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      // Season changes push history so browser Back returns to the prior season.
      const nav = Object.prototype.hasOwnProperty.call(patch, "season")
        ? router.push
        : router.replace;
      startTransition(() => {
        nav.call(router, href, { scroll: false });
      });
    },
    [defaultSeason, pathname, router, searchParams]
  );

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [teams]
  );

  const selectedTeam = sortedTeams.find((t) => t.id === team);
  const teamLabel =
    team === "ALL"
      ? "All teams"
      : selectedTeam
        ? `${selectedTeam.abbreviation} — ${selectedTeam.fullName}`
        : nbaTeamAbbr(team);

  const hasActiveFilters =
    team !== "ALL" ||
    position !== "ALL" ||
    minimumMinutes !== "0" ||
    playerQuery.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      <form
        className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        aria-label="Player filters"
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({ player: playerDraft.trim() || null });
        }}
        data-pending={isPending ? "true" : "false"}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-season">Season</Label>
          <Select
            value={seasonDraft}
            onValueChange={(value) => {
              if (value == null) return;
              const next = String(value);
              setSeasonDraft(next);
              updateParams({ season: next });
            }}
          >
            <SelectTrigger
              id="filter-season"
              className="w-full"
              disabled={isPending}
            >
              <SelectValue placeholder="Season">{seasonDraft}</SelectValue>
            </SelectTrigger>
            <SelectContent
              className="max-h-72"
              alignItemWithTrigger={false}
            >
              {seasons.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-team">Team</Label>
          <Select
            value={team}
            onValueChange={(value) => {
              if (value != null) updateParams({ team: String(value) });
            }}
          >
            <SelectTrigger id="filter-team" className="w-full">
              <SelectValue placeholder="Team">{teamLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="ALL">All teams</SelectItem>
              {sortedTeams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.abbreviation} — {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-position">Position</Label>
          <Select
            value={position}
            onValueChange={(value) => {
              if (value != null) updateParams({ position: String(value) });
            }}
          >
            <SelectTrigger id="filter-position" className="w-full">
              <SelectValue placeholder="Position">
                {position === "ALL" ? "All positions" : position}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {POSITIONS.map((pos) => (
                <SelectItem key={pos} value={pos}>
                  {pos === "ALL" ? "All positions" : pos}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-minutes">Minimum minutes</Label>
          <Select
            value={minimumMinutes}
            onValueChange={(value) => {
              if (value != null) updateParams({ minimumMinutes: String(value) });
            }}
          >
            <SelectTrigger id="filter-minutes" className="w-full">
              <SelectValue placeholder="Minutes">
                {MIN_MINUTES_OPTIONS.find((o) => o.value === minimumMinutes)
                  ?.label ?? "Any"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MIN_MINUTES_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-sort">Sort by</Label>
          <Select
            value={sortKey}
            onValueChange={(value) => {
              if (value == null) return;
              const opt = getPlayerSortOption(String(value));
              updateParams({
                sort: opt.key,
                dir: opt.defaultDir,
              });
            }}
          >
            <SelectTrigger id="filter-sort" className="w-full">
              <SelectValue placeholder="Sort">
                {getPlayerSortOption(sortKey).label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {PLAYER_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-dir">Order</Label>
          <Select
            value={sortDir}
            onValueChange={(value) => {
              if (value != null) updateParams({ dir: String(value) });
            }}
          >
            <SelectTrigger id="filter-dir" className="w-full">
              <SelectValue placeholder="Order">
                {sortDir === "asc" ? "Low → high" : "High → low"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">High → low</SelectItem>
              <SelectItem value="asc">Low → high</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-6">
          <Label htmlFor="filter-player">Search player</Label>
          <Input
            id="filter-player"
            name="player"
            value={playerDraft}
            onChange={(event) => setPlayerDraft(event.target.value)}
            onBlur={() =>
              updateParams({ player: playerDraft.trim() || null })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                updateParams({ player: playerDraft.trim() || null });
              }
            }}
            placeholder="Search this season by name or id"
            autoComplete="off"
          />
        </div>

        <p className="sr-only" aria-live="polite">
          {isPending ? "Updating player results…" : "Player results updated."}
        </p>
      </form>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Viewing:</span>
          {team !== "ALL" ? (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
              {teamLabel}
            </span>
          ) : null}
          {position !== "ALL" ? (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
              {position}
            </span>
          ) : null}
          {minimumMinutes !== "0" ? (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
              {minimumMinutes}+ min
            </span>
          ) : null}
          {playerQuery.trim() ? (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
              “{playerQuery.trim()}”
            </span>
          ) : null}
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={() =>
              updateParams({
                team: null,
                position: null,
                minimumMinutes: null,
                player: null,
              })
            }
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}
