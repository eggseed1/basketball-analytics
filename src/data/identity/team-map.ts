/**
 * Canonical cross-provider team identity.
 *
 * Rule: provider numeric IDs are namespaced. ESPN `25` ≠ BDL `25` ≠ NBA `1610612760`.
 * DRBL canonical team id = ESPN team id (existing UI / ASK / brand convention).
 *
 * NBA Stats TEAM_ID format `16106127xx` (10 digits) may be format-inferred as the
 * `nba` namespace only - never treated as ESPN or BDL. Bare short numerics are never
 * cross-guessed across providers.
 *
 * Lookup is static in-memory - never network.
 */

import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { NBA_TEAM_META } from "@/data/providers/nba/nba-team-meta";
import { ALL_TEAM_ABBRS, TEAM_BRANDS, resolveTeamBrand } from "@/lib/nba-brand";
import { HISTORICAL_ABBR_ALIASES } from "@/data/identity/historical-abbr-aliases";

/** Known schedule / scoreboard team-id providers. Extensible for future PBP, etc. */
export type TeamDataProviderId = "espn" | "bdl" | "nba" | (string & {});

/** Opaque namespaced key: `espn:25`, `bdl:25`, `nba:1610612760`. */
export type ProviderTeamKey = `${string}:${string}`;

/**
 * Canonical DRBL team id - ESPN numeric team id as string.
 * Same space as `TeamBrand.espnTeamId` / ASK team entities.
 */
export type CanonicalTeamId = string;

export type CanonicalTeam = {
  canonicalTeamId: CanonicalTeamId;
  brandId: string;
  abbr: string;
  displayName: string;
  providerIds: Partial<Record<"espn" | "bdl" | "nba", string>>;
};

/**
 * Unambiguous NBA Stats TEAM_ID shape: 10 digits, prefix `16106127`.
 * Format-inferred as `nba` namespace only - never as espn/bdl.
 */
export function isNbaStatsTeamIdFormat(id: string): boolean {
  return /^16106127\d{2}$/.test(String(id).trim());
}

export type TeamIdentityResolution =
  | { status: "resolved"; team: CanonicalTeam }
  | { status: "unresolved"; reason: string };

/** BallDontLie team ids keyed by uppercase abbreviation (explicit, inspectable). */
export const BDL_TEAM_ID_BY_ABBR: Record<string, string> = {
  ATL: "1",
  BOS: "2",
  BKN: "3",
  CHA: "4",
  CHI: "5",
  CLE: "6",
  DAL: "7",
  DEN: "8",
  DET: "9",
  GSW: "10",
  HOU: "11",
  IND: "12",
  LAC: "13",
  LAL: "14",
  MEM: "15",
  MIA: "16",
  MIL: "17",
  MIN: "18",
  NOP: "19",
  NYK: "20",
  OKC: "21",
  ORL: "22",
  PHI: "23",
  PHX: "24",
  POR: "25",
  SAC: "26",
  SAS: "27",
  TOR: "28",
  UTA: "29",
  WAS: "30",
};

const NICKNAMES: Record<string, string> = {
  ATL: "Hawks",
  BOS: "Celtics",
  BKN: "Nets",
  CHA: "Hornets",
  CHI: "Bulls",
  CLE: "Cavaliers",
  DAL: "Mavericks",
  DEN: "Nuggets",
  DET: "Pistons",
  GSW: "Warriors",
  HOU: "Rockets",
  IND: "Pacers",
  LAC: "Clippers",
  LAL: "Lakers",
  MEM: "Grizzlies",
  MIA: "Heat",
  MIL: "Bucks",
  MIN: "Timberwolves",
  NOP: "Pelicans",
  NYK: "Knicks",
  OKC: "Thunder",
  ORL: "Magic",
  PHI: "76ers",
  PHX: "Suns",
  POR: "Trail Blazers",
  SAC: "Kings",
  SAS: "Spurs",
  TOR: "Raptors",
  UTA: "Jazz",
  WAS: "Wizards",
};

function displayNameFor(abbr: string, espnId: string): string {
  const meta = ESPN_TEAM_META[espnId];
  const nick = NICKNAMES[abbr] ?? abbr;
  if (meta?.city) {
    if (abbr === "GSW") return "Golden State Warriors";
    if (abbr === "LAC") return "LA Clippers";
    if (abbr === "LAL") return "Los Angeles Lakers";
    if (abbr === "NOP") return "New Orleans Pelicans";
    if (abbr === "NYK") return "New York Knicks";
    if (abbr === "OKC") return "Oklahoma City Thunder";
    if (abbr === "SAS") return "San Antonio Spurs";
    return `${meta.city} ${nick}`;
  }
  return nick;
}

