"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { TeamLogo } from "@/components/brand/team-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Position, Team } from "@/data/types";

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

function TeamOption({ team }: { team: Team }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamLogo teamKey={team.abbreviation || team.id} size="xs" />
      <span className="truncate">{team.fullName}</span>
    </span>
  );
}

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

  const [playerDraft, setPlayerDraft] = useState(playerQuery);
  const [draftSource, setDraftSource] = useState(playerQuery);

  // Keep the draft input aligned when URL search changes (e.g. back/forward).
  if (playerQuery !== draftSource) {
    setDraftSource(playerQuery);
    setPlayerDraft(playerQuery);
  }

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
      if (!next.get("season")) {
        next.set("season", defaultSeason);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [defaultSeason, pathname, router, searchParams]
  );

  const { east, west, flat, groupByConference } = useMemo(() => {
    const byName = (a: Team, b: Team) => a.fullName.localeCompare(b.fullName);
    const eastTeams = teams
      .filter((t) => t.conference === "East")
      .sort(byName);
    const westTeams = teams
      .filter((t) => t.conference === "West")
      .sort(byName);
    // Only split when both conferences are meaningfully represented.
    const group =
      eastTeams.length >= 5 &&
      westTeams.length >= 5 &&
      eastTeams.length + westTeams.length >= teams.length * 0.8;
    return {
      east: eastTeams,
      west: westTeams,
      flat: [...teams].sort(byName),
      groupByConference: group,
    };
  }, [teams]);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === team || t.abbreviation === team),
    [teams, team]
  );

  return (
    <form
      className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
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
          value={season}
          onValueChange={(value) => {
            if (value != null) updateParams({ season: String(value) });
          }}
        >
          <SelectTrigger id="filter-season" className="w-full">
            <SelectValue placeholder="Season" />
          </SelectTrigger>
          <SelectContent>
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
            <SelectValue placeholder="Team">
              {selectedTeam ? (
                <TeamOption team={selectedTeam} />
              ) : team === "ALL" ? (
                "All teams"
              ) : (
                team
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[16rem]">
            <SelectItem value="ALL">All teams</SelectItem>
            {groupByConference ? (
              <>
                <SelectGroup>
                  <SelectLabel className="px-2 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Eastern Conference
                  </SelectLabel>
                  {east.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <TeamOption team={t} />
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="px-2 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Western Conference
                  </SelectLabel>
                  {west.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <TeamOption team={t} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            ) : (
              flat.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <TeamOption team={t} />
                </SelectItem>
              ))
            )}
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
            <SelectValue placeholder="Position" />
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
            <SelectValue placeholder="Minutes" />
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
        <Label htmlFor="filter-player">Search player</Label>
        <Input
          id="filter-player"
          name="player"
          value={playerDraft}
          onChange={(event) => setPlayerDraft(event.target.value)}
          onBlur={() =>
            updateParams({ player: playerDraft.trim() || null })
          }
          placeholder="Name or id"
          autoComplete="off"
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {isPending ? "Updating player results…" : "Player results updated."}
      </p>
    </form>
  );
}
