"use client";

import { useMemo, useState } from "react";

import { useQueryNav } from "@/components/continuity/query-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Team } from "@/data/types";

export interface GameFilterToolbarProps {
  seasons: string[];
  teams: Team[];
  defaultSeason: string;
}

export function GameFilterToolbar({
  seasons,
  teams,
  defaultSeason,
}: GameFilterToolbarProps) {
  const { pending, replaceParams, searchParams } = useQueryNav();

  const season = searchParams.get("season") ?? defaultSeason;
  const team = searchParams.get("team") ?? "ALL";
  const startDate = searchParams.get("startDate") ?? "";
  const endDate = searchParams.get("endDate") ?? "";

  const [startDraft, setStartDraft] = useState(startDate);
  const [endDraft, setEndDraft] = useState(endDate);
  const [dateSource, setDateSource] = useState(`${startDate}|${endDate}`);

  if (`${startDate}|${endDate}` !== dateSource) {
    setDateSource(`${startDate}|${endDate}`);
    setStartDraft(startDate);
    setEndDraft(endDate);
  }

  function updateParams(patch: Record<string, string | null>) {
    const normalized: Record<string, string | null> = { ...patch };
    for (const [key, value] of Object.entries(normalized)) {
      if (value === "ALL") normalized[key] = null;
    }
    if (!("season" in normalized) && !searchParams.get("season")) {
      normalized.season = defaultSeason;
    } else if (normalized.season === null) {
      normalized.season = defaultSeason;
    }
    replaceParams(normalized);
  }

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [teams]
  );

  return (
    <form
      className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Game filters"
      onSubmit={(event) => {
        event.preventDefault();
        updateParams({
          startDate: startDraft || null,
          endDate: endDraft || null,
        });
      }}
      data-pending={pending ? "true" : "false"}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-filter-season">Season</Label>
        <Select
          value={season}
          onValueChange={(value) => {
            if (value != null) updateParams({ season: String(value) });
          }}
        >
          <SelectTrigger id="game-filter-season" className="w-full">
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
        <Label htmlFor="game-filter-team">Team</Label>
        <Select
          value={team}
          onValueChange={(value) => {
            if (value != null) updateParams({ team: String(value) });
          }}
        >
          <SelectTrigger id="game-filter-team" className="w-full">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All teams</SelectItem>
            {sortedTeams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-filter-start">Start date</Label>
        <Input
          id="game-filter-start"
          type="date"
          value={startDraft}
          onChange={(e) => setStartDraft(e.target.value)}
          onBlur={() => updateParams({ startDate: startDraft || null })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-filter-end">End date</Label>
        <Input
          id="game-filter-end"
          type="date"
          value={endDraft}
          onChange={(e) => setEndDraft(e.target.value)}
          onBlur={() => updateParams({ endDate: endDraft || null })}
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {pending ? "Updating game results…" : "Game results updated."}
      </p>
    </form>
  );
}
