"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [teams]
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
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
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
