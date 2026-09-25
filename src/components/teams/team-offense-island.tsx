import { TransitionLink } from "@/components/continuity/query-nav";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { PlayerSeason, TeamSeasonStats } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import {
  formatRankLine,
  type RankedMetric,
} from "@/lib/team-page-metrics";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

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

function perGame(total: number, gp: number): number {
  return gp > 0 ? total / gp : 0;
}

function pctOrDash(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || !(value > 0)) return "—";
  return formatPct(value, 1);
}

function SideList({
  title,
  hint,
  rows,
  season,
  teamKey,
  detail,
}: {
  title: string;
  hint: string;
  rows: PlayerSeason[];
  season: string;
  teamKey: string;
  detail: (p: PlayerSeason) => string;
}) {
  if (!rows.length) return null;
  return (
    <div className="sports-card flex flex-col gap-2 p-4 sm:p-5">
      <div>
        <h3 className={cn(type.bodySm, "font-semibold")}>{title}</h3>
        <p className={cn(type.caption, "text-muted-foreground")}>{hint}</p>
      </div>
      <ul className="flex flex-col">
        {rows.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center gap-3 border-b border-border/50 py-2 last:border-0"
          >
            <PlayerIdentity
              playerId={p.playerId}
              name={p.playerName}
              teamKey={teamKey}
              position={p.position}
              season={season}
              variant="compact"
              className="min-w-0 flex-1"
            />
            <span
              className={cn(
                type.caption,
                "shrink-0 tabular-nums text-muted-foreground"
              )}
            >
              {detail(p)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Offense tab — season board offense ranks + roster scoring / creation depth.
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
  // minGames 0 — early season still shows who has scored.
  const roster = await getTeamRosterCached(teamId, season, 0);
  const board =
    roster.status === "ok"
      ? roster.players.filter((p) => p.minutes > 0 && p.gamesPlayed > 0)
      : [];

  const scorers = [...board]
    .sort(
      (a, b) =>
        perGame(b.points, b.gamesPlayed) - perGame(a.points, a.gamesPlayed)
    )
    .slice(0, 12);

  const creators = [...board]
    .filter(
      (p) =>
        p.usagePct != null && Number.isFinite(p.usagePct) && p.usagePct > 0
    )
    .sort((a, b) => (b.usagePct ?? 0) - (a.usagePct ?? 0))
    .slice(0, 5);

  const efficiency = [...board]
    .filter(
      (p) =>
        p.trueShootingPct != null &&
        Number.isFinite(p.trueShootingPct) &&
        p.trueShootingPct > 0 &&
        p.minutes >= 100
    )
    .sort((a, b) => (b.trueShootingPct ?? 0) - (a.trueShootingPct ?? 0))
    .slice(0, 5);

  const playmakers = [...board]
    .filter((p) => p.assists > 0 && p.turnovers >= 0 && p.minutes >= 100)
    .sort((a, b) => {
      const aRatio = a.assists / Math.max(1, a.turnovers);
      const bRatio = b.assists / Math.max(1, b.turnovers);
      return bRatio - aRatio || b.assists - a.assists;
    })
    .slice(0, 5);

  const hasBoard = offenseMetrics.some((m) => !m.missingReason);
  const playersHref = teamPageHref(teamId, { season, tab: "players" });
  const rotationHref = teamPageHref(teamId, { season, tab: "lineups" });

  return (
    <section
      id="offense"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Offense"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Offense</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Season board shooting and creation ranks for {season}, plus roster
            scoring, usage, and efficiency from the actual team list.
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
        <h3 className={cn(type.bodySm, "mb-1 font-semibold")}>
          Roster scoring board
        </h3>
        <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
          Per-game counting plus usage and true shooting. Missing rates show as
          — (not 0).
        </p>
        {scorers.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ?? "No roster rows for this team-season."}
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Player</th>
                <th className="pb-2 px-2 text-right font-medium">GP</th>
                <th className="pb-2 px-2 text-right font-medium">MPG</th>
                <th className="pb-2 px-2 text-right font-medium">PTS</th>
                <th className="pb-2 px-2 text-right font-medium">AST</th>
                <th className="pb-2 px-2 text-right font-medium">USG%</th>
                <th className="pb-2 px-2 text-right font-medium">eFG%</th>
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
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(perGame(player.minutes, player.gamesPlayed), 1)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {formatNumber(perGame(player.points, player.gamesPlayed), 1)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {formatNumber(
                      perGame(player.assists, player.gamesPlayed),
                      1
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {pctOrDash(player.usagePct)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {pctOrDash(player.effectiveFieldGoalPct)}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                    {pctOrDash(player.trueShootingPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {board.length ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <SideList
            title="Creation load"
            hint="Highest usage with minutes"
            rows={creators}
            season={season}
            teamKey={teamKey}
            detail={(p) => pctOrDash(p.usagePct)}
          />
          <SideList
            title="Efficiency"
            hint="Best TS% among 100+ minute rows"
            rows={efficiency}
            season={season}
            teamKey={teamKey}
            detail={(p) => pctOrDash(p.trueShootingPct)}
          />
          <SideList
            title="Playmaking"
            hint="AST/TO among 100+ minute rows"
            rows={playmakers}
            season={season}
            teamKey={teamKey}
            detail={(p) =>
              `${formatNumber(p.assists / Math.max(1, p.turnovers), 2)} AST/TO`
            }
          />
        </div>
      ) : null}
    </section>
  );
}
