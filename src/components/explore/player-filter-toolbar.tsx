"use client";

import { useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { Calendar, ChevronLeft, ChevronRight, Shirt } from "lucide-react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import { useQueryNav } from "@/components/continuity/query-nav";
import { TeamSelect } from "@/components/teams/team-select";
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
import { defaultExploreMinimumMinutesSync } from "@/lib/player-board-season";
import { cn } from "@/lib/utils";
import { usePlayerBoardI18n } from "@/components/explore/use-player-board-i18n";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

const MIN_MINUTES_VALUES = ["0", "500", "1000", "1500", "2000"] as const;

function ChipGroup({
  children,
  className,
  scrollable = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Horizontal chip scroller — keeps the page from overflowing. */
  scrollable?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <ChoiceTrack className={className} scrollable={scrollable} {...rest}>
      {children}
    </ChoiceTrack>
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
    <ChoiceChip active={active} onClick={onClick} disabled={disabled}>
      {children}
    </ChoiceChip>
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
  const { t, tCommon, tStandings, viewLabel, rateLabel } = usePlayerBoardI18n();

  const minMinutesOptions = useMemo(
    () =>
      MIN_MINUTES_VALUES.map((value) => ({
        value,
        label:
          value === "0"
            ? t("anyMin")
            : value === "500"
              ? t("min500")
              : value === "1000"
                ? t("min1000")
                : value === "1500"
                  ? t("min1500")
                  : t("min2000"),
      })),
    [t]
  );

  const season = searchParams.get("season") ?? defaultSeason;
  const defaultMinMinutes = String(defaultExploreMinimumMinutesSync(season));
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
    searchParams.get("minimumMinutes") ?? defaultMinMinutes;
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
    const defaultIsAll = defaultSeason.toUpperCase() === "ALL";
    for (const [key, value] of Object.entries(normalized)) {
      if (
        (value === "ALL" && key !== "season") ||
        (key === "season" &&
          String(value ?? "").toUpperCase() === "ALL" &&
          defaultIsAll) ||
        (key === "minimumMinutes" && value === defaultMinMinutes) ||
        // view=all / view=impact: serializePlayerBoardViews already omits the
        // default chip. Do not strip "all" here — that used to fight Impact
        // as the default and made the All chip a no-op.
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
    // Season change: drop a stale minutes floor so the destination season's
    // early-week default (0 for All / current opener) can apply.
    if ("season" in patch && !("minimumMinutes" in patch)) {
      normalized.minimumMinutes = null;
    }
    // Pin a concrete default season into the URL when missing. All is omitted
    // so `/explore/players` stays the clean All default.
    if (!defaultIsAll) {
      if (!("season" in normalized) && !searchParams.get("season")) {
        normalized.season = defaultSeason;
      } else if (normalized.season === null) {
        normalized.season = defaultSeason;
      }
    }
    replaceParams(normalized);
  }

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === team || t.abbreviation === team),
    [teams, team]
  );
  const teamChoices = useMemo(() => {
    const listed = conference
      ? teams.filter((row) => row.conference === conference)
      : teams;
    return [...listed]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((row) => ({
        id: row.id,
        abbreviation: row.abbreviation,
        fullName: row.fullName,
        conference: row.conference,
      }));
  }, [teams, conference]);

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
      effect="css"
      className="relative z-40 w-full min-w-0 max-w-full p-2 sm:p-3"
      style={
        {
          background: "var(--material-subtle-bg)",
          backdropFilter: "blur(12px) saturate(140%)",
          WebkitBackdropFilter: "blur(12px) saturate(140%)",
          "--lit-hairline": "rgb(0 0 0 / 0.05)",
          "--lit-drop-shadow": "0 1px 2px rgb(0 0 0 / 0.03)",
        } as CSSProperties
      }
    >
    <form
      className="flex w-full min-w-0 max-w-full flex-col gap-2"
      aria-label={t("filtersAria")}
      onSubmit={(event) => {
        event.preventDefault();
      }}
      data-pending={pending ? "true" : "false"}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        <ChipGroup>
          <button
            type="button"
            aria-label={tStandings("olderSeason")}
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
              className={cn(
                selectTriggerClass,
                "min-w-[5.5rem] gap-1.5 sm:min-w-[6.5rem]"
              )}
              aria-label={tStandings("season")}
            >
              <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
              <SelectValue>{seasonYear}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
              <SelectItem value="ALL">{t("allSeasons")}</SelectItem>
              {seasons.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label={tStandings("newerSeason")}
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
            aria-label={t("olderDraftClass")}
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
              aria-label={t("draftClass")}
            >
              <Shirt
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <SelectValue>
                {draftClassValue === "ALL"
                  ? tCommon("all")
                  : draftClassValue === "undrafted"
                    ? t("udfa")
                    : draftClassValue}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
              <SelectItem value="ALL">{t("allClasses")}</SelectItem>
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
              <SelectItem value="undrafted">{t("undrafted")}</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label={t("newerDraftClass")}
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
          <Chip active>{t("regular")}</Chip>
          <Chip disabled>{t("playoffs")}</Chip>
        </ChipGroup>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        <ChipGroup aria-label={t("conferenceAria")}>
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
              {conf === "East" ? t("east") : t("west")}
            </Chip>
          ))}
        </ChipGroup>

        <TeamSelect
          id="filter-team"
          value={team}
          teams={teamChoices}
          empty={{ value: "ALL", label: t("allTeams") }}
          onChange={(value) => {
            const patch: Record<string, string | null> = { team: value };
            if (value !== "ALL" && conference) {
              const picked = teams.find((t) => t.id === value || t.abbreviation === value);
              if (picked && picked.conference !== conference) patch.conference = null;
            }
            updateParams(patch);
          }}
        />

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
              aria-label={t("minimumMinutes")}
            >
              <SelectValue placeholder={t("minutesPlaceholder")}>
                {minMinutesOptions.find((o) => o.value === minimumMinutes)
                  ?.label ?? t("anyMin")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
              {minMinutesOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ChipGroup>

        <ChipGroup className="relative min-w-[12rem] w-full flex-1">
          <PlayerFilterSearch
            season={season}
            value={playerQuery}
            onCommit={(player) => updateParams({ player })}
          />
        </ChipGroup>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 border-t border-border/40 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <ChipGroup scrollable aria-label={t("statCategoriesAria")}>
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
              <span className="whitespace-nowrap">{viewLabel(item.id)}</span>
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup scrollable>
          {PLAYER_BOARD_RATES.map((item) => (
            <Chip
              key={item.id}
              active={rate === item.id}
              onClick={() => updateParams({ rate: item.id })}
            >
              <span className="whitespace-nowrap">{rateLabel(item.id)}</span>
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <p className="sr-only" aria-live="polite">
        {pending ? t("updatingResults") : t("resultsUpdated")}
      </p>
    </form>
    </GlassSurface>
  );
}
