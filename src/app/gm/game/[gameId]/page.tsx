"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { formatNumber, formatPct } from "@/lib/format";

export default function GmGamePage() {
  return (
    <GmShell>
      <GameBody />
    </GmShell>
  );
}

function GameBody() {
  const params = useParams<{ gameId: string }>();
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  const box = league.boxScores.find((b) => b.id === params.gameId);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="sports-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Step 3 · Results
          </p>
          <h2 className="text-[24px] font-bold tracking-tight">
            {box.awayTeamId.toUpperCase()} {box.awayScore} @{" "}
            {box.homeTeamId.toUpperCase()} {box.homeScore}
          </h2>
          <p className="text-[14px] text-muted-foreground">
            Day {box.day} · {box.season - 1}-{String(box.season).slice(-2)}
          </p>
        </div>
        <Link
          href="/gm"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Back to plan · next game
        </Link>
      </div>
      <TeamTable title={`${box.awayTeamId.toUpperCase()} box`} rows={away} />
      <TeamTable title={`${box.homeTeamId.toUpperCase()} box`} rows={home} />
      <Link
        href="/gm"
        className="text-center text-[14px] font-semibold underline-offset-4 hover:underline"
      >
        Continue to your plan
      </Link>
    </div>
  );
}

function TeamTable({
  title,
  rows,
}: {
  title: string;
  rows: NonNullable<
    ReturnType<typeof useGmStore.getState>["league"]
  >["boxScores"][number]["players"];
}) {
  return (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
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
              <tr key={p.playerId}>
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
