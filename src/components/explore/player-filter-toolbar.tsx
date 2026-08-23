"use client";

import { useMemo, type HTMLAttributes, type ReactNode } from "react";
import { Calendar, ChevronLeft, ChevronRight, Shirt } from "lucide-react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import { useQueryNav } from "@/components/continuity/query-nav";
import { PlayerFilterSearch } from "@/components/explore/player-filter-search";
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
import { DEFAULT_PLAYER_MINIMUM_MINUTES } from "@/data/types";
import { type } from "@/lib/design-system";
import {
  PLAYER_BOARD_RATES,
  PLAYER_BOARD_VIEWS,
  parsePlayerBoardRate,
  parsePlayerBoardViews,
  serializePlayerBoardViews,
  togglePlayerBoardView,
} from "@/lib/explore-players-display";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import { listDraftClassYears, groupDraftClassYearsByDecade } from "@/lib/draft-class";
import { cn } from "@/lib/utils";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

const MIN_MINUTES_OPTIONS = [
  { value: "0", label: "Any min" },
  { value: "500", label: "500+ min" },
  { value: "1000", label: "1,000+ min" },
  { value: "1500", label: "1,500+ min" },
  { value: "2000", label: "2,000+ min" },
];

function ChipGroup({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <GlassSurface
      effect="css"
      overflowVisible
      className={cn("flex items-center gap-0.5 p-1", className)}
      {...rest}
    >
      {children}
    </GlassSurface>
  );
}

function Chip({
  active,
  onClick,
  children,
  disabled,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "rounded-md px-2.5 py-1.5 font-semibold transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      {children}
    </button>
  );
}

function TeamOption({ team }: { team: Team }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamLogo teamKey={team.abbreviation || team.id} size="xs" />
      <span className="truncate">{team.fullName}</span>
    </span>
  );
}