/** NBA Stats TEAM_ID by uppercase abbreviation (from repo `NBA_TEAM_META` only). */
const NBA_TEAM_ID_BY_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(NBA_TEAM_META).map(([nbaId, meta]) => [
    meta.abbreviation.toUpperCase(),
    nbaId,
  ])
);

function buildCanonicalTeams(): CanonicalTeam[] {
  const out: CanonicalTeam[] = [];
  const seenEspn = new Set<string>();
  for (const abbrKey of ALL_TEAM_ABBRS) {
    const brand = TEAM_BRANDS[abbrKey];
    if (!brand || seenEspn.has(brand.espnTeamId)) continue;
    seenEspn.add(brand.espnTeamId);
    const abbr = brand.abbr.toUpperCase();
    const bdl = BDL_TEAM_ID_BY_ABBR[abbr];
    const nba = NBA_TEAM_ID_BY_ABBR[abbr];
    out.push({
      canonicalTeamId: brand.espnTeamId,
      brandId: brand.id,
      abbr,
      displayName: displayNameFor(abbr, brand.espnTeamId),
      providerIds: {
        espn: brand.espnTeamId,
        ...(bdl ? { bdl } : {}),
        ...(nba ? { nba } : {}),
      },
    });
  }
  return out.sort(
    (a, b) => Number(a.canonicalTeamId) - Number(b.canonicalTeamId)
  );
}

const CANONICAL_TEAMS: CanonicalTeam[] = buildCanonicalTeams();

const BY_CANONICAL = new Map(
  CANONICAL_TEAMS.map((t) => [t.canonicalTeamId, t])
);
const BY_ABBR = new Map(CANONICAL_TEAMS.map((t) => [t.abbr.toUpperCase(), t]));
const BY_BRAND_ID = new Map(CANONICAL_TEAMS.map((t) => [t.brandId, t]));
const BY_PROVIDER = new Map<ProviderTeamKey, CanonicalTeam>();

for (const team of CANONICAL_TEAMS) {
  for (const [provider, id] of Object.entries(team.providerIds)) {
    if (!id) continue;
    BY_PROVIDER.set(providerTeamKey(provider, id), team);
  }
}

export function providerTeamKey(
  provider: TeamDataProviderId | string,
  providerTeamId: string
): ProviderTeamKey {
  return `${String(provider).toLowerCase()}:${String(providerTeamId).trim()}` as ProviderTeamKey;
}

export function parseProviderTeamKey(
  key: string
): { provider: string; providerTeamId: string } | null {
  const i = key.indexOf(":");
  if (i <= 0) return null;
  const provider = key.slice(0, i).toLowerCase();
  const providerTeamId = key.slice(i + 1).trim();
  if (!provider || !providerTeamId) return null;
  return { provider, providerTeamId };
}

/** All 30 canonical franchises (static). */
export function listCanonicalTeams(): readonly CanonicalTeam[] {
  return CANONICAL_TEAMS;
}

export function getCanonicalTeamById(
  canonicalTeamId: string
): CanonicalTeam | undefined {
  return BY_CANONICAL.get(String(canonicalTeamId).trim());
}

/**
 * Map a provider-scoped team id → canonical DRBL team.
 * Never treats bare `25` as global - provider is required.
 */
export function getCanonicalTeamId(
  provider: TeamDataProviderId | string,
  providerTeamId: string
): CanonicalTeamId | null {
  const team = BY_PROVIDER.get(
    providerTeamKey(provider, providerTeamId)
  );
  return team?.canonicalTeamId ?? null;
}

export function getCanonicalTeamFromProvider(
  provider: TeamDataProviderId | string,
  providerTeamId: string
): CanonicalTeam | null {
  return (
    BY_PROVIDER.get(providerTeamKey(provider, providerTeamId)) ?? null
  );
}

/**
 * Map canonical → provider team id.
 * Returns null when the provider mapping is unknown (do not guess).
 */
export function getProviderTeamId(
  provider: TeamDataProviderId | string,
  canonicalTeamId: string
): string | null {
  const team = BY_CANONICAL.get(String(canonicalTeamId).trim());
  if (!team) return null;
  const key = String(provider).toLowerCase();
  if (key === "espn") return team.providerIds.espn ?? null;
  if (key === "bdl") return team.providerIds.bdl ?? null;
  if (key === "nba") return team.providerIds.nba ?? null;
  return null;
}

