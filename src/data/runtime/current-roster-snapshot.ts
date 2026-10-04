/**
 * Bundled ESPN current roster for Cloudflare Workers.
 * Used so search + player identity match sentiment after offseason moves.
 */
import snapshot from "./current-roster-snapshot.json";

export type BundledCurrentRosterEntry = {
  teamId: string;
  teamAbbr: string;
  teamName: string;
  /** ESPN display name; absent on sentiment gap-fill rows. */
  name?: string;
  /** ESPN position abbreviation. */
  pos?: string;
  /** Birth date, YYYY-MM-DD. */
  dob?: string;
};

type RosterFile = {
  version?: number;
  generatedAt?: string;
  season?: string;
  players?: Record<string, BundledCurrentRosterEntry>;
};

const data = snapshot as unknown as RosterFile;
const players =
  data?.players && typeof data.players === "object" ? data.players : {};

export function getBundledCurrentRosterEntry(
  playerId: string | null | undefined
): BundledCurrentRosterEntry | null {
  const key = String(playerId ?? "").trim();
  if (!key) return null;
  const row = players[key];
  if (!row?.teamId) return null;
  return {
    teamId: String(row.teamId),
    teamAbbr: String(row.teamAbbr ?? row.teamId),
    teamName: String(row.teamName ?? ""),
    ...(row.name ? { name: String(row.name) } : {}),
    ...(row.pos ? { pos: String(row.pos) } : {}),
    ...(row.dob ? { dob: String(row.dob) } : {}),
  };
}

export function getBundledCurrentTeamId(
  playerId: string | null | undefined
): string | null {
  return getBundledCurrentRosterEntry(playerId)?.teamId ?? null;
}

export function bundledRosterPlayerIds(teamId: string): string[] {
  return Object.entries(players)
    .filter(([, row]) => String(row?.teamId) === teamId)
    .map(([id]) => id);
}

/** Try several known ids (ESPN, NBA, route) for a current-team hit. */
export function resolveBundledCurrentTeamId(
  ...playerIds: Array<string | null | undefined>
): string | null {
  for (const id of playerIds) {
    const hit = getBundledCurrentTeamId(id);
    if (hit) return hit;
  }
  return null;
}

const FRESH_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True when the bundle lists the given season's rosters and was baked recently
 * enough to stand in for a live 30-team ESPN crawl.
 */
export function bundledCurrentRosterIsFresh(
  season: string,
  now = Date.now()
): boolean {
  if (data.season !== season || Object.keys(players).length === 0) return false;
  const generated = data.generatedAt ? Date.parse(data.generatedAt) : NaN;
  return Number.isFinite(generated) && now - generated < FRESH_MAX_AGE_MS;
}

/** Rows that came from ESPN team rosters (not sentiment gap-fill). */
export function listBundledEspnRosterEntries(): Array<
  [string, BundledCurrentRosterEntry]
> {
  return Object.entries(players).filter(
    ([, row]) => Boolean(row?.name) && /^\d+$/.test(String(row?.teamId ?? ""))
  );
}

export function bundledCurrentRosterMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    season: data.season ?? null,
    playerCount: Object.keys(players).length,
  };
}
