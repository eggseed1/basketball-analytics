"use client";

import { useRef, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { ChoiceTrack } from "@/components/ui/choice-chip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NBA_TEAM_META } from "@/data/providers/nba/nba-team-meta";
import { filterSelectTriggerClass } from "@/components/explore/filter-bar";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

export type TeamChoice = {
  id: string;
  abbreviation: string;
  fullName: string;
  conference?: "East" | "West";
};

/** Current 30 clubs, for pickers that are not tied to one season's board. */
export function currentTeamChoices(): TeamChoice[] {
  return Object.values(NBA_TEAM_META)
    .map((team) => ({
      id: team.abbreviation,
      abbreviation: team.abbreviation,
      fullName: team.fullName,
      conference: team.conference,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function TeamMark({ team }: { team: TeamChoice }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamLogo teamKey={team.abbreviation} size="xs" />
      <span className="truncate">{team.fullName}</span>
      <span className="shrink-0 text-muted-foreground">{team.abbreviation}</span>
    </span>
  );
}

function matchChoice(teams: TeamChoice[], value: string): TeamChoice | undefined {
  const direct = teams.find((team) => team.id === value || team.abbreviation === value);
  if (direct) return direct;
  const brand = resolveTeamBrand(value);
  if (!brand) return undefined;
  return teams.find(
    (team) =>
      team.abbreviation.toLowerCase() === brand.abbr.toLowerCase() ||
      team.id.toLowerCase() === brand.id
  );
}

export function TeamSelect({
  id,
  label = "Team",
  value,
  onChange,
  teams,
  empty,
  placeholder = "Pick a team",
  variant = "filter",
  className,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  teams: TeamChoice[];
  /** Shown when nothing specific is picked, for example All teams. */
  empty?: { value: string; label: string };
  placeholder?: string;
  variant?: "filter" | "field";
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = value && value !== empty?.value ? matchChoice(teams, value) : undefined;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? teams.filter(
        (team) =>
          team.fullName.toLowerCase().includes(needle) ||
          team.abbreviation.toLowerCase().includes(needle)
      )
    : teams;
  const east = visible.filter((team) => team.conference === "East");
  const west = visible.filter((team) => team.conference === "West");
  const grouped =
    !needle &&
    east.length > 0 &&
    west.length > 0 &&
    east.length + west.length === visible.length;

  const trigger = (
    <Select
      value={value || null}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      onOpenChangeComplete={(open) => {
        if (open) searchRef.current?.focus();
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className={cn(
          variant === "filter"
            ? cn(filterSelectTriggerClass, "w-auto min-w-[11.5rem] max-w-[18rem]")
            : "h-10 w-full min-w-0 justify-between rounded-md border-0 bg-transparent px-3 text-sm font-semibold shadow-none",
          className
        )}
      >
        <SelectValue placeholder={placeholder}>
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <TeamLogo teamKey={selected.abbreviation} size="xs" />
              <span className="truncate">{selected.fullName}</span>
            </span>
          ) : (
            empty?.label ?? placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        side="bottom"
        alignItemWithTrigger={false}
        collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
        className="max-h-[min(24rem,var(--available-height))] min-w-[18rem]"
        header={
          <div className="border-b border-border/40 p-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder="Search teams"
              aria-label="Search teams"
              className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        }
      >
        {!needle && empty ? (
          <SelectItem value={empty.value}>{empty.label}</SelectItem>
        ) : null}
        {visible.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">No teams match.</p>
        ) : grouped ? (
          <>
            <ConferenceGroup name="East" teams={east} />
            <ConferenceGroup name="West" teams={west} />
          </>
        ) : (
          visible.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              <TeamMark team={team} />
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );

  if (variant === "field") {
    return <div className="site-search-field min-w-0 rounded-md">{trigger}</div>;
  }

  return <ChoiceTrack>{trigger}</ChoiceTrack>;
}

function ConferenceGroup({ name, teams }: { name: string; teams: TeamChoice[] }) {
  return (
    <SelectGroup>
      <SelectLabel className="px-2 pt-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
        {name}
      </SelectLabel>
      {teams.map((team) => (
        <SelectItem key={team.id} value={team.id}>
          <TeamMark team={team} />
        </SelectItem>
      ))}
    </SelectGroup>
  );
}
