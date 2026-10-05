import "server-only";

import { getBundledCurrentRosterEntry } from "@/data/runtime/current-roster-snapshot";
import { fetchEspnCdnGameSummary } from "./espn-cdn-summary";

/**
 * Who is on the floor (live) and who starts (announced before tip), from
 * ESPN's per-competitor rosters. A side is only reported when ESPN flags
 * exactly five players; anything else stays null rather than a guess.
 */

export type LineupPlayer = {
  playerId: string;
  name: string;
  jersey?: string;
  position?: string;
};

export type TeamLineup = {
  espnTeamId: string;
  onCourt: LineupPlayer[] | null;
  starters: LineupPlayer[] | null;
};

export type GameLineups = {
  gameId: string;
  away: TeamLineup | null;
  home: TeamLineup | null;
  source: "espn-core" | "espn-cdn";
  retrievedAt: string;
};

type RawEntry = {
  playerId: string;
  displayName?: string;
  jersey?: string;
  position?: string;
  active?: boolean;
  starter?: boolean;
  didNotPlay?: boolean;
  ejected?: boolean;
};

const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const CACHE_TTL_MS = 15_000;
const TIMEOUT_MS = 5_000;
const cache = new Map<string, { at: number; value: GameLineups | null }>();
const inflight = new Map<string, Promise<GameLineups | null>>();

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ESPN lineup request failed (${res.status})`);
  return (await res.json()) as T;
}

function toPlayer(entry: RawEntry): LineupPlayer {
  const bundled = getBundledCurrentRosterEntry(entry.playerId);
  return {
    playerId: entry.playerId,
    name: bundled?.name || entry.displayName || `#${entry.jersey ?? "?"}`,
    ...(entry.jersey ? { jersey: entry.jersey } : {}),
    ...(bundled?.pos || entry.position
      ? { position: bundled?.pos || entry.position }
      : {}),
  };
}

function exactlyFive(entries: RawEntry[], flag: "active" | "starter") {
  const hits = entries.filter((e) => e[flag] === true && !e.ejected);
  return hits.length === 5 ? hits.map(toPlayer) : null;
}

function teamLineup(espnTeamId: string, entries: RawEntry[]): TeamLineup {
  return {
    espnTeamId,
    onCourt: exactlyFive(entries, "active"),
    starters: exactlyFive(entries, "starter"),
  };
}

async function fromCore(gameId: string): Promise<GameLineups | null> {
  const base = `${CORE}/events/${gameId}/competitions/${gameId}/competitors`;
  const competitors = await getJson<{
    items?: Array<{ id?: string; homeAway?: string }>;
  }>(`${base}?lang=en`);
  const sides = (competitors.items ?? []).filter(
    (c): c is { id: string; homeAway: "home" | "away" } =>
      Boolean(c.id) && (c.homeAway === "home" || c.homeAway === "away")
  );
  if (sides.length !== 2) return null;

  const rosters = await Promise.all(
    sides.map(async (side) => {
      const roster = await getJson<{
        entries?: Array<{
          playerId?: number | string;
          displayName?: string;
          jersey?: string;
          active?: boolean;
          starter?: boolean;
          didNotPlay?: boolean;
          ejected?: boolean;
        }>;
      }>(`${base}/${side.id}/roster?lang=en`);
      const entries: RawEntry[] = (roster.entries ?? [])
        .filter((e) => e.playerId != null)
        .map((e) => ({
          playerId: String(e.playerId),
          displayName: e.displayName,
          jersey: e.jersey,
          active: e.active,
          starter: e.starter,
          didNotPlay: e.didNotPlay,
          ejected: e.ejected,
        }));
      return { side, lineup: teamLineup(side.id, entries) };
    })
  );

  const away = rosters.find((r) => r.side.homeAway === "away")?.lineup ?? null;
  const home = rosters.find((r) => r.side.homeAway === "home")?.lineup ?? null;
  return {
    gameId,
    away,
    home,
    source: "espn-core",
    retrievedAt: new Date().toISOString(),
  };
}

type CdnBoxTeam = {
  team?: { id?: string };
  statistics?: Array<{
    athletes?: Array<{
      active?: boolean;
      starter?: boolean;
      didNotPlay?: boolean;
      ejected?: boolean;
      athlete?: {
        id?: string;
        displayName?: string;
        jersey?: string;
        position?: { abbreviation?: string };
      };
    }>;
  }>;
};

async function fromCdn(gameId: string): Promise<GameLineups | null> {
  const summary = (await fetchEspnCdnGameSummary(gameId)) as unknown as {
    header?: {
      competitions?: Array<{
        competitors?: Array<{ id?: string; homeAway?: string }>;
      }>;
    };
    boxscore?: { players?: CdnBoxTeam[] };
  } | null;
  if (!summary) return null;
  const competitors = summary.header?.competitions?.[0]?.competitors ?? [];
  const sideOf = new Map(
    competitors
      .filter((c) => c.id)
      .map((c) => [String(c.id), c.homeAway] as const)
  );
  let away: TeamLineup | null = null;
  let home: TeamLineup | null = null;
  for (const team of summary.boxscore?.players ?? []) {
    const id = team.team?.id ? String(team.team.id) : null;
    if (!id) continue;
    const entries: RawEntry[] = (team.statistics?.[0]?.athletes ?? [])
      .filter((a) => a.athlete?.id)
      .map((a) => ({
        playerId: String(a.athlete!.id),
        displayName: a.athlete?.displayName,
        jersey: a.athlete?.jersey,
        position: a.athlete?.position?.abbreviation,
        active: a.active,
        starter: a.starter,
        didNotPlay: a.didNotPlay,
        ejected: a.ejected,
      }));
    const lineup = teamLineup(id, entries);
    if (sideOf.get(id) === "away") away = lineup;
    if (sideOf.get(id) === "home") home = lineup;
  }
  if (!away && !home) return null;
  return {
    gameId,
    away,
    home,
    source: "espn-cdn",
    retrievedAt: new Date().toISOString(),
  };
}

function hasAnyLineup(value: GameLineups | null): boolean {
  if (!value) return false;
  return [value.away, value.home].some(
    (side) => side?.onCourt != null || side?.starters != null
  );
}

export async function fetchEspnGameLineups(
  gameId: string
): Promise<GameLineups | null> {
  const id = String(gameId ?? "").trim();
  if (!/^40\d{6,}$/.test(id)) return null;

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const pending = inflight.get(id);
  if (pending) return pending;

  const request = (async () => {
    const core = await fromCore(id).catch(() => null);
    if (hasAnyLineup(core)) return core;
    const cdn = await fromCdn(id).catch(() => null);
    return hasAnyLineup(cdn) ? cdn : core;
  })()
    .then((value) => {
      cache.set(id, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, request);
  return request;
}
