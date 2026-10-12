import "server-only";

import type { Game, PlayerGame } from "@/data/types";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getBundledCurrentRosterEntry } from "@/data/runtime/current-roster-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { priorSeasonForStats } from "@/lib/player-board-season";
import { scoreTimeline } from "@/lib/score-timeline";
import {
  playerLineFor,
  scoringTrend,
  teamGameWindow,
  type WatchDrbl,
  type WatchGame,
  type WatchInjury,
  type WatchPlayerStatus,
  type WatchStatus,
  type WatchTeamStatus,
} from "@/lib/watchlist-status";
import { withBudget } from "./budget";

const FEED_BUDGET_MS = 3_500;
const GAME_LOG_BUDGET_MS = 3_500;

function monthKeyShift(today: string, delta: number): string {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function seasonForMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return canonicalSeasonFromStartYear(m! >= 7 ? y! : y! - 1);
}

/** Last month through next month, with today's games re-read at the live TTL. */
async function scheduleWindow(): Promise<Game[]> {
  const { getScoreboardMonthFeed, getScoreboardDateFeed } = await import("./scoreboard-feed");
  const today = nbaTodayIso();
  const months = [-1, 0, 1].map((d) => monthKeyShift(today, d));
  const [monthFeeds, todayFeed] = await Promise.all([
    Promise.all(
      months.map((monthKey) =>
        withBudget(
          getScoreboardMonthFeed({ monthKey, season: seasonForMonth(monthKey) }).then((f) => f.data.games),
          FEED_BUDGET_MS,
          [] as Game[]
        ).then((r) => r.value)
      )
    ),
    withBudget(
      getScoreboardDateFeed({ date: today }).then((f) => (f.isStale ? [] : f.data)),
      FEED_BUDGET_MS,
      [] as Game[]
    ).then((r) => r.value),
  ]);
  const byId = new Map<string, Game>();
  for (const g of monthFeeds.flat()) byId.set(g.id, g);
  for (const g of todayFeed) byId.set(g.id, { ...byId.get(g.id), ...g });
  if (byId.size === 0) {
    const { getRuntimeSnapshotWindow } = await import("@/data/runtime/game-snapshot");
    for (const g of getRuntimeSnapshotWindow({ fromDate: today })) byId.set(g.id, g);
  }
  return [...byId.values()];
}

async function injuriesById(): Promise<Map<string, WatchInjury>> {
  const { getInjuryReport } = await import("./injury-report");
  const { value } = await withBudget(getInjuryReport().catch(() => null), FEED_BUDGET_MS, null);
  const map = new Map<string, WatchInjury>();
  for (const e of value?.entries ?? []) {
    map.set(e.athleteId, {
      status: e.status,
      statusLabel: e.statusLabel,
      injury: e.injury,
      returnDate: e.returnDate,
    });
  }
  return map;
}

function drblFor(espnId: string, season: string): WatchDrbl | null {
  const nbaId = getBundledPlayerIdAliasIndex().byEspn.get(espnId)?.nbaPlayerId ?? espnId;
  const pick = (s: string) => {
    const row = getBundledDrblSeason(s).find((r) => r.playerId === nbaId);
    if (!row || !(row.possessions > 0) || !Number.isFinite(row.rawAbilityRate)) return null;
    return { season: s, value: row.drbl100 };
  };
  const prior = priorSeasonForStats(season);
  const current = pick(season);
  const last = pick(prior);
  if (current) return { ...current, prior: last };
  return last ? { ...last, prior: null } : null;
}

async function gameLog(playerId: string, season: string): Promise<PlayerGame[]> {
  const { getPlayerGameLog } = await import("./players");
  const { value } = await withBudget(
    getPlayerGameLog(playerId, season).catch(() => [] as PlayerGame[]),
    GAME_LOG_BUDGET_MS,
    [] as PlayerGame[]
  );
  return value;
}

/** A delayed viewer can still be watching a game this long after tip-off. */
const RECENT_TIP_MS = 4 * 60 * 60 * 1000;

/** Final-buzzer times from play-by-play for games that tipped in the last few hours. */
async function endTimes(lasts: (WatchGame | null)[]): Promise<Map<string, number>> {
  const now = Date.now();
  const recent = [
    ...new Set(
      lasts
        .filter((g): g is WatchGame => g != null && g.tipOffAt != null)
        .filter((g) => now - Date.parse(g.tipOffAt!) < RECENT_TIP_MS)
        .map((g) => g.gameId)
    ),
  ];
  const { getGamePlayByPlay } = await import("./games");
  const out = new Map<string, number>();
  await Promise.all(
    recent.map(async (gameId) => {
      const { value } = await withBudget(getGamePlayByPlay(gameId).catch(() => null), GAME_LOG_BUDGET_MS, null);
      const end = value ? scoreTimeline(value.events).findLast((p) => p.status === "final") : undefined;
      if (end) out.set(gameId, end.at);
    })
  );
  return out;
}

export async function getWatchlistStatus(options: {
  players: string[];
  teams: string[];
}): Promise<{ season: string; items: WatchStatus[]; generatedAt: string }> {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const [games, injuries, logs] = await Promise.all([
    options.players.length || options.teams.length ? scheduleWindow() : Promise.resolve([] as Game[]),
    options.players.length ? injuriesById() : Promise.resolve(new Map<string, WatchInjury>()),
    Promise.all(options.players.map((id) => gameLog(id, season))),
  ]);

  const playerTeams = options.players.map((id) => getBundledCurrentRosterEntry(id)?.teamId ?? null);
  const windows = new Map(
    [...new Set([...options.teams, ...playerTeams.filter((t): t is string => t != null)])].map(
      (teamId) => [teamId, teamGameWindow(games, teamId)] as const
    )
  );
  const ended = await endTimes([...windows.values()].map((w) => w.last));
  const windowFor = (teamId: string | null) => {
    const w = teamId ? windows.get(teamId) : undefined;
    if (!w) return { last: null, live: null, next: null };
    const endedAt = w.last ? ended.get(w.last.gameId) : undefined;
    return endedAt != null && w.last ? { ...w, last: { ...w.last, endedAt } } : w;
  };

  const teams: WatchTeamStatus[] = options.teams.map((id) => ({
    kind: "team",
    id,
    ...windowFor(id),
  }));

  const players: WatchPlayerStatus[] = options.players.map((id, i) => {
    const teamId = playerTeams[i] ?? null;
    const window = windowFor(teamId);
    const log = logs[i] ?? [];
    return {
      kind: "player",
      id,
      teamId,
      ...window,
      line: playerLineFor(log, window.last?.gameId),
      trend: scoringTrend(log, season),
      drbl: drblFor(id, season),
      injury: injuries.get(id) ?? null,
    };
  });

  return { season, items: [...players, ...teams], generatedAt: new Date().toISOString() };
}
