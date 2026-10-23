/**
 * Bundled ESPN current roster for Cloudflare Workers.
 * Used so search + player identity match sentiment after offseason moves.
 * Lives under public/runtime (ASSETS) so the ~63KB JSON stays off the Worker.
 * nba-espn-player-ids (~14KB) stays on the module graph (tiny crosswalk).
 */
import nbaEspnIds from "./nba-espn-player-ids.json";

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

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/current-roster-snapshot.json";

let data: RosterFile | null | undefined;
let players: Record<string, BundledCurrentRosterEntry> = {};

const nbaToEspn =
  nbaEspnIds &&
  typeof nbaEspnIds === "object" &&
  "ids" in nbaEspnIds &&
  nbaEspnIds.ids &&
  typeof nbaEspnIds.ids === "object"
    ? (nbaEspnIds.ids as Record<string, string>)
    : {};

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function loadFromPublicDir(): RosterFile | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "current-roster-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as RosterFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<RosterFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as RosterFile;
  } catch {
    return null;
  }
}

function apply(file: RosterFile | null): boolean {
  data = file;
  players =
    file?.players && typeof file.players === "object" ? file.players : {};
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensureCurrentRoster(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

function entryFromRow(
  row: BundledCurrentRosterEntry
): BundledCurrentRosterEntry {
  return {
    teamId: String(row.teamId),
    teamAbbr: String(row.teamAbbr ?? row.teamId),
    teamName: String(row.teamName ?? ""),
    ...(row.name ? { name: String(row.name) } : {}),
    ...(row.pos ? { pos: String(row.pos) } : {}),
    ...(row.dob ? { dob: String(row.dob) } : {}),
  };
}

export function getBundledCurrentRosterEntry(
  playerId: string | null | undefined
): BundledCurrentRosterEntry | null {
  tryPrimeFromDisk();
  const key = String(playerId ?? "").trim();
  if (!key) return null;
  const direct = players[key];
  if (direct?.teamId) return entryFromRow(direct);
  // Impact feeds / DRBL use NBA person ids; roster bundle is ESPN-keyed.
  const espn = nbaToEspn[key]?.trim();
  if (espn) {
    const viaEspn = players[espn];
    if (viaEspn?.teamId) return entryFromRow(viaEspn);
  }
  return null;
}

export function getBundledCurrentTeamId(
  playerId: string | null | undefined
): string | null {
  return getBundledCurrentRosterEntry(playerId)?.teamId ?? null;
}

export function bundledRosterPlayerIds(teamId: string): string[] {
  tryPrimeFromDisk();
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
  tryPrimeFromDisk();
  if (data?.season !== season || Object.keys(players).length === 0) return false;
  const generated = data.generatedAt ? Date.parse(data.generatedAt) : NaN;
  return Number.isFinite(generated) && now - generated < FRESH_MAX_AGE_MS;
}

/** Rows that came from ESPN team rosters (not sentiment gap-fill). */
export function listBundledEspnRosterEntries(): Array<
  [string, BundledCurrentRosterEntry]
> {
  tryPrimeFromDisk();
  return Object.entries(players).filter(
    ([, row]) => Boolean(row?.name) && /^\d+$/.test(String(row?.teamId ?? ""))
  );
}

export function bundledCurrentRosterMeta() {
  tryPrimeFromDisk();
  return {
    version: data?.version ?? 0,
    generatedAt: data?.generatedAt ?? null,
    season: data?.season ?? null,
    playerCount: Object.keys(players).length,
  };
}

/** All ESPN-keyed roster rows (for sitemaps / bulk scans). */
export function getBundledCurrentRosterPlayers(): Record<
  string,
  BundledCurrentRosterEntry
> {
  tryPrimeFromDisk();
  return players;
}
