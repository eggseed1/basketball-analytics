import Link from "next/link";

import { PlayerIdentity } from "@/components/players/player-identity";
import type { TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import {
  formatRankLine,
  type RankedMetric,
} from "@/lib/team-page-metrics";
import { cn } from "@/lib/utils";

function MetricTile({ metric }: { metric: RankedMetric }) {
  return (
    <div className="rounded-md border border-border/60 frost-surface-soft px-3 py-3">
      <p className={cn(type.caption, "font-semibold uppercase text-muted-foreground")}>
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

/**
 * Offense tab — season board offense ranks + roster scoring table (bundled on CF).
 */
export async function TeamOffenseIsland({
  teamId,
  season,
  teamKey,
  team,
  offenseMetrics,
}: {
  teamId: string;
  season: string;
  teamKey: string;
  team: TeamSeasonStats;
  offenseMetrics: RankedMetric[];
}) {
  const { getTeamRosterCached } = await import("@/data/queries/request-cache");
  const roster = await getTeamRosterCached(teamId, season, 10);
  const scorers = [...roster.players]
    .sort(
      (a, b) =>
        b.points / Math.max(1, b.gamesPlayed) -
        a.points / Math.max(1, a.gamesPlayed)
    )
    .slice(0, 12);

  const hasBoard = offenseMetrics.some((m) => !m.missingReason);

  return (
    <section
      id="offense"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Offense"
    >
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Offense</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Season board shooting and creation ranks for {season}, plus roster
          scoring from the actual team list.
        </p>
      </div>

      {hasBoard ? (
        <div className="sports-card p-4 sm:p-5">
          <h3 className={cn(type.bodySm, "mb-3 font-semibold")}>
            Team offense ranks
          </h3>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offenseMetrics.map((metric) => (
              <MetricTile key={metric.key} metric={metric} />
            ))}
          </dl>
          <dl className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>PPG</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatNumber(team.ppg, 1)}
              </dd>
            </div>
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>APG</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatNumber(team.apg, 1)}
              </dd>
            </div>
            <div>
              <dt className={cn(type.caption, "text-muted-foreground")}>
                AST/TO
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatNumber(team.assistToTurnover, 2)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="sports-card p-4 sm:p-5">
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Offense board metrics are not published for this team-season yet.
          </p>
        </div>
      )}

      <div className="sports-card overflow-x-auto p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={cn(type.bodySm, "font-semibold")}>
            Roster scoring (per game)
          </h3>
          <Link
            href={`/teams/${teamId}?tab=players&season=${encodeURIComponent(season)}`}
            className={cn(type.caption, "font-semibold underline")}
          >
            Full roster →
          </Link>
        </div>
        {scorers.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ?? "No roster rows for this team-season."}
          </p>
        ) : (
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Player</th>
                <th className="pb-2 px-2 text-right font-medium">GP</th>
                <th className="pb-2 px-2 text-right font-medium">PTS</th>
                <th className="pb-2 px-2 text-right font-medium">REB</th>
                <th className="pb-2 px-2 text-right font-medium">AST</th>
                <th className="pb-2 pl-2 text-right font-medium">TS%</th>
              </tr>
            </thead>
            <tbody>
              {scorers.map((player) => (
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
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatNumber(
                      player.points / Math.max(1, player.gamesPlayed),
                      1
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(
                      player.rebounds / Math.max(1, player.gamesPlayed),
                      1
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(
                      player.assists / Math.max(1, player.gamesPlayed),
                      1
                    )}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                    {player.trueShootingPct != null
                      ? formatNumber(
                          player.trueShootingPct > 1
                            ? player.trueShootingPct
                            : player.trueShootingPct * 100,
                          1
                        )
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
