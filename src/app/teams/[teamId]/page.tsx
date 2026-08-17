import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PlayerHeadshot } from "@/components/player/player-headshot";
import { PlayerSeasonSelect } from "@/components/player/player-season-select";
import { TeamLogo } from "@/components/team/team-logo";
import { AutoRefresh } from "@/components/system/auto-refresh";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import {
  getAvailableSeasons,
  getTeam,
  getTeamPlayers,
  getTeamSeason,
} from "@/data/queries";
import { perGame } from "@/data/providers/nba/compute-advanced";
import { formatNumber, formatPct } from "@/lib/format";

export const revalidate = 60;

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: TeamPageProps) {
  const { teamId } = await params;
  const team = await getTeam(teamId);
  return {
    title: team ? `${team.fullName} · Team` : "Team | Basketball Analytics",
  };
}

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const { teamId } = await params;
  const sp = await searchParams;
  const seasons = await getAvailableSeasons();
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season = seasonParam ?? seasons[0] ?? "2024-25";

  const team = await getTeam(teamId);
  if (!team) notFound();

  const [teamSeason, roster] = await Promise.all([
    getTeamSeason(teamId, season),
    getTeamPlayers(teamId, season, { minimumMinutes: 0 }),
  ]);

  const rosterSorted = [...roster].sort(
    (a, b) =>
      perGame(b.points, b.gamesPlayed) - perGame(a.points, a.gamesPlayed)
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <p>
        <Link
          href={`/explore/teams?season=${season}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to teams
        </Link>
      </p>

      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <TeamLogo
            teamId={team.id}
            abbreviation={team.abbreviation}
            size="lg"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {team.conference} · {team.division}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              {team.fullName}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              {team.abbreviation}
            </p>
            <AutoRefresh />
          </div>
        </div>
        <Suspense fallback={null}>
          <PlayerSeasonSelect seasons={seasons} current={season} />
        </Suspense>
      </header>

      {teamSeason ? (
        <section
          aria-labelledby="team-season-stats"
          className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <h2 id="team-season-stats" className="sr-only">
            {season} team stats
          </h2>
          <Stat
            label="Record"
            value={`${teamSeason.wins}-${teamSeason.losses}`}
          />
          <Stat label="Win %" value={formatPct(teamSeason.winPct)} />
          <Stat
            label="PTS/G"
            value={formatNumber(teamSeason.pointsPerGame, 1)}
          />
          <Stat
            label="Net rating"
            value={formatNumber(teamSeason.netRating, 1)}
          />
          <Stat
            label="Offensive rating"
            value={formatNumber(teamSeason.offensiveRating, 1)}
          />
          <Stat
            label="Defensive rating"
            value={formatNumber(teamSeason.defensiveRating, 1)}
          />
          <Stat
            label="True shooting"
            value={formatPct(teamSeason.trueShootingPct)}
          />
          <Stat label="Pace" value={formatNumber(teamSeason.pace, 1)} />
          <Stat
            label="AST/G"
            value={formatNumber(teamSeason.assistsPerGame, 1)}
          />
          <Stat
            label="REB/G"
            value={formatNumber(teamSeason.reboundsPerGame, 1)}
          />
          <Stat
            label="3P%"
            value={formatPct(teamSeason.threePointPct)}
          />
          <Stat label="+/-" value={formatNumber(teamSeason.plusMinus, 1)} />
        </section>
      ) : (
        <p className="text-muted-foreground">
          No team season stats available for {season}.
        </p>
      )}

      <section aria-labelledby="roster-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="roster-heading" className="text-lg font-semibold">
              Roster ({season})
            </h2>
            <p className="text-sm text-muted-foreground">
              {rosterSorted.length} players · sorted by points per game
            </p>
          </div>
          <Link
            href={`/explore/players?season=${season}&team=${teamId}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Open in player explore →
          </Link>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">PTS/G</TableHead>
                <TableHead className="text-right">AST/G</TableHead>
                <TableHead className="text-right">REB/G</TableHead>
                <TableHead className="text-right">
                  <StatTooltip nestable stat="USG%">
                    USG%
                  </StatTooltip>
                </TableHead>
                <TableHead className="text-right">
                  <StatTooltip nestable stat="TS%">
                    TS%
                  </StatTooltip>
                </TableHead>
                <TableHead className="text-right">MIN</TableHead>
                <TableHead className="text-right">GP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rosterSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No roster rows for this season.
                  </TableCell>
                </TableRow>
              ) : (
                rosterSorted.map((p) => (
                  <TableRow key={p.playerId}>
                    <TableCell>
                      <Link
                        href={`/players/${p.playerId}?season=${season}`}
                        className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline"
                      >
                        <PlayerHeadshot
                          playerId={p.playerId}
                          name={p.playerName}
                          size="xs"
                        />
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span>{p.playerName}</span>
                          {p.position ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              {p.position}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(perGame(p.points, p.gamesPlayed), 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(perGame(p.assists, p.gamesPlayed), 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(perGame(p.rebounds, p.gamesPlayed), 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPct(p.usagePct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPct(p.trueShootingPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(p.minutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(p.gamesPlayed)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        <StatTooltip nestable stat={label}>
          {label}
        </StatTooltip>
      </p>
      <p className="text-xl font-medium tabular-nums">{value}</p>
    </div>
  );
}
