import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { analyzeTeamProfile } from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  getTeamPlayers,
  getTeamSeasonStats,
} from "@/data/queries";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { formatNumber, formatPct } from "@/lib/format";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { PlayerSeason, TeamSeasonStats } from "@/data/types";

interface TeamPageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveTeam(
  rows: TeamSeasonStats[],
  key: string
): TeamSeasonStats | undefined {
  const needle = key.trim().toLowerCase();
  return rows.find(
    (t) =>
      t.teamId === key ||
      t.abbreviation.toLowerCase() === needle ||
      t.fullName.toLowerCase() === needle
  );
}

export async function generateMetadata({ params }: TeamPageProps) {
  const { teamId } = await params;
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const league = await getTeamSeasonStats(season).catch(() => []);
  const team = resolveTeam(league, teamId);
  return {
    title: team
      ? `${team.fullName} | Basketball Analytics`
      : "Team | Basketball Analytics",
  };
}

export default async function TeamProfilePage({
  params,
  searchParams,
}: TeamPageProps) {
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season =
    seasonParam ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const priorSeason = shiftCanonicalSeason(season, -1);

  const [league, priorLeague] = await Promise.all([
    getTeamSeasonStats(season).catch(() => [] as TeamSeasonStats[]),
    getTeamSeasonStats(priorSeason).catch(() => [] as TeamSeasonStats[]),
  ]);

  const team = resolveTeam(league, teamId);
  if (!team) notFound();

  const prior =
    priorLeague.find((t) => t.teamId === team.teamId) ??
    priorLeague.find(
      (t) => t.abbreviation.toLowerCase() === team.abbreviation.toLowerCase()
    ) ??
    null;

  const analysis = analyzeTeamProfile({ team, league, prior });
  const brand = resolveTeamBrand(team.abbreviation);

  const roster = await getTeamPlayers(team.teamId, season, {
    minimumGames: 10,
  }).catch(() => [] as PlayerSeason[]);

  const keyPlayers = [...roster]
    .sort((a, b) => {
      const av = a.darkoDpm ?? a.lebron ?? a.points / Math.max(1, a.gamesPlayed);
      const bv = b.darkoDpm ?? b.lebron ?? b.points / Math.max(1, b.gamesPlayed);
      return bv - av;
    })
    .slice(0, 8);

  const profileTraits = analysis.traits.slice(0, 6);

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <p>
        <Link
          href={`/explore/teams?season=${season}`}
          className="text-[13px] font-semibold text-muted-foreground"
        >
          ← Teams board
        </Link>
      </p>

      <header
        className="sports-card score-card-wash overflow-hidden px-4 py-5 sm:px-5"
        style={
          brand
            ? ({
                "--away-color": brand.primary,
                "--home-color": brand.secondary,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <TeamLogo teamKey={team.abbreviation} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {team.conference} · {season}
            </p>
            <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
              {team.fullName}
            </h1>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {formatNumber(team.ppg, 1)} PPG ·{" "}
              {team.avgDiff >= 0 ? "+" : ""}
              {formatNumber(team.avgDiff, 1)} diff · {formatPct(team.trueShootingPct)}{" "}
              TS
            </p>
          </div>
          <Link
            href={`/explore/players?team=${team.teamId}&season=${season}`}
            className="rounded-md bg-foreground px-3 py-2 text-[13px] font-semibold text-background"
          >
            Full roster board
          </Link>
          <Link
            href={`/offseason?team=${team.teamId}`}
            className="rounded-md bg-secondary px-3 py-2 text-[13px] font-semibold"
          >
            Offseason activity
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profileTraits.map((trait) => (
          <div key={trait.id} className="sports-card px-4 py-4">
            <StatDisclosure label={trait.label} context={trait.context} />
          </div>
        ))}
      </section>

      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">How they win</h2>
          <p className="text-[13px] text-muted-foreground">
            Strongest measurable traits vs the league this season.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {analysis.howTheyWin.map((finding) => (
            <li
              key={finding.id}
              className="rounded-md bg-secondary/50 px-3 py-3"
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {finding.eyebrow}
              </p>
              <p className="text-[15px] font-semibold">{finding.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {finding.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            What&apos;s changing?
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {analysis.vsPrior
              ? `${analysis.vsPrior.priorSeason} → ${season}`
              : "Prior-season team board unavailable for comparison."}
          </p>
        </div>
        {analysis.vsPrior?.finding ? (
          <div className="rounded-md bg-secondary/50 px-3 py-3">
            <p className="text-[15px] font-semibold">
              {analysis.vsPrior.finding.title}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {analysis.vsPrior.finding.body}
            </p>
          </div>
        ) : null}
        {analysis.vsPrior?.changes.length ? (
          <ul className="flex flex-col">
            {analysis.vsPrior.changes.map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0"
              >
                <span className="text-[13px] font-semibold">{c.label}</span>
                <span className="text-[14px] font-bold tabular-nums">
                  {c.deltaDisplay}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No clear season-to-season team deltas cleared the noise filter.
          </p>
        )}
      </section>

      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">Key players</h2>
            <p className="text-[13px] text-muted-foreground">
              Highest available impact / scoring among qualified rotation pieces.
            </p>
          </div>
          <Link
            href={`/explore/players?team=${team.teamId}&season=${season}`}
            className="text-[13px] font-semibold underline-offset-4 hover:underline"
          >
            All players
          </Link>
        </div>
        {keyPlayers.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No qualified roster rows for this team-season yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {keyPlayers.map((p) => (
              <li key={p.playerId}>
                <Link
                  href={`/players/${p.playerId}?season=${season}`}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-secondary/40"
                >
                  <PlayerHeadshot
                    playerId={p.playerId}
                    name={p.playerName}
                    teamKey={team.abbreviation}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {p.playerName}
                  </span>
                  <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                    {formatNumber(p.points / Math.max(1, p.gamesPlayed), 1)} PPG
                    {p.darkoDpm != null
                      ? ` · ${formatNumber(p.darkoDpm, 2)} DPM`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-muted-foreground">
          Lineup net ratings and possession evidence are not available yet.
        </p>
      </section>
    </main>
  );
}