const selectTriggerClass =
  "h-7 border-0 bg-transparent shadow-none hover:bg-foreground/10 dark:bg-transparent dark:hover:bg-foreground/10 data-[size=default]:h-7 px-2.5 text-[12px] font-semibold";

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
  const { pending, replaceParams, searchParams } = useQueryNav();

  const season = searchParams.get("season") ?? defaultSeason;
  const team = searchParams.get("team") ?? "ALL";
  const conferenceParam = searchParams.get("conference")?.toLowerCase();
  const conference =
    conferenceParam === "east"
      ? "East"
      : conferenceParam === "west"
        ? "West"
        : undefined;
  const position = (searchParams.get("position") as Position | "ALL") ?? "ALL";
  const minimumMinutes =
    searchParams.get("minimumMinutes") ??
    String(DEFAULT_PLAYER_MINIMUM_MINUTES);
  const playerQuery = searchParams.get("player") ?? "";
  const views = parsePlayerBoardViews(searchParams.get("view"));
  const rate = parsePlayerBoardRate(searchParams.get("rate"));
  const allViews = views.length === 1 && views[0] === "all";
  const draftClassParam = searchParams.get("draftClass");
  const draftClassYears = useMemo(() => listDraftClassYears(), []);
  const draftClassDecades = useMemo(
    () => groupDraftClassYearsByDecade(draftClassYears),
    [draftClassYears]
  );
  const draftClassValue =
    draftClassParam?.toLowerCase() === "undrafted"
      ? "undrafted"
      : draftClassYears.includes(Number(draftClassParam))
        ? draftClassParam!
        : "ALL";
  const draftClassIndex =
    draftClassValue === "ALL" || draftClassValue === "undrafted"
      ? -1
      : draftClassYears.indexOf(Number(draftClassValue));
  const olderDraftClass =
    draftClassValue === "undrafted"
      ? String(draftClassYears[draftClassYears.length - 1])
      : draftClassIndex >= 0 && draftClassIndex < draftClassYears.length - 1
        ? String(draftClassYears[draftClassIndex + 1])
        : undefined;
  const newerDraftClass =
    draftClassValue === "ALL"
      ? String(draftClassYears[0])
      : draftClassValue === "undrafted"
        ? undefined
        : draftClassIndex > 0
          ? String(draftClassYears[draftClassIndex - 1])
          : "ALL";

  function updateParams(patch: Record<string, string | null>) {
    const normalized: Record<string, string | null> = { ...patch };
    for (const [key, value] of Object.entries(normalized)) {
      if (
        (value === "ALL" && key !== "season") ||
        (key === "minimumMinutes" &&
          value === String(DEFAULT_PLAYER_MINIMUM_MINUTES)) ||
        (key === "view" && value === "all") ||
        (key === "rate" && value === "perGame")
      ) {
        normalized[key] = null;
      }
    }
    if (
      "season" in patch ||
      "team" in patch ||
      "conference" in patch ||
      "draftClass" in patch ||
      "position" in patch ||
      "player" in patch ||
      "minimumMinutes" in patch
    ) {
      normalized.page = null;
    }
    if (!("season" in normalized) && !searchParams.get("season")) {
      normalized.season = defaultSeason;
    } else if (normalized.season === null) {
      normalized.season = defaultSeason;
    }
    replaceParams(normalized);
  }

  const { east, west, flat, groupByConference } = useMemo(() => {
    const byName = (a: Team, b: Team) => a.fullName.localeCompare(b.fullName);
    const eastTeams = teams.filter((t) => t.conference === "East").sort(byName);
    const westTeams = teams.filter((t) => t.conference === "West").sort(byName);
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
  const conferenceTeams =
    conference === "East" ? east : conference === "West" ? west : null;

  const seasonIsAll = season.toUpperCase() === "ALL";
  const seasonIndex = seasonIsAll ? -1 : Math.max(0, seasons.indexOf(season));
  const olderSeason = seasonIsAll
    ? seasons[seasons.length - 1]
    : seasons[seasonIndex + 1];
  const newerSeason = seasonIsAll
    ? seasons[0]
    : seasonIndex > 0
      ? seasons[seasonIndex - 1]
      : undefined;
  let seasonYear = seasonIsAll ? "All" : season.slice(0, 4);
  if (!seasonIsAll) {
    try {
      seasonYear = String(espnYearFromCanonicalSeason(season));
    } catch {
      /* keep start year */
    }
  }

  return (
    <GlassSurface
      overflowVisible
      className="relative z-40 p-2 sm:p-3"
    >
    <form
      className="flex flex-col gap-2"
      aria-label="Player filters"
      onSubmit={(event) => {
        event.preventDefault();
      }}
      data-pending={pending ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-2 max-sm:gap-1.5">
        <ChipGroup>
          <button
            type="button"
            aria-label="Older season"
            disabled={!olderSeason}
            onClick={() => olderSeason && updateParams({ season: olderSeason })}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <Select
            value={season}
            onValueChange={(value) => {
              if (value != null) updateParams({ season: String(value) });
            }}
          >
            <SelectTrigger
              id="filter-season"
              className={cn(selectTriggerClass, "min-w-[6.5rem] gap-1.5")}
              aria-label="Season"
            >
              <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
              <SelectValue>{seasonYear}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
              <SelectItem value="ALL">All seasons</SelectItem>
              {seasons.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label="Newer season"
            disabled={!newerSeason}
            onClick={() => newerSeason && updateParams({ season: newerSeason })}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </ChipGroup>

        <ChipGroup>
          <button
            type="button"
            aria-label="Older draft class"
            disabled={!olderDraftClass}
            onClick={() =>
              olderDraftClass && updateParams({ draftClass: olderDraftClass })
            }
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <Select
            value={draftClassValue}
            onValueChange={(value) => {
              if (value != null) updateParams({ draftClass: String(value) });
            }}
          >
            <SelectTrigger
              id="filter-draft-class"
              className={cn(selectTriggerClass, "min-w-[6.5rem] gap-1.5")}
              aria-label="Draft class"
            >
              <Shirt
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <SelectValue>
                {draftClassValue === "ALL"
                  ? "All"
                  : draftClassValue === "undrafted"
                    ? "UDFA"
                    : draftClassValue}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
              <SelectItem value="ALL">All classes</SelectItem>
              {draftClassDecades.map((group) => (
                <SelectGroup key={group.decade}>
                  <SelectLabel className={type.caption}>{`${group.decade}s`}</SelectLabel>
                  {group.years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              <SelectItem value="undrafted">Undrafted</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label="Newer draft class"
            disabled={!newerDraftClass}
            onClick={() =>
              newerDraftClass && updateParams({ draftClass: newerDraftClass })
            }
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </ChipGroup>

        <ChipGroup>
          <Chip active>Regular</Chip>
          <Chip disabled>Playoffs</Chip>
        </ChipGroup>

        <ChipGroup aria-label="Conference">
          {(["East", "West"] as const).map((conf) => (
            <Chip
              key={conf}
              active={conference === conf}
              onClick={() => {
                const next = conference === conf ? null : conf;
                const patch: Record<string, string | null> = {
                  conference: next,
                };
                if (
                  next &&
                  selectedTeam &&
                  selectedTeam.conference !== next
                ) {
                  patch.team = null;
                }
                updateParams(patch);
              }}
            >
              {conf}
            </Chip>
          ))}
        </ChipGroup>

        <ChipGroup>
          <Select
            value={team}
            onValueChange={(value) => {
              if (value == null) return;
              const patch: Record<string, string | null> = {
                team: String(value),
              };
              if (value !== "ALL" && conference) {
                const picked = teams.find(
                  (t) => t.id === value || t.abbreviation === value
                );
                if (picked && picked.conference !== conference) {
                  patch.conference = null;
                }
              }
              updateParams(patch);
            }}
          >
            <SelectTrigger
              id="filter-team"
              className={cn(selectTriggerClass, "min-w-[8.5rem]")}
              aria-label="Team"
            >
              <SelectValue placeholder="Select team">
                {selectedTeam ? (
                  <TeamOption team={selectedTeam} />
                ) : (
                  "Select team"
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              align="start"
              side="bottom"
              alignItemWithTrigger={false}
              className="min-w-[16rem]"
            >
              <SelectItem value="ALL">All teams</SelectItem>
              {conferenceTeams ? (
                conferenceTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <TeamOption team={t} />
                  </SelectItem>
                ))
              ) : groupByConference ? (
                <>
                  <SelectGroup>
                    <SelectLabel className="px-2 pt-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                      Eastern Conference
                    </SelectLabel>
                    {east.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <TeamOption team={t} />
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="px-2 pt-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
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
        </ChipGroup>

        <ChipGroup>
          {POSITIONS.map((pos) => (
            <Chip
              key={pos}
              active={position === pos}
              onClick={() =>
                updateParams({ position: position === pos ? "ALL" : pos })
              }
            >
              {pos}
            </Chip>
          ))}
        </ChipGroup>

        <ChipGroup>
          <Select
            value={minimumMinutes}
            onValueChange={(value) => {
              if (value != null) updateParams({ minimumMinutes: String(value) });
            }}
          >
            <SelectTrigger
              id="filter-minutes"
              className={cn(selectTriggerClass, "min-w-[7.25rem]")}
              aria-label="Minimum minutes"
            >
              <SelectValue placeholder="Minutes">
                {MIN_MINUTES_OPTIONS.find((o) => o.value === minimumMinutes)
                  ?.label ?? "Any min"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
              {MIN_MINUTES_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ChipGroup>

        <ChipGroup className="relative min-w-[10rem] flex-1">
          <PlayerFilterSearch
            season={season}
            value={playerQuery}
            onCommit={(player) => updateParams({ player })}
          />
        </ChipGroup>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ChipGroup
          className="max-sm:w-full max-sm:overflow-x-auto max-sm:flex-nowrap [-ms-overflow-style:none] [scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden"
          aria-label="Stat categories"
        >
          {PLAYER_BOARD_VIEWS.map((item) => (
            <Chip
              key={item.id}
              active={
                item.id === "all"
                  ? allViews
                  : !allViews && views.includes(item.id)
              }
              onClick={() =>
                updateParams({
                  view: serializePlayerBoardViews(
                    togglePlayerBoardView(views, item.id)
                  ),
                })
              }
            >
              <span className="whitespace-nowrap">{item.label}</span>
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup className="max-sm:w-full max-sm:overflow-x-auto max-sm:flex-nowrap [-ms-overflow-style:none] [scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden">
          {PLAYER_BOARD_RATES.map((item) => (
            <Chip
              key={item.id}
              active={rate === item.id}
              onClick={() => updateParams({ rate: item.id })}
            >
              <span className="whitespace-nowrap">{item.label}</span>
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <p className="sr-only" aria-live="polite">
        {pending ? "Updating player results…" : "Player results updated."}
      </p>
    </form>
    </GlassSurface>
  );
}
