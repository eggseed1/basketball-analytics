import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPlayer,
  getPlayerGameLog,
  getPlayerSeason,
  getAvailableSeasons,
} from "@/data/queries";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";

interface PlayerPageProps {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PlayerPageProps) {
  const { playerId } = await params;
  const player = await getPlayer(playerId);
  return {
    title: player
      ? `${player.fullName} | Basketball Analytics`
      : "Player | Basketball Analytics",
  };
}

export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasons = await getAvailableSeasons();
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season = seasonParam ?? seasons[0] ?? "2024-25";

  const [player, seasonStats, gameLog] = await Promise.all([
    getPlayer(playerId),
    getPlayerSeason(playerId, season),
    getPlayerGameLog(playerId, season),
  ]);

  if (!player) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <p>
        <Link
          href="/explore/players"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to explore
        </Link>
      </p>

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          {player.fullName}
        </h1>
        <p className="text-muted-foreground">
          {player.position ?? "Position unknown"}
          {seasonStats ? ` · ${seasonStats.teamName}` : null}
          {` · ${season}`}
        </p>
      </header>

      {seasonStats ? (
        <section
          aria-labelledby="season-stats-heading"
          className="rounded-xl border border-border p-4"
        >
          <h2 id="season-stats-heading" className="text-lg font-semibold">
            Season snapshot
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Usage %" value={formatPct(seasonStats.usagePct)} />
            <Stat
              label="True shooting %"
              value={formatPct(seasonStats.trueShootingPct)}
            />
            <Stat label="Minutes" value={formatMinutes(seasonStats.minutes)} />
            <Stat
              label="Games"
              value={formatNumber(seasonStats.gamesPlayed)}
            />
            <Stat label="Points" value={formatNumber(seasonStats.points)} />
            <Stat
              label="Net rating"
              value={formatNumber(seasonStats.netRating, 1)}
            />
          </dl>
        </section>
      ) : (
        <p className="text-muted-foreground">
          No season stats for {season}.
        </p>
      )}

      <section aria-labelledby="game-log-heading">
        <h2 id="game-log-heading" className="text-lg font-semibold">
          Game log ({season})
        </h2>
        {gameLog.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No game log rows in the current data provider for this player.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {gameLog.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>{g.gameDate}</span>
                <span className="tabular-nums">
                  {g.points} PTS · {g.assists} AST · {g.rebounds} REB ·{" "}
                  {g.minutes} MIN
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}
