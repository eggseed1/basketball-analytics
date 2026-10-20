import { getTranslations } from "next-intl/server";

import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import { TeamSeasonSelect } from "@/components/teams/team-season-select";
import type { FranchiseHistory } from "@/data/franchises/history";
import type { StandingRow } from "@/data/types/standings";
import type { TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatOrdinal, formatPct } from "@/lib/format";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import type { TeamBrand } from "@/lib/nba-brand";
import { standingsVisualizationsHref } from "@/lib/standings-routes";
import type { TeamPageHrefOpts } from "@/lib/team-destination";
import type { TeamStandingsDisplay } from "@/lib/team-standings-context";
import { cn } from "@/lib/utils";
import { LinkCue } from "@/components/ui/link-cue";

export type TeamSnapshotStat = {
  label: string;
  /** Primary display — often an ordinal rank. */
  value: string;
  hint?: string;
  tip?: string;
  tipSub?: string;
};

type TeamCopy = {
  (key: string, values?: Record<string, string | number | Date>): string;
};

function buildSnapshotCells(input: {
  boardAvailable: boolean;
  standings: TeamStandingsDisplay;
  snapshotStats: TeamSnapshotStat[];
  t: TeamCopy;
}): TeamSnapshotStat[] {
  const { boardAvailable, standings, snapshotStats, t } = input;
  if (!boardAvailable) {
    return [
      {
        label: t("snapBoard"),
        value: "—",
        hint: t("snapBoardHint"),
      },
    ];
  }

  const {
    standing,
    divisionStanding,
    divisionMeta,
    priorSeasonStanding,
    priorSeasonLabel,
    seasonAwaitingGames,
  } = standings;

  const recordCell: TeamSnapshotStat = standing
    ? {
        label: t("snapRecord"),
        value: `${standing.wins}-${standing.losses}`,
        hint:
          standing.winPct != null
            ? formatPct(standing.winPct, 0)
            : undefined,
        tip: t("tipConferenceRank", {
          rank: formatOrdinal(standing.rank),
          conference: standing.conference,
        }),
        tipSub:
          [
            standing.streak ? t("streak", { streak: standing.streak }) : null,
            standing.lastTen ? t("lastTen", { record: standing.lastTen }) : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      }
    : seasonAwaitingGames && priorSeasonStanding
      ? {
          label: t("snapPriorRecord", {
            season: priorSeasonLabel ?? "—",
          }),
          value: `${priorSeasonStanding.wins}-${priorSeasonStanding.losses}`,
          hint: t("snapPriorFinal"),
        }
      : seasonAwaitingGames
        ? {
            label: t("snapRecord"),
            value: "—",
            hint: t("snapSeasonNotStarted"),
          }
        : {
            label: t("snapRecord"),
            value: "—",
            hint: t("snapRecordUnavailable"),
          };

  const divisionCell: TeamSnapshotStat = divisionStanding
    ? {
        label: t("snapDivisionRank"),
        value: formatOrdinal(divisionStanding.rank),
        hint: t("snapDivisionHint", {
          division: divisionStanding.division,
          count: divisionStanding.of,
        }),
        tip: t("tipDivisionRank", {
          rank: formatOrdinal(divisionStanding.rank),
          of: divisionStanding.of,
          division: divisionStanding.division,
        }),
      }
    : seasonAwaitingGames && divisionMeta
      ? {
          label: t("snapDivision"),
          value: divisionMeta.division,
          hint: t("snapDivisionHint", {
            division: divisionMeta.conference,
            count: divisionMeta.divisionSize,
          }),
        }
      : standing
        ? {
            label: t("snapDivisionRank"),
            value: formatOrdinal(standing.rank),
            hint: t("snapConferenceHint", { conference: standing.conference }),
          }
        : divisionMeta
          ? {
              label: t("snapDivision"),
              value: divisionMeta.division,
              hint: t("snapDivisionHint", {
                division: divisionMeta.conference,
                count: divisionMeta.divisionSize,
              }),
            }
          : {
              label: t("snapDivisionRank"),
              value: "—",
              hint: t("snapDivisionMetaUnavailable"),
            };

  const stats =
    seasonAwaitingGames && snapshotStats.length === 0 ? [] : snapshotStats;

  return [recordCell, divisionCell, ...stats];
}

/**
 * Stable team identity frame — name, mark, glass snapshot, season dropdown.
 */
export async function TeamDestinationIdentity({
  teamId,
  team,
  season,
  seasonOptions,
  standing,
  divisionStanding,
  standingsContext,
  snapshotStats,
  modernBrand,
  historicalBrand,
  useHistoricalMark,
  boardAvailable = true,
  hrefOpts,
  franchise,
  historyHref,
}: {
  teamId: string;
  team: Pick<
    TeamSeasonStats,
    "abbreviation" | "fullName" | "conference" | "ppg" | "avgDiff" | "trueShootingPct"
  >;
  season: string;
  seasonOptions: string[];
  standing: StandingRow | null;
  divisionStanding: { division: string; rank: number; of: number } | null;
  standingsContext: TeamStandingsDisplay;
  snapshotStats: TeamSnapshotStat[];
  modernBrand?: TeamBrand | null;
  historicalBrand?: HistoricalTeamBrand | null;
  useHistoricalMark: boolean;
  boardAvailable?: boolean;
  hrefOpts?: TeamPageHrefOpts;
  franchise?: FranchiseHistory | null;
  historyHref: string;
}) {
  const t = await getTranslations("TeamDetail");
  const displayName =
    useHistoricalMark && historicalBrand?.displayName
      ? historicalBrand.displayName
      : team.fullName;
  const displayAbbr =
    useHistoricalMark && historicalBrand?.abbreviation
      ? historicalBrand.abbreviation
      : team.abbreviation;

  const wash = brandAtmosphereColors(
    useHistoricalMark && historicalBrand?.palette?.primary
      ? historicalBrand.palette.primary
      : modernBrand?.primary,
    useHistoricalMark && historicalBrand?.palette?.secondary
      ? historicalBrand.palette.secondary
      : modernBrand?.secondary
  );

  const cells = buildSnapshotCells({
    boardAvailable,
    standings: standingsContext,
    snapshotStats,
    t,
  });

  const headerDivision =
    divisionStanding?.division ??
    standingsContext.divisionMeta?.division ??
    null;

  const titleCount = franchise?.championships.length ?? 0;

  return (
    <section
      id="overview"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label={t("ariaOverview")}
    >
      <GlassSurface
        as="header"
        effect="css"
        backdropBlur={16}
        accentColor={wash?.colorA}
        accentColorB={wash?.colorB}
        className="px-4 py-5 sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-[18rem] flex-wrap items-center gap-4">
            {useHistoricalMark && historicalBrand ? (
              <HistoricalTeamMark brand={historicalBrand} size="xl" priority />
            ) : (
              <TeamLogo
                teamKey={team.abbreviation}
                size="xl"
                priority
                logoUrl={historicalBrand?.logoUrl}
                logoSource={historicalBrand?.source}
                textAbbr={historicalBrand?.abbreviation}
                logoPalette={historicalBrand?.palette}
              />
            )}
            <div className="min-w-0 flex-1 basis-[10rem]">
              <p
                className={cn(
                  type.caption,
                  "font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                )}
              >
                {displayAbbr}
                {team.conference ? ` · ${team.conference}` : ""}
                {headerDivision ? ` · ${headerDivision}` : standing ? ` · #${standing.rank}` : null}
              </p>
              <h1 className={cn(type.display, "mt-0.5")}>{displayName}</h1>
              {franchise ? (
                <TransitionLink
                  href={historyHref}
                  className={cn(
                    type.caption,
                    "mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>
                    {titleCount === 1
                      ? t("titlesOne", {
                          count: titleCount,
                          season: franchise.firstSeason,
                        })
                      : t("titlesMany", {
                          count: titleCount,
                          season: franchise.firstSeason,
                        })}
                  </span>
                  <LinkCue />
                </TransitionLink>
              ) : null}
              {standing ? (
                <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
                  {standing.streak
                    ? t("streak", { streak: standing.streak })
                    : null}
                  {standing.lastTen
                    ? ` · ${t("lastTen", { record: standing.lastTen })}`
                    : null}
                  {" · "}
                  <TransitionLink
                    href="/standings"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {t("standings")}
                  </TransitionLink>
                  {" · "}
                  <TransitionLink
                    href={standingsVisualizationsHref(season)}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {t("tracker")} <LinkCue />
                  </TransitionLink>
                </p>
              ) : standingsContext.seasonAwaitingGames ? (
                <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
                  {t("seasonNotStarted", { season })}
                  {standingsContext.priorSeasonStanding
                    ? ` · ${t("priorFinalRecord", {
                        season: standingsContext.priorSeasonLabel ?? "—",
                        wins: standingsContext.priorSeasonStanding.wins,
                        losses: standingsContext.priorSeasonStanding.losses,
                      })}`
                    : ""}
                  {" · "}
                  <TransitionLink
                    href="/standings"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {t("standings")}
                  </TransitionLink>
                  {" · "}
                  <TransitionLink
                    href={standingsVisualizationsHref(season)}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {t("tracker")} <LinkCue />
                  </TransitionLink>
                </p>
              ) : (
                <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
                  {t("standingsPopulate")}
                </p>
              )}
            </div>
          </div>

          <TeamSeasonSelect
            teamId={teamId}
            season={season}
            seasons={seasonOptions}
            hrefOpts={hrefOpts}
          />
        </div>

        <dl data-hover-group className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {cells.map((cell) => (
            <div
              key={`${cell.label}-${cell.value}`}
              data-stat-tile
              data-hover-item
              data-tip={cell.tip ?? cell.hint}
              data-tip-sub={cell.tip ? cell.tipSub : undefined}
              className="min-w-0 rounded-md px-3 py-2.5"
            >
              <dt
                className={cn(
                  type.caption,
                  "truncate font-semibold uppercase tracking-wide text-muted-foreground"
                )}
              >
                {cell.label}
              </dt>
              <dd
                className={cn(
                  type.title,
                  "mt-0.5 truncate tabular-nums tracking-tight"
                )}
              >
                {cell.value}
              </dd>
              {cell.hint ? (
                <p
                  className={cn(
                    type.caption,
                    "mt-0.5 truncate text-muted-foreground"
                  )}
                >
                  {cell.hint}
                </p>
              ) : null}
            </div>
          ))}
        </dl>
      </GlassSurface>
    </section>
  );
}
