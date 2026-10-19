"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { GameShotChart } from "@/components/games/game-shot-chart";
import { GmShell } from "@/gm/ui/gm-shell";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { schemeHeadline } from "@/gm/engine/coaching";
import { boxToPlayByPlay } from "@/gm/engine/play-by-play";
import { useGmStore } from "@/gm/state/gm-store";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";

export default function GmGamePage() {
  return (
    <GmShell>
      <Suspense fallback={null}>
        <GameBody />
      </Suspense>
    </GmShell>
  );
}

function GameBody() {
  const params = useParams<{ gameId: string }>();
  const watch = useSearchParams().get("watch") === "1";
  const league = useGmStore((s) => s.league);
  const box = league?.boxScores.find((b) => b.id === params.gameId) ?? null;
  const tape = useMemo(() => (box ? boxToPlayByPlay(box) : []), [box]);
  if (!league) return null;
  if (!box) {
    return (
      <p className="text-muted-foreground">
        Box score not found.{" "}
        <Link href="/gm/schedule" className="underline">
          Back to schedule
        </Link>
      </p>
    );
  }

  const away = box.players
    .filter((p) => p.teamId === box.awayTeamId)
    .sort((a, b) => b.gameScore - a.gameScore);
  const home = box.players
    .filter((p) => p.teamId === box.homeTeamId)
    .sort((a, b) => b.gameScore - a.gameScore);
  const user = league.teams.find((team) => team.id === league.userTeamId);
  const scheme = schemeHeadline(user?.coaching);
  const yours =
    user && (box.homeTeamId === user.id || box.awayTeamId === user.id)
      ? box.players.filter((line) => line.teamId === user.id)
      : [];
  const threes = yours.reduce((sum, line) => sum + line.tpa, 0);
  const shots = yours.reduce((sum, line) => sum + line.fga, 0);
  const first = yours.find((line) => line.playerId === user?.coaching?.playThrough[0]);
  const homeBrand = resolveTeamBrand(box.homeTeamId);
  const awayBrand = resolveTeamBrand(box.awayTeamId);
  const chart = (
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-semibold">Shot chart</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {watch
              ? "The game plays out on the court. Pause it, or run it at 2× or 4×. The box score is underneath."
              : "Every field goal from this box, replayed on the court."}
          </p>
        </div>
        {watch ? null : (
          <Link href={`/gm/game/${box.id}?watch=1`} className="text-sm font-semibold underline-offset-4 hover:underline">
            Watch again
          </Link>
        )}
      </div>
      <GameShotChart
        gameId={box.gameId}
        status="final"
        events={tape}
        homeLabel={box.homeTeamId.toUpperCase()}
        awayLabel={box.awayTeamId.toUpperCase()}
        homeColor={homeBrand?.primary ?? "#1d428a"}
        awayColor={awayBrand?.primary ?? "#c8102e"}
        homeTeamKey={box.homeTeamId}
        awayTeamKey={box.awayTeamId}
        players={box.players.map((line) => ({
          playerId: line.playerId,
          name: line.playerName,
          side: line.teamId === box.homeTeamId ? "home" : "away",
        }))}
      />
    </section>
  );

  const header = (
      <div className="sports-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Step 3 · Results
          </p>
          <h2 className="text-[24px] font-bold tracking-tight">
            <ClubMark teamId={box.awayTeamId} label={box.awayTeamId.toUpperCase()} />
            {watch ? " @ " : ` ${box.awayScore} @ `}
            <ClubMark teamId={box.homeTeamId} label={box.homeTeamId.toUpperCase()} />
            {watch ? "" : ` ${box.homeScore}`}
          </h2>
          <p className="text-[14px] text-muted-foreground">
            Day {box.day} · {box.season - 1}-{String(box.season).slice(-2)}
          </p>
          {scheme && yours.length ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              {scheme}. {threes} threes on {shots} shots.
              {first ? ` ${first.playerName} scored ${first.points}.` : ""}
            </p>
          ) : null}
        </div>
        <Link
          href="/gm"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Back to plan · next game
        </Link>
      </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {watch ? chart : null}
      {header}
      {watch ? null : chart}
      {box.shiftPlan && box.shiftPlan.length > 0 ? <ShiftPlan rows={box.shiftPlan} played={yours} /> : null}
      <div style={teamColorStyle(box.awayTeamId)}>
        <TeamTable teamId={box.awayTeamId} rows={away} />
      </div>
      <div style={teamColorStyle(box.homeTeamId)}>
        <TeamTable teamId={box.homeTeamId} rows={home} />
      </div>
      <Link
        href="/gm"
        className="text-center text-[14px] font-semibold underline-offset-4 hover:underline"
      >
        Continue to your plan
      </Link>
    </div>
  );
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function ShiftPlan({
  rows,
  played,
}: {
  rows: NonNullable<
    ReturnType<typeof useGmStore.getState>["league"]
  >["boxScores"][number]["shiftPlan"];
  played: NonNullable<
    ReturnType<typeof useGmStore.getState>["league"]
  >["boxScores"][number]["players"];
}) {
  if (!rows) return null;
  const minutes = new Map(played.map((line) => [line.playerId, line.minutes]));
  return (
    <section className="sports-card flex flex-col gap-3 p-4">
      <h3 className="font-semibold">Shifts that tipped off</h3>
      <p className="text-sm text-muted-foreground">
        Lit blocks are the plan. The number is the minutes that came back in the box.
      </p>
      <div className="gm-rot gm-rot--night gm-rot--head" aria-hidden>
        <span />
        <div className="gm-chart">
          {QUARTERS.map((quarter) => (
            <span key={quarter} className="gm-chart__q">
              {quarter}
            </span>
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.playerId} className="gm-rot gm-rot--night">
            <div className="gm-rot__name">
              <Link href={`/gm/player/${encodeURIComponent(row.playerId)}`}>{row.playerName}</Link>
              <span className="tabular-nums">{formatNumber(minutes.get(row.playerId) ?? 0, 1)} min</span>
            </div>
            <div className="gm-chart" aria-hidden>
              {QUARTERS.map((quarter, quarterIndex) => (
                <span key={quarter} className="gm-chart__slice">
                  {[0, 1, 2, 3, 4, 5].map((offset) => {
                    const index = quarterIndex * 6 + offset;
                    return (
                      <span
                        key={offset}
                        className={row.on[index] ? "gm-chart__cell is-on" : "gm-chart__cell"}
                      />
                    );
                  })}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamTable({
  teamId,
  rows,
}: {
  teamId: string;
  rows: NonNullable<
    ReturnType<typeof useGmStore.getState>["league"]
  >["boxScores"][number]["players"];
}) {
  return (
    <section className="gm-club-panel">
      <h3 className="mb-2 font-semibold">
        <ClubMark teamId={teamId} label={`${teamId.toUpperCase()} box`} />
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Player</th>
              <th className="px-2 py-2">MIN</th>
              <th className="px-2 py-2">PTS</th>
              <th className="px-2 py-2">REB</th>
              <th className="px-2 py-2">AST</th>
              <th className="px-2 py-2">FG</th>
              <th className="px-2 py-2">3P</th>
              <th className="px-2 py-2">TS%</th>
              <th className="px-2 py-2">USG%</th>
              <th className="px-2 py-2">GmSc</th>
              <th className="px-2 py-2">+/-</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.playerId} className="gm-club-row">
                <td className="px-2 py-1.5 font-medium">{p.playerName}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {formatNumber(p.minutes, 1)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{p.points}</td>
                <td className="px-2 py-1.5 tabular-nums">{p.rebounds}</td>
                <td className="px-2 py-1.5 tabular-nums">{p.assists}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.fgm}-{p.fga}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.tpm}-{p.tpa}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {formatPct(p.trueShootingPct)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {formatPct(p.usagePct)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {formatNumber(p.gameScore, 1)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.plusMinus > 0 ? "+" : ""}
                  {p.plusMinus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
