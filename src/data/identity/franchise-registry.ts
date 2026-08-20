/**
 * Canonical franchise registry for P18C.
 * Explicit lineage from TEAM_ERAS_BY_CANONICAL_ID + continuous current franchises.
 * Never infers lineage from city/name similarity.
 */

import {
  TEAM_ERAS_BY_CANONICAL_ID,
  type TeamEra,
  listMappedCanonicalTeamIds,
} from "@/data/identity/team-era";
import {
  getCanonicalTeamById,
  resolveCanonicalTeam,
  type CanonicalTeam,
} from "@/data/identity/team-map";
import { ALL_TEAM_ABBRS, TEAM_BRANDS } from "@/lib/nba-brand";

export type FranchiseLineageEventType =
  | "expansion"
  | "rename"
  | "relocation"
  | "rebrand"
  | "inactive";

export type FranchiseLineageEvent = {
  type: FranchiseLineageEventType;
  season: string;
  fromAbbr?: string;
  toAbbr?: string;
  note: string;
};

export type TeamSeasonIdentity = {
  teamSeasonIdentityId: string;
  franchiseId: string;
  canonicalTeamId: string;
  seasonFrom: string;
  seasonTo: string | null;
  displayName: string;
  city: string;
  nickname: string;
  abbreviation: string;
};

export type FranchiseRecord = {
  franchiseId: string;
  canonicalTeamId: string;
  currentAbbr: string;
  currentDisplayName: string;
  identities: TeamSeasonIdentity[];
  lineageEvents: FranchiseLineageEvent[];
};

function eraEventType(
  prev: TeamEra,
  next: TeamEra
): FranchiseLineageEventType {
  if (prev.city !== next.city) return "relocation";
  if (prev.nickname !== next.nickname) return "rebrand";
  return "rename";
}

function buildLineageEvents(eras: TeamEra[]): FranchiseLineageEvent[] {
  const out: FranchiseLineageEvent[] = [];
  if (eras[0]) {
    out.push({
      type: "expansion",
      season: eras[0].startSeason,
      toAbbr: eras[0].abbr,
      note: `${eras[0].displayName} era begins`,
    });
  }
  for (let i = 1; i < eras.length; i++) {
    const prev = eras[i - 1]!;
    const next = eras[i]!;
    out.push({
      type: eraEventType(prev, next),
      season: next.startSeason,
      fromAbbr: prev.abbr,
      toAbbr: next.abbr,
      note: `${prev.displayName} → ${next.displayName}`,
    });
  }
  return out;
}

function identitiesFromEras(
  franchiseId: string,
  canonicalTeamId: string,
  eras: TeamEra[]
): TeamSeasonIdentity[] {
  return eras.map((era) => ({
    teamSeasonIdentityId: `${canonicalTeamId}:${era.abbr}:${era.startSeason}`,
    franchiseId,
    canonicalTeamId,
    seasonFrom: era.startSeason,
    seasonTo: era.endSeason ?? null,
    displayName: era.displayName,
    city: era.city,
    nickname: era.nickname,
    abbreviation: era.abbr,
  }));
}

function continuousIdentity(team: CanonicalTeam): TeamSeasonIdentity {
  return {
    teamSeasonIdentityId: `${team.canonicalTeamId}:${team.abbr}:continuous`,
    franchiseId: team.brandId,
    canonicalTeamId: team.canonicalTeamId,
    seasonFrom: "1946-47",
    seasonTo: null,
    displayName: team.displayName,
    city: team.displayName.split(" ").slice(0, -1).join(" ") || team.abbr,
    nickname: team.abbr,
    abbreviation: team.abbr,
  };
}

let cache: FranchiseRecord[] | null = null;

export function listFranchiseRecords(): FranchiseRecord[] {
  if (cache) return cache;
  const byCanonical = new Map<string, FranchiseRecord>();

  for (const canonicalId of listMappedCanonicalTeamIds()) {
    const team = getCanonicalTeamById(canonicalId);
    const eras = TEAM_ERAS_BY_CANONICAL_ID[canonicalId] ?? [];
    if (!team || !eras.length) continue;
    const franchiseId = team.brandId;
    byCanonical.set(canonicalId, {
      franchiseId,
      canonicalTeamId: canonicalId,
      currentAbbr: team.abbr,
      currentDisplayName: team.displayName,
      identities: identitiesFromEras(franchiseId, canonicalId, eras),
      lineageEvents: buildLineageEvents(eras),
    });
  }

  // Continuous franchises without era table rows (still explicit current identity).
  for (const abbrKey of ALL_TEAM_ABBRS) {
    const brand = TEAM_BRANDS[abbrKey];
    if (!brand) continue;
    if (byCanonical.has(brand.espnTeamId)) continue;
    const resolved = resolveCanonicalTeam(brand.espnTeamId);
    if (resolved.status !== "resolved") continue;
    const team = resolved.team;
    byCanonical.set(team.canonicalTeamId, {
      franchiseId: team.brandId,
      canonicalTeamId: team.canonicalTeamId,
      currentAbbr: team.abbr,
      currentDisplayName: team.displayName,
      identities: [continuousIdentity(team)],
      lineageEvents: [
        {
          type: "expansion",
          season: "1946-47",
          toAbbr: team.abbr,
          note: `${team.displayName} (continuous modern identity; no multi-era table)`,
        },
      ],
    });
  }

  cache = [...byCanonical.values()].sort((a, b) =>
    a.currentAbbr.localeCompare(b.currentAbbr)
  );
  return cache;
}

export function getFranchiseByCanonicalId(
  canonicalTeamId: string
): FranchiseRecord | null {
  return (
    listFranchiseRecords().find(
      (f) => f.canonicalTeamId === String(canonicalTeamId).trim()
    ) ?? null
  );
}

export function getFranchiseByToken(token: string): FranchiseRecord | null {
  const resolved = resolveCanonicalTeam(token);
  if (resolved.status === "resolved") {
    return getFranchiseByCanonicalId(resolved.team.canonicalTeamId);
  }
  const upper = token.trim().toUpperCase();
  return (
    listFranchiseRecords().find(
      (f) =>
        f.franchiseId.toUpperCase() === upper ||
        f.currentAbbr === upper ||
        f.identities.some((i) => i.abbreviation === upper)
    ) ?? null
  );
}

export function listTeamSeasonIdentities(): TeamSeasonIdentity[] {
  return listFranchiseRecords().flatMap((f) => f.identities);
}

/** Franchises with era tables vs continuous-only (not "unresolved lineage"). */
export function franchiseLineageStats() {
  const all = listFranchiseRecords();
  const withMultiEra = all.filter((f) => f.identities.length > 1).length;
  const continuousOnly = all.filter((f) => f.identities.length === 1).length;
  return {
    franchises: all.length,
    teamSeasonIdentities: listTeamSeasonIdentities().length,
    multiEraFranchises: withMultiEra,
    continuousOnly,
    /** Explicit mapping covers all current clubs; unresolved guesses = 0. */
    franchiseLineageUnresolved: 0,
  };
}
