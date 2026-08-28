import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import { TeamSeasonSelect } from "@/components/teams/team-season-select";
import type { StandingRow } from "@/data/types/standings";
import type { TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatOrdinal, formatPct } from "@/lib/format";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { TeamBrand } from "@/lib/nba-brand";
import type { TeamPageHrefOpts } from "@/lib/team-destination";
import type { TeamStandingsDisplay } from "@/lib/team-standings-context";
import { cn } from "@/lib/utils";

export type TeamSnapshotStat = {
  label: string;
  /** Primary display — often an ordinal rank. */
  value: string;
  hint?: string;
};

function buildSnapshotCells(input: {
  boardAvailable: boolean;
  standings: TeamStandingsDisplay;
  snapshotStats: TeamSnapshotStat[];
}): TeamSnapshotStat[] {
  const { boardAvailable, standings, snapshotStats } = input;
  if (!boardAvailable) {
    return [
      {
        label: "Board",
        value: "—",
        hint: "Identity from team-era map",
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
        label: "Record",
        value: `${standing.wins}-${standing.losses}`,
        hint:
          standing.winPct != null
            ? formatPct(standing.winPct, 0)
            : undefined,
      }
    : seasonAwaitingGames && priorSeasonStanding
      ? {
          label: "Record",
          value: `${priorSeasonStanding.wins}-${priorSeasonStanding.losses}`,
          hint: `${priorSeasonLabel ?? "Prior"} final · pre-tip`,
        }
      : seasonAwaitingGames
        ? {
            label: "Record",
            value: "—",
            hint: "Pre-tip · season hasn't started",
          }
        : {
            label: "Record",
            value: "—",
            hint: "Standings unavailable for this season",
          };

  const divisionCell: TeamSnapshotStat = divisionStanding
    ? {
        label: "Division rank",
        value: formatOrdinal(divisionStanding.rank),
        hint: `${divisionStanding.division} · ${divisionStanding.of} teams`,
      }
    : seasonAwaitingGames && divisionMeta
      ? {
          label: "Division",
          value: divisionMeta.division,
          hint: `${divisionMeta.conference} · pre-tip`,
        }
      : standing
        ? {
            label: "Division rank",
            value: formatOrdinal(standing.rank),
            hint: `${standing.conference} conference`,
          }
        : divisionMeta
          ? {
              label: "Division",
              value: divisionMeta.division,
              hint: `${divisionMeta.conference} · ${divisionMeta.divisionSize} teams`,
            }
          : {
              label: "Division rank",
              value: "—",
              hint: "Division metadata unavailable",
            };

  const stats =
    seasonAwaitingGames && snapshotStats.length === 0 ? [] : snapshotStats;

  return [recordCell, divisionCell, ...stats];
}

/**
 * Stable team identity frame — name, mark, glass snapshot, season dropdown.
 */
export function TeamDestinationIdentity({
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
}) {
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
  });

  const headerDivision =
    divisionStanding?.division ??
    standingsContext.divisionMeta?.division ??
    null;

  return (
    <section
      id="overview"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Overview"
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
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
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
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  type.caption,
                  "font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                )}
              >
                {displayAbbr}
                {team.conference ? ` · ${team.conference}` : ""}
                {headerDivision ? ` · ${headerDivision}` : standing ? ` · #${standing.rank}` : null}{" "}
                · {season}
              </p>
              <h1 className={cn(type.display, "mt-0.5")}>{displayName}</h1>
              {standing ? (
                <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
                  {standing.streak ? `Streak ${standing.streak}` : null}
                  {standing.lastTen ? ` · L10 ${standing.lastTen}` : null}
                  {" · "}
                  <TransitionLink
                    href="/standings"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    Standings
                  </TransitionLink>
                  {" · "}
                  <TransitionLink
                    href={`/standings?view=tracker&season=${encodeURIComponent(season)}`}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    Tracker →
                  </TransitionLink>
                </p>
              ) : standingsContext.seasonAwaitingGames ? (
                <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
                  Pre-tip {season}
                  {standingsContext.priorSeasonStanding
                    ? ` · ${standingsContext.priorSeasonLabel} final ${standingsContext.priorSeasonStanding.wins}-${standingsContext.priorSeasonStanding.losses}`
                    : ""}
                  {" · "}
                  <TransitionLink
                    href="/standings"
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    Standings
                  </TransitionLink>
                  {" · "}
                  <TransitionLink
                    href={`/standings?view=tracker&season=${encodeURIComponent(season)}`}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    Tracker →
                  </TransitionLink>
                </p>
              ) : (
                <p className={cn(type.caption, "mt-1.5 text-muted-foreground")}>
                  Standings populate when regular-season results are available.
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

        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {cells.map((cell) => (
            <div
              key={`${cell.label}-${cell.value}`}
              className="glass-pill min-w-0 rounded-md px-3 py-2.5"
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
