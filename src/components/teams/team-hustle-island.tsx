import { PlayerIdentity } from "@/components/players/player-identity";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import {
  aggregateTeamHustleFromRoster,
  hasHustleStats,
  hustlePerGame,
  teamHustlePerGame,
} from "@/data/transformers/hustle-stats";
import type { PlayerSeason, TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatCountingRate, formatNumber, formatOrdinal } from "@/lib/format";
import type { RankedMetric } from "@/lib/team-page-metrics";
import { TeamMetricTile } from "@/components/teams/team-metric-tile";
import { DefenseStocksButterfly } from "@/components/teams/viz/defense-stocks-butterfly";
import { vizAccentStyle } from "@/components/teams/viz/viz-kit";
import { cn } from "@/lib/utils";

function fmtPerGame(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatCountingRate(value);
}


const TEAM_METRICS = [
  { key: "contestedShots" as const, label: "Contested shots" },
  { key: "deflections" as const, label: "Deflections" },
  { key: "chargesDrawn" as const, label: "Charges drawn" },
  { key: "screenAssists" as const, label: "Screen assists" },
  { key: "looseBalls" as const, label: "Loose balls" },
  { key: "boxOuts" as const, label: "Box outs" },
] as const;

const PLAYER_COLUMNS = [
  { key: "hustleContestedShots" as const, label: "Contest" },
  { key: "hustleDeflections" as const, label: "Defl" },
  { key: "hustleChargesDrawn" as const, label: "Chrg" },
  { key: "hustleScreenAssists" as const, label: "ScrAst" },
  { key: "hustleLooseBallsRecovered" as const, label: "Loose" },
  { key: "hustleBoxOuts" as const, label: "BoxOut" },
] as const;

function rosterHustleRows(players: PlayerSeason[]): PlayerSeason[] {
  return players
    .filter(hasHustleStats)
    .sort(
      (a, b) =>
        (hustlePerGame(b, "hustleDeflections") ?? 0) -
        (hustlePerGame(a, "hustleDeflections") ?? 0)
    );
}

/** Roster leader per game for a hustle column, from the same rows as the table. */
function hustleLeader(
  rows: PlayerSeason[],
  key: (typeof PLAYER_COLUMNS)[number]["key"]
): { name: string; rate: number } | null {
  let best: { name: string; rate: number } | null = null;
  for (const p of rows) {
    const rate = hustlePerGame(p, key);
    if (rate == null || !Number.isFinite(rate)) continue;
    if (!best || rate > best.rate) best = { name: p.playerName, rate };
  }
  return best;
}

function stocksPerGame(p: PlayerSeason): number {
  if (!(p.gamesPlayed > 0)) return 0;
  return (p.steals + p.blocks) / p.gamesPlayed;
}

/**
 * Defense tab — board defense ranks, box-score stocks, and NBA hustle tracking.
 */
