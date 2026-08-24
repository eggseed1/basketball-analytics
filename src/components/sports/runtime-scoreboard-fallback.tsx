"use client";

import { useEffect, useMemo, useState } from "react";
import { Gamefeed, type GamefeedView } from "@/components/sports/gamefeed";
import type { GameSummary } from "@/data/types";

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m! - 1) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function mapEvent(event: any, season: string): GameSummary | null {
  const comp = event?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
  if (!event?.id || !home?.team?.id || !away?.team?.id) return null;
  const state = String(comp?.status?.type?.state ?? event?.status?.type?.state ?? "").toLowerCase();
  const completed = Boolean(comp?.status?.type?.completed ?? event?.status?.type?.completed);
  const status = completed || state === "post" ? "final" : state === "in" ? "in_progress" : "scheduled";
  const homeScore = Number(home.score ?? 0) || 0;
  const awayScore = Number(away.score ?? 0) || 0;
  const gameDate = String(event.date ?? "").slice(0, 10);
  return { id: String(event.id), season, gameDate, tipOffAt: event.date, statusDetail: comp?.status?.type?.shortDetail ?? event?.status?.type?.shortDetail, homeTeamId: String(home.team.id), awayTeamId: String(away.team.id), homeTeamAbbr: home.team.abbreviation, awayTeamAbbr: away.team.abbreviation, homeTeamName: home.team.displayName, awayTeamName: away.team.displayName, homeScore, awayScore, gameType: event?.season?.type === 1 ? "preseason" : event?.season?.type === 3 ? "playoff" : "regular", status, teamIdProvider: "espn", homeProviderTeamId: String(home.team.id), awayProviderTeamId: String(away.team.id), totalPoints: homeScore + awayScore, margin: homeScore - awayScore, absMargin: Math.abs(homeScore - awayScore) } as GameSummary;
}

export function RuntimeScoreboardFallback(props: { view: GamefeedView; season: string; monthKey: string; weekStart: string; weekEnd: string }) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const months = useMemo(() => props.view === "list" ? [props.monthKey, shiftMonth(props.monthKey, 1)] : [props.monthKey], [props.view, props.monthKey]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(months.map(async (month) => {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${month.replace("-", "")}&limit=400`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return (data.events ?? []).map((e: any) => mapEvent(e, props.season)).filter(Boolean) as GameSummary[];
    })).then((chunks) => { if (!cancelled) setGames(chunks.flat()); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [months, props.season]);
  if (failed) return <p className="sports-card p-6 text-[14px] text-muted-foreground">Schedule data is temporarily unavailable from both the server and browser feeds.</p>;
  if (!games.length) return <p className="sports-card p-6 text-[14px] text-muted-foreground">Loading NBA schedule…</p>;
  const today = new Date().toISOString().slice(0,10);
  return <Gamefeed view={props.view} season={props.season} monthKey={props.monthKey} weekStart={props.weekStart} weekEnd={props.weekEnd} monthGames={games.filter(g => g.gameDate.startsWith(props.monthKey))} weekGames={games.filter(g => g.gameDate >= props.weekStart && g.gameDate <= props.weekEnd)} upcomingGames={games.filter(g => g.gameDate >= today)} upcomingHasMore={false} />;
}
