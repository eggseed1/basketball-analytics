"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import {
  GameShotChart,
  type ShotChartReplayProgress,
} from "@/components/games/game-shot-chart";
import { GmShell } from "@/gm/ui/gm-shell";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { schemeHeadline } from "@/gm/engine/coaching";
import { boxToPlayByPlay, linesAtCutoff } from "@/gm/engine/play-by-play";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmBoxPlayerLine } from "@/gm/types";
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
  const t = useTranslations("GmUi");
  const params = useParams<{ gameId: string }>();
  const watch = useSearchParams().get("watch") === "1";
  const league = useGmStore((s) => s.league);
  const box = league?.boxScores.find((b) => b.id === params.gameId) ?? null;
  const tape = useMemo(() => (box ? boxToPlayByPlay(box) : []), [box]);
  const [progress, setProgress] = useState<ShotChartReplayProgress | null>(null);
  const onReplayProgress = useCallback((next: ShotChartReplayProgress) => {
    setProgress(next);
  }, []);

  const liveBox = useMemo(() => {
    if (!box) return null;
    if (!progress || (progress.cutoff == null && !progress.playing)) {
      return box.players;
    }
    return linesAtCutoff(box, tape, progress.cutoff);
  }, [box, tape, progress]);

  if (!league) return null;
  if (!box || !liveBox) {
    return (
      <p className="text-muted-foreground">
        {t("gameNotFound")}{" "}
        <Link href="/gm/schedule" className="underline">
          {t("gameBackSchedule")}
        </Link>
      </p>
    );
  }

  const ticking = Boolean(progress?.playing || progress?.cutoff != null);
  const awayScore = ticking ? (progress?.awayScore ?? 0) : box.awayScore;
  const homeScore = ticking ? (progress?.homeScore ?? 0) : box.homeScore;

  const away = liveBox
    .filter((p) => p.teamId === box.awayTeamId)
    .sort((a, b) => b.points - a.points || b.gameScore - a.gameScore);
  const home = liveBox
    .filter((p) => p.teamId === box.homeTeamId)
    .sort((a, b) => b.points - a.points || b.gameScore - a.gameScore);
  const user = league.teams.find((team) => team.id === league.userTeamId);
  const scheme = schemeHeadline(user?.coaching);
  const yours =
    user && (box.homeTeamId === user.id || box.awayTeamId === user.id)
      ? liveBox.filter((line) => line.teamId === user.id)
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
          <h3 className="font-semibold">{t("gameShotChart")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {watch ? t("gameWatchNote") : t("gameReplayNote")}
          </p>
        </div>
        {watch ? null : (
          <Link href={`/gm/game/${box.id}?watch=1`} className="text-sm font-semibold underline-offset-4 hover:underline">
            {t("gameWatchAgain")}
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
        autoPlay={watch}
        onReplayProgress={onReplayProgress}
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
            {t("gameStepResults")}
          </p>
          <h2 className="text-[24px] font-bold tracking-tight tabular-nums">
            <ClubMark teamId={box.awayTeamId} label={box.awayTeamId.toUpperCase()} />
            {` ${awayScore} @ `}
            <ClubMark teamId={box.homeTeamId} label={box.homeTeamId.toUpperCase()} />
            {` ${homeScore}`}
          </h2>
          <p className="text-[14px] text-muted-foreground">
            {t("gameDayLine", {
              day: box.day,
              season: `${box.season - 1}-${String(box.season).slice(-2)}`,
            })}
          </p>
          {scheme && yours.length && !ticking ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              {t("gameSchemeLine", { scheme, threes, shots })}
              {first
                ? ` ${t("gameFirstScored", { player: first.playerName, points: first.points })}`
                : ""}
            </p>
          ) : null}
        </div>
        <Link
          href="/gm"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          {t("gameBackToPlan")}
        </Link>
      </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t("pageGameTitle")}</h1>
      <p className="sr-only">{t("pageGameBlurb")}</p>
      {watch ? chart : null}
      {header}
      {watch ? null : chart}
      {box.shiftPlan && box.shiftPlan.length > 0 ? <ShiftPlan rows={box.shiftPlan} played={yours} /> : null}
      <div style={teamColorStyle(box.awayTeamId)}>
        <TeamTable teamId={box.awayTeamId} rows={away} live={ticking} />
      </div>
      <div style={teamColorStyle(box.homeTeamId)}>
        <TeamTable teamId={box.homeTeamId} rows={home} live={ticking} />
      </div>
      <Link
        href="/gm"
        className="text-center text-[14px] font-semibold underline-offset-4 hover:underline"
      >
        {t("gameContinue")}
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
  played: GmBoxPlayerLine[];
}) {
  const t = useTranslations("GmUi");
  if (!rows) return null;
  const minutes = new Map(played.map((line) => [line.playerId, line.minutes]));
  return (
    <section className="sports-card flex flex-col gap-3 p-4">
      <h3 className="font-semibold">{t("gameShifts")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("gameShiftsNote")}
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
              <span className="tabular-nums">{t("nightMinutes", { minutes: formatNumber(minutes.get(row.playerId) ?? 0, 1) })}</span>
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
  live,
}: {
  teamId: string;
  rows: GmBoxPlayerLine[];
  live: boolean;
}) {
  const t = useTranslations("GmUi");
  return (
    <section className="gm-club-panel">
      <h3 className="mb-2 font-semibold">
        <ClubMark teamId={teamId} label={t("gameBoxLabel", { team: teamId.toUpperCase() })} />
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">{t("colPlayer")}</th>
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
                  {live && p.fga + p.fta === 0 ? "—" : formatPct(p.trueShootingPct)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {live ? "—" : formatPct(p.usagePct)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {live ? "—" : formatNumber(p.gameScore, 1)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {live
                    ? "—"
                    : `${p.plusMinus > 0 ? "+" : ""}${p.plusMinus}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
