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
  /** Live box score line; absent when ESPN's box doesn't list the player yet. */
  points?: number;
  fouls?: number;
};

export type TeamLineup = {
  espnTeamId: string;
  onCourt: LineupPlayer[] | null;
  starters: LineupPlayer[] | null;
};

/** Floor state for one side. Null fields mean ESPN didn't report them. */
export type TeamFloorState = {
  timeoutsRemaining: number | null;
  /** Team fouls in the current period. */
  teamFouls: number | null;
  foulsToGive: number | null;
  /** True when the other side has no fouls to give, so this side shoots on the next foul. */
  inBonus: boolean | null;
};

export type GameLineups = {
  gameId: string;
  away: TeamLineup | null;
  home: TeamLineup | null;
  state?: { away: TeamFloorState; home: TeamFloorState } | null;
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

type RawSituation = {
  homeTimeouts?: { timeoutsRemainingCurrent?: number };
  awayTimeouts?: { timeoutsRemainingCurrent?: number };
  homeFouls?: { teamFoulsCurrent?: number; foulsToGive?: number };
  awayFouls?: { teamFoulsCurrent?: number; foulsToGive?: number };
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function floorState(raw: RawSituation | null): GameLineups["state"] {
  if (!raw) return null;
  const side = (
    timeouts: RawSituation["homeTimeouts"],
    fouls: RawSituation["homeFouls"],
    other: RawSituation["homeFouls"]
  ): TeamFloorState => {
    const otherToGive = num(other?.foulsToGive);
    return {
      timeoutsRemaining: num(timeouts?.timeoutsRemainingCurrent),
      teamFouls: num(fouls?.teamFoulsCurrent),
      foulsToGive: num(fouls?.foulsToGive),
      inBonus: otherToGive == null ? null : otherToGive === 0,
    };
  };
  return {
    home: side(raw.homeTimeouts, raw.homeFouls, raw.awayFouls),
    away: side(raw.awayTimeouts, raw.awayFouls, raw.homeFouls),
  };
}

async function fromCore(gameId: string): Promise<GameLineups | null> {
  const competition = `${CORE}/events/${gameId}/competitions/${gameId}`;
  const base = `${competition}/competitors`;
  const situationRequest = getJson<RawSituation>(`${competition}/situation?lang=en`).catch(
    () => null
  );
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
    state: floorState(await situationRequest),
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
        competitors?: Array<{
          id?: string;
          homeAway?: string;
          timeoutsRemaining?: number;
          fouls?: { teamFoulsCurrent?: number; foulsToGive?: number };
        }>;
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
  const homeComp = competitors.find((c) => c.homeAway === "home");
  const awayComp = competitors.find((c) => c.homeAway === "away");
  return {
    gameId,
    away,
    home,
    state:
      homeComp && awayComp
        ? floorState({
            homeTimeouts: { timeoutsRemainingCurrent: homeComp.timeoutsRemaining },
            awayTimeouts: { timeoutsRemainingCurrent: awayComp.timeoutsRemaining },
            homeFouls: homeComp.fouls,
            awayFouls: awayComp.fouls,
          })
        : null,
    source: "espn-cdn",
    retrievedAt: new Date().toISOString(),
  };
}

type CdnStatsTeam = {
  statistics?: Array<{
    keys?: string[];
    athletes?: Array<{ athlete?: { id?: string }; stats?: string[] }>;
  }>;
};

/** Points and fouls per player from ESPN's live box score. */
async function liveBoxLines(gameId: string): Promise<Map<string, { points: number; fouls: number }>> {
  const summary = (await fetchEspnCdnGameSummary(gameId)) as unknown as {
    boxscore?: { players?: CdnStatsTeam[] };
  } | null;
  const out = new Map<string, { points: number; fouls: number }>();
  for (const team of summary?.boxscore?.players ?? []) {
    const block = team.statistics?.[0];
    const keys = block?.keys ?? [];
    const pi = keys.indexOf("points");
    const fi = keys.indexOf("fouls");
    if (pi < 0 || fi < 0) continue;
    for (const a of block?.athletes ?? []) {
      const id = a.athlete?.id;
      const points = Number(a.stats?.[pi]);
      const fouls = Number(a.stats?.[fi]);
      if (id && Number.isFinite(points) && Number.isFinite(fouls)) {
        out.set(String(id), { points, fouls });
      }
    }
  }
  return out;
}

async function withLiveLines(value: GameLineups | null): Promise<GameLineups | null> {
  if (!value || ![value.away, value.home].some((s) => s?.onCourt)) return value;
  const lines = await liveBoxLines(value.gameId).catch(() => null);
  if (!lines?.size) return value;
  const attach = (side: TeamLineup | null): TeamLineup | null =>
    side?.onCourt
      ? {
          ...side,
          onCourt: side.onCourt.map((p) => {
            const line = lines.get(p.playerId);
            return line ? { ...p, ...line } : p;
          }),
        }
      : side;
  return { ...value, away: attach(value.away), home: attach(value.home) };
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
    if (hasAnyLineup(core)) return withLiveLines(core);
    const cdn = await fromCdn(id).catch(() => null);
    return withLiveLines(hasAnyLineup(cdn) ? cdn : core);
  })()
    .then((value) => {
      cache.set(id, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, request);
  return request;
}