export async function TeamHustleIsland({
  teamId,
  season,
  teamKey,
  team,
  defenseMetrics = [],
}: {
  teamId: string;
  season: string;
  teamKey: string;
  team?: TeamSeasonStats | null;
  defenseMetrics?: RankedMetric[];
}) {
  const roster = await getTeamRosterCached(teamId, season, 0);
  const board =
    roster.status === "ok"
      ? roster.players.filter((p) => p.minutes > 0 && p.gamesPlayed > 0)
      : [];
  const aggregate = aggregateTeamHustleFromRoster(roster.players);
  const hustleRows = rosterHustleRows(roster.players);
  const stockRows = [...board]
    .sort((a, b) => stocksPerGame(b) - stocksPerGame(a))
    .slice(0, 12);

  const columnScale = Object.fromEntries(
    PLAYER_COLUMNS.map((col) => {
      const rates = hustleRows
        .map((p) => hustlePerGame(p, col.key))
        .filter((v): v is number => v != null && Number.isFinite(v))
        .sort((a, b) => b - a);
      return [col.key, { max: rates[0] ?? 0, sorted: rates }];
    })
  ) as Record<(typeof PLAYER_COLUMNS)[number]["key"], { max: number; sorted: number[] }>;
  const hasDefenseBoard = defenseMetrics.some((m) => !m.missingReason);
  if (roster.status !== "ok") {
    return (
      <section
        id="defense"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Defense"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Defense</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ??
              "Roster unavailable, so the defense board cannot load for this team-season."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="defense"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Defense"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Defense</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Season board defense ranks for {season}, box-score stocks, and NBA
          hustle tracking when published.
        </p>
      </div>

      {hasDefenseBoard ? (
        <div className="sports-card p-4 sm:p-5">
          <h3 className={cn(type.bodySm, "mb-3 font-semibold")}>
            Team defense ranks
          </h3>
          <dl data-hover-group className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {defenseMetrics.map((metric) => (
              <TeamMetricTile key={metric.key} metric={metric} />
            ))}
          </dl>
          {team ? (
            <dl className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Opp PPG
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatNumber(team.oppPpg, 1)}
                </dd>
              </div>
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  SPG
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatNumber(team.spg, 1)}
                </dd>
              </div>
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  BPG
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatNumber(team.bpg, 1)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : (
        <div className="sports-card p-4 sm:p-5">
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Defense board metrics are not published for this team-season yet.
          </p>
        </div>
      )}

      {stockRows.length >= 3 ? (
        <DefenseStocksButterfly players={board} season={season} teamKey={teamKey} />
      ) : (
        <div className="sports-card p-4 sm:p-5">
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ?? "Not enough steals and blocks on the roster yet."}
          </p>
        </div>
      )}

      {aggregate && hustleRows.length ? (
        <>
          <div className="sports-card p-4 sm:p-5">
            <h3 className={cn(type.bodySm, "mb-1 font-semibold")}>
              Team hustle
            </h3>
            <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
              Cumulative tracking from the roster (
              {aggregate.playersWithData}/{aggregate.rosterSize} with data).
              Rates use max roster GP ({aggregate.teamGames}).
              {roster.omitsMidSeasonMoves
                ? " Totals leave out players who changed teams during the season."
                : null}
            </p>
            <dl data-hover-group className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {TEAM_METRICS.map((metric, i) => {
                const leader = hustleLeader(hustleRows, PLAYER_COLUMNS[i]!.key);
                return (
                  <div
                    key={metric.key}
                    data-stat-tile
                    data-hover-item
                    data-tip={leader ? `Leader: ${leader.name}` : undefined}
                    data-tip-sub={leader ? `${fmtPerGame(leader.rate)} per game` : undefined}
                    className="-mx-2 rounded-md px-2 py-1.5"
                  >
                    <dt className={cn(type.caption, "text-muted-foreground")}>
                      {metric.label}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {fmtPerGame(teamHustlePerGame(aggregate, metric.key))}
                      <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                        /g
                      </span>
                    </dd>
                    <dd
                      className={cn(
                        type.caption,
                        "tabular-nums text-muted-foreground"
                      )}
                    >
                      {formatNumber(aggregate[metric.key], 0)} total
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <div data-viz style={vizAccentStyle(teamKey)} className="sports-card overflow-x-auto p-4 sm:p-5">
            <h3 className={cn(type.bodySm, "mb-1 font-semibold")}>
              Roster hustle (per game)
            </h3>
            <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
              Darker cells lead the roster in that column.
            </p>
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Player</th>
                  {PLAYER_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="pb-2 px-2 text-right font-medium"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hustleRows.map((player) => (
                  <tr
                    key={player.playerId}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <PlayerIdentity
                        playerId={player.playerId}
                        name={player.playerName}
                        teamKey={teamKey}
                        teamLabel={teamKey}
                        position={player.position}
                        season={season}
                        variant="compact"
                        className="min-w-0"
                        nameClassName="gap-2 no-underline hover:underline"
                      />
                    </td>
                    {PLAYER_COLUMNS.map((col) => {
                      const rate = hustlePerGame(player, col.key);
                      const scale = columnScale[col.key];
                      const share =
                        rate != null && Number.isFinite(rate) && scale.max > 0
                          ? rate / scale.max
                          : 0;
                      const rank =
                        rate != null && Number.isFinite(rate)
                          ? scale.sorted.indexOf(rate) + 1
                          : null;
                      return (
                        <td key={col.key} className="px-1 py-1 text-right">
                          <span
                            data-viz-bar
                            data-tip={
                              rate != null && Number.isFinite(rate)
                                ? `${player.playerName}: ${fmtPerGame(rate)} ${col.label.toLowerCase()} per game`
                                : undefined
                            }
                            data-tip-sub={rank ? `${formatOrdinal(rank)} on the roster` : undefined}
                            className="block rounded-sm px-1.5 py-1 tabular-nums"
                            style={{
                              background: `color-mix(in oklab, var(--viz-accent) ${Math.round(share * 48)}%, transparent)`,
                            }}
                          >
                            {fmtPerGame(rate)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="sports-card p-4 sm:p-5">
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            NBA hustle tracking is not published for this team-season yet.
            Stocks above still come from the box score.
          </p>
        </div>
      )}
    </section>
  );
}
