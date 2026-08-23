/**
 * Possession Explorer team identity — cross-provider resolution.
 *
 * Root cause of the public `161` bug:
 * Game shell / MatchupWashCard keys use ESPN/canonical ids (e.g. `"2"`),
 * while DrblPossession.offenseTeamId uses NBA Stats TEAM_ID (e.g. `"1610612738"`).
 * Exact string compare failed, and a fallback `teamId.slice(0, 3)` rendered `"161"`.
 *
 * Never derive a public abbreviation by truncating a numeric id.
 */

import {
  isNbaStatsTeamIdFormat,
  resolveCanonicalTeam,
  type CanonicalTeam,
} from "@/data/identity/team-map";
import type { PossessionExplorerTeamIdentity } from "./types";

export type PossessionExplorerTeamContext = {
  home: PossessionExplorerTeamIdentity;
  away: PossessionExplorerTeamIdentity;
};

export type TeamContextBuildInput = {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeAbbreviation?: string | null;
  awayAbbreviation?: string | null;
  homeDisplayName?: string | null;
  awayDisplayName?: string | null;
  /** Extra provider ids observed in PBP / box (usually NBA Stats). */
  observedTeamIds?: string[];
};

function isNumericOnlyLabel(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function isPublicAbbreviation(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim().toUpperCase();
  if (isNumericOnlyLabel(v)) return false;
  if (isNbaStatsTeamIdFormat(v)) return false;
  return /^[A-Z]{2,4}$/.test(v);
}

function collectAliases(
  team: CanonicalTeam,
  extras: Array<string | null | undefined>
): string[] {
  const aliases = new Set<string>();
  aliases.add(team.canonicalTeamId);
  aliases.add(team.abbr.toUpperCase());
  aliases.add(team.brandId);
  if (team.providerIds.espn) aliases.add(team.providerIds.espn);
  if (team.providerIds.nba) aliases.add(team.providerIds.nba);
  if (team.providerIds.bdl) aliases.add(team.providerIds.bdl);
  for (const extra of extras) {
    if (extra?.trim()) aliases.add(extra.trim());
  }
  return [...aliases];
}

function buildSideIdentity(
  side: "home" | "away",
  inputId: string | null | undefined,
  abbrHint: string | null | undefined,
  nameHint: string | null | undefined,
  observedTeamIds: string[]
): PossessionExplorerTeamIdentity | null {
  const candidates = [
    inputId,
    abbrHint,
    ...observedTeamIds.filter((id) => {
      const resolved = resolveCanonicalTeam(id);
      if (resolved.status !== "resolved") return false;
      const inputResolved = inputId ? resolveCanonicalTeam(inputId) : null;
      const abbrResolved = abbrHint ? resolveCanonicalTeam(abbrHint) : null;
      if (inputResolved?.status === "resolved") {
        return (
          resolved.team.canonicalTeamId === inputResolved.team.canonicalTeamId
        );
      }
      if (abbrResolved?.status === "resolved") {
        return (
          resolved.team.canonicalTeamId === abbrResolved.team.canonicalTeamId
        );
      }
      return false;
    }),
  ];

  let team: CanonicalTeam | null = null;
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    const resolved = resolveCanonicalTeam(candidate);
    if (resolved.status === "resolved") {
      team = resolved.team;
      break;
    }
  }
  if (!team) return null;

  const abbreviation = isPublicAbbreviation(abbrHint)
    ? abbrHint!.trim().toUpperCase()
    : team.abbr;
  if (!isPublicAbbreviation(abbreviation)) return null;

  const nbaFromObserved =
    observedTeamIds.find((id) => {
      if (!isNbaStatsTeamIdFormat(id)) return false;
      const resolved = resolveCanonicalTeam(id);
      return (
        resolved.status === "resolved" &&
        resolved.team.canonicalTeamId === team!.canonicalTeamId
      );
    }) ?? null;

  return {
    canonicalTeamId: team.canonicalTeamId,
    nbaTeamId: team.providerIds.nba ?? nbaFromObserved,
    abbreviation,
    displayName: nameHint?.trim() || team.displayName,
    side,
    aliasIds: collectAliases(team, [
      inputId,
      abbrHint,
      nbaFromObserved,
      abbreviation,
    ]),
  };
}

/**
 * Build home/away identities from shell metadata + observed PBP team ids.
 * Returns null when either side cannot resolve to a real tricode.
 */
export function buildPossessionTeamContext(
  input: TeamContextBuildInput
): PossessionExplorerTeamContext | null {
  const observed = input.observedTeamIds ?? [];
  const home = buildSideIdentity(
    "home",
    input.homeTeamId,
    input.homeAbbreviation,
    input.homeDisplayName,
    observed
  );
  const away = buildSideIdentity(
    "away",
    input.awayTeamId,
    input.awayAbbreviation,
    input.awayDisplayName,
    observed
  );
  if (!home || !away) return null;
  if (home.canonicalTeamId === away.canonicalTeamId) return null;
  return { home, away };
}

export function resolveOffenseAgainstContext(
  offenseTeamId: string,
  teams: PossessionExplorerTeamContext
): PossessionExplorerTeamIdentity | null {
  const raw = offenseTeamId?.trim();
  if (!raw) return null;

  for (const side of [teams.home, teams.away] as const) {
    if (side.aliasIds.includes(raw)) return side;
    if (side.aliasIds.includes(raw.toUpperCase())) return side;
  }

  const resolved = resolveCanonicalTeam(raw);
  if (resolved.status === "resolved") {
    if (resolved.team.canonicalTeamId === teams.home.canonicalTeamId) {
      return teams.home;
    }
    if (resolved.team.canonicalTeamId === teams.away.canonicalTeamId) {
      return teams.away;
    }
    // Third franchise — not a valid possession for this game.
    return null;
  }

  return null;
}

/** Public abbreviation must never be a numeric fragment (the old `161` bug). */
export function isInvalidPublicTeamAbbreviation(value: string): boolean {
  return !isPublicAbbreviation(value) || value === "161";
}

/**
 * Targeted reproduction of the pre-fix fallback that produced `161`.
 * Kept for regression tests — do not use in production UI.
 */
export function legacyBrokenAbbreviationFallback(teamId: string): string {
  return teamId.slice(0, 3).toUpperCase() || "UNK";
}
