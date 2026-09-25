import { TransitionLink } from "@/components/continuity/query-nav";
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
import { formatCountingRate, formatNumber } from "@/lib/format";
import {
  formatRankLine,
  type RankedMetric,
} from "@/lib/team-page-metrics";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

function fmtPerGame(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatCountingRate(value);
}

function MetricTile({ metric }: { metric: RankedMetric }) {
  return (
    <div className="rounded-md border border-border/60 frost-surface-soft px-3 py-3">
      <p
        className={cn(
          type.caption,
          "font-semibold uppercase text-muted-foreground"
        )}
      >
        {metric.label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {metric.formattedValue}
      </p>
      <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
        {formatRankLine(metric)}
      </p>
    </div>
  );
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

  const hasDefenseBoard = defenseMetrics.some((m) => !m.missingReason);
  const playersHref = teamPageHref(teamId, { season, tab: "players" });
  const rotationHref = teamPageHref(teamId, { season, tab: "lineups" });

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
              "Roster unavailable — cannot load defense board for this team-season."}
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Defense</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Season board defense ranks for {season}, box-score stocks, and NBA
            hustle tracking when published.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <TransitionLink
            href={playersHref}
            className={cn(type.caption, "font-semibold underline")}
          >
            Full roster →
          </TransitionLink>
          <TransitionLink
            href={rotationHref}
            className={cn(type.caption, "font-semibold underline")}
          >
            Rotation →
          </TransitionLink>
        </div>
      </div>

      {hasDefenseBoard ? (
        <div className="sports-card p-4 sm:p-5">
          <h3 className={cn(type.bodySm, "mb-3 font-semibold")}>
            Team defense ranks
          </h3>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {defenseMetrics.map((metric) => (
              <MetricTile key={metric.key} metric={metric} />
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

      <div className="sports-card overflow-x-auto p-4 sm:p-5">
        <h3 className={cn(type.bodySm, "mb-1 font-semibold")}>
          Roster stocks
        </h3>
        <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
          Steals + blocks from the box score — available even when hustle
          tracking is not.
        </p>
        {stockRows.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ?? "No roster rows for this team-season."}
          </p>
        ) : (
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Player</th>
                <th className="pb-2 px-2 text-right font-medium">GP</th>
                <th className="pb-2 px-2 text-right font-medium">MPG</th>
                <th className="pb-2 px-2 text-right font-medium">STL</th>
                <th className="pb-2 px-2 text-right font-medium">BLK</th>
                <th className="pb-2 pl-2 text-right font-medium">Stocks</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map((player) => (
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
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {player.gamesPlayed}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(
                      player.minutes / Math.max(1, player.gamesPlayed),
                      1
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatNumber(
                      player.steals / Math.max(1, player.gamesPlayed),
                      1
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatNumber(
                      player.blocks / Math.max(1, player.gamesPlayed),
                      1
                    )}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums font-medium">
                    {formatNumber(stocksPerGame(player), 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
            </p>
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {TEAM_METRICS.map((metric) => (
                <div key={metric.key}>
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
              ))}
            </dl>
          </div>

          <div className="sports-card overflow-x-auto p-4 sm:p-5">
            <h3 className={cn(type.bodySm, "mb-3 font-semibold")}>
              Roster hustle (per game)
            </h3>
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
                    {PLAYER_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="py-2 px-2 text-right tabular-nums text-muted-foreground"
                      >
                        {fmtPerGame(hustlePerGame(player, col.key))}
                      </td>
                    ))}
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
