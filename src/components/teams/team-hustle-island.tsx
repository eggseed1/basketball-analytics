import Link from "next/link";

import { PlayerIdentity } from "@/components/players/player-identity";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import {
  aggregateTeamHustleFromRoster,
  hasHustleStats,
  hustlePerGame,
  teamHustlePerGame,
} from "@/data/transformers/hustle-stats";
import type { PlayerSeason } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function fmtPerGame(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatNumber(value, 1);
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

/**
 * Defense tab — cumulative NBA hustle from the actual team roster (not league team table).
 */
export async function TeamHustleIsland({
  teamId,
  season,
  teamKey,
}: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const roster = await getTeamRosterCached(teamId, season, 10);
  const aggregate = aggregateTeamHustleFromRoster(roster.players);
  const rows = rosterHustleRows(roster.players);

  if (roster.status !== "ok") {
    return (
      <section
        id="defense"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Defense"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Hustle</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ??
              "Roster unavailable — cannot compute team hustle totals."}
          </p>
        </div>
      </section>
    );
  }

  if (!aggregate || rows.length === 0) {
    return (
      <section
        id="defense"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Defense"
      >
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Hustle</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            NBA hustle tracking is not published for this team-season yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="defense"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Defense"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Hustle</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Cumulative season totals from the {season} roster (
            {aggregate.playersWithData}/{aggregate.rosterSize} players with
            tracking). Per-game rates use max roster GP ({aggregate.teamGames}).
          </p>
        </div>
        <Link
          href={`/teams/${teamId}?tab=players&season=${encodeURIComponent(season)}`}
          className={cn(type.caption, "font-semibold underline")}
        >
          Full roster →
        </Link>
      </div>

      <div className="sports-card p-4 sm:p-5">
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
              <dd className={cn(type.caption, "tabular-nums text-muted-foreground")}>
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
                <th key={col.key} className="pb-2 px-2 text-right font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => (
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
    </section>
  );
}
