import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getGameBoxScore, getTeam } from "@/data/queries";
import { formatNumber } from "@/lib/format";

interface GamePageProps {
  params: Promise<{ gameId: string }>;
}

export async function generateMetadata({ params }: GamePageProps) {
  const { gameId } = await params;
  const box = await getGameBoxScore(gameId);
  if (!box) return { title: "Game | Basketball Analytics" };
  const away = box.game.awayTeamAbbr ?? box.game.awayTeamId;
  const home = box.game.homeTeamAbbr ?? box.game.homeTeamId;
  return {
    title: `${away} @ ${home} | Basketball Analytics`,
  };
}

export default async function GamePage({ params }: GamePageProps) {
  const { gameId } = await params;
  const box = await getGameBoxScore(gameId);
  if (!box) notFound();

  const { game, players } = box;
  const [homeTeam, awayTeam] = await Promise.all([
    getTeam(game.homeTeamId),
    getTeam(game.awayTeamId),
  ]);

  const homePlayers = players
    .filter((p) => p.teamId === game.homeTeamId)
    .sort((a, b) => b.points - a.points);
  const awayPlayers = players
    .filter((p) => p.teamId === game.awayTeamId)
    .sort((a, b) => b.points - a.points);

  const awayLabel =
    game.awayTeamAbbr ?? awayTeam?.abbreviation ?? game.awayTeamId;
  const homeLabel =
    game.homeTeamAbbr ?? homeTeam?.abbreviation ?? game.homeTeamId;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <p>
        <Link
          href="/explore/games"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to explore games
        </Link>
      </p>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{game.gameDate}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {awayLabel} {game.awayScore} @ {homeLabel} {game.homeScore}
        </h1>
        <p className="text-muted-foreground">
          {game.awayTeamName ?? awayTeam?.fullName ?? "Away"} at{" "}
          {game.homeTeamName ?? homeTeam?.fullName ?? "Home"} · {game.season}
        </p>
      </header>

      <section
        aria-labelledby="game-summary-heading"
        className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-3"
      >
        <h2 id="game-summary-heading" className="sr-only">
          Game summary
        </h2>
        <div>
          <p className="text-xs text-muted-foreground">Total points</p>
          <p className="text-xl font-medium tabular-nums">
            {formatNumber(game.homeScore + game.awayScore)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Home margin</p>
          <p className="text-xl font-medium tabular-nums">
            {game.homeScore - game.awayScore > 0 ? "+" : ""}
            {formatNumber(game.homeScore - game.awayScore)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-xl font-medium capitalize">
            {game.status ?? "final"}
          </p>
        </div>
      </section>

      <BoxScoreSection
        heading={`${awayLabel} box score`}
        players={awayPlayers}
      />
      <BoxScoreSection
        heading={`${homeLabel} box score`}
        players={homePlayers}
      />
    </main>
  );
}

function BoxScoreSection({
  heading,
  players,
}: {
  heading: string;
  players: Array<{
    id: string;
    playerId: string;
    playerName?: string;
    minutes: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    plusMinus: number;
  }>;
}) {
  const headingId = heading.replace(/\s+/g, "-").toLowerCase();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {heading}
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">MIN</TableHead>
              <TableHead className="text-right">PTS</TableHead>
              <TableHead className="text-right">REB</TableHead>
              <TableHead className="text-right">AST</TableHead>
              <TableHead className="text-right">STL</TableHead>
              <TableHead className="text-right">BLK</TableHead>
              <TableHead className="text-right">TO</TableHead>
              <TableHead className="text-right">+/-</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No box-score rows available for this team.
                </TableCell>
              </TableRow>
            ) : (
              players.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/players/${p.playerId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {p.playerName ?? p.playerId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.minutes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.points)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.rebounds)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.assists)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.steals)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.blocks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(p.turnovers)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.plusMinus > 0 ? "+" : ""}
                    {formatNumber(p.plusMinus)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