/**
 * Resolve loose UI / ASK input (ESPN id, abbr, brand id, or `provider:id`)
 * into a canonical team. Does not guess across providers for bare numerics -
 * bare short numbers are interpreted as ESPN/canonical (existing DRBL convention).
 * Bare `16106127xx` is format-inferred as `nba` only (never espn/bdl).
 */
export function resolveCanonicalTeam(
  input?: string | null
): TeamIdentityResolution {
  if (!input?.trim()) {
    return { status: "unresolved", reason: "Empty team identity" };
  }
  const raw = input.trim();
  const namespaced = parseProviderTeamKey(raw);
  if (namespaced) {
    const team = getCanonicalTeamFromProvider(
      namespaced.provider,
      namespaced.providerTeamId
    );
    if (!team) {
      return {
        status: "unresolved",
        reason: `Unknown provider team ${providerTeamKey(namespaced.provider, namespaced.providerTeamId)}`,
      };
    }
    return { status: "resolved", team };
  }

  // Unambiguous NBA Stats TEAM_ID shape - never interpret as ESPN/BDL.
  if (isNbaStatsTeamIdFormat(raw)) {
    const team = getCanonicalTeamFromProvider("nba", raw);
    if (!team) {
      return {
        status: "unresolved",
        reason: `Unknown nba team ${providerTeamKey("nba", raw)}`,
      };
    }
    return { status: "resolved", team };
  }

  const upper = raw.toUpperCase();
  if (BY_ABBR.has(upper)) {
    return { status: "resolved", team: BY_ABBR.get(upper)! };
  }

  const historicalCurrent = HISTORICAL_ABBR_ALIASES[upper];
  if (historicalCurrent && BY_ABBR.has(historicalCurrent)) {
    return { status: "resolved", team: BY_ABBR.get(historicalCurrent)! };
  }

  const lower = raw.toLowerCase();
  if (BY_BRAND_ID.has(lower)) {
    return { status: "resolved", team: BY_BRAND_ID.get(lower)! };
  }

  if (BY_CANONICAL.has(raw)) {
    return { status: "resolved", team: BY_CANONICAL.get(raw)! };
  }

  // Brand resolver covers logo slugs / aliases without inventing BDL ids.
  const brand = resolveTeamBrand(raw);
  if (brand) {
    const team = BY_CANONICAL.get(brand.espnTeamId);
    if (team) return { status: "resolved", team };
  }

  // Display name / nickname (deterministic exact match only).
  for (const team of CANONICAL_TEAMS) {
    if (team.displayName.toLowerCase() === lower) {
      return { status: "resolved", team };
    }
    const nick = NICKNAMES[team.abbr];
    if (nick && nick.toLowerCase() === lower) {
      return { status: "resolved", team };
    }
  }

  return {
    status: "unresolved",
    reason: `No canonical team for input "${raw}"`,
  };
}

/**
 * Numeric ids that mean different franchises across ESPN vs BDL.
 * Primary regression signal: `25` → ESPN OKC vs BDL POR.
 */
export function listCrossProviderNumericCollisions(): Array<{
  providerTeamId: string;
  espn: CanonicalTeam | null;
  bdl: CanonicalTeam | null;
}> {
  const espnById = new Map(
    CANONICAL_TEAMS.map((t) => [t.providerIds.espn!, t])
  );
  const bdlById = new Map(
    CANONICAL_TEAMS.filter((t) => t.providerIds.bdl).map((t) => [
      t.providerIds.bdl!,
      t,
    ])
  );
  const ids = new Set([...espnById.keys(), ...bdlById.keys()]);
  const out: Array<{
    providerTeamId: string;
    espn: CanonicalTeam | null;
    bdl: CanonicalTeam | null;
  }> = [];
  for (const id of [...ids].sort((a, b) => Number(a) - Number(b))) {
    const espn = espnById.get(id) ?? null;
    const bdl = bdlById.get(id) ?? null;
    if (!espn || !bdl) continue;
    if (espn.canonicalTeamId === bdl.canonicalTeamId) continue;
    out.push({ providerTeamId: id, espn, bdl });
  }
  return out;
}

/** Schedule-source helper: which provider owns typical historical cache rows. */
export const HISTORICAL_SCHEDULE_TEAM_PROVIDER: TeamDataProviderId = "bdl";
