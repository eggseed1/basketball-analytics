/**
 * Compact local team / franchise / historical-identity search documents.
 * Does not ship a giant enriched universe — only identity fields.
 */

import {
  listFranchiseRecords,
  type TeamSeasonIdentity,
} from "@/data/identity/franchise-registry";
import { teamHistoryHref } from "@/lib/team-identity";

export type LocalTeamSearchHit = {
  id: string;
  name: string;
  kind: "team" | "franchise" | "historical_team";
  teamKey?: string;
  subtitle?: string;
  href: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesQuery(hay: string, q: string): boolean {
  const h = norm(hay);
  const nq = norm(q);
  if (!nq || !h) return false;
  if (h === nq || h.startsWith(`${nq} `) || h.endsWith(` ${nq}`)) return true;
  const tokens = h.split(" ").filter(Boolean);
  const parts = nq.split(" ").filter(Boolean);
  // Prefix tokens only — "der" must not match "thunder".
  return parts.every((part) => tokens.some((token) => token.startsWith(part)));
}

/** Public helper for filtering remote team search hits the same way. */
export function teamIdentityQueryMatches(
  fields: Array<string | null | undefined>,
  query: string
): boolean {
  const hay = fields.filter(Boolean).join(" ");
  return matchesQuery(hay, query);
}

/** Search current franchises + historical identities (explicit registry only). */
export function searchLocalTeamIdentities(
  query: string,
  limit = 12
): LocalTeamSearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const hits: LocalTeamSearchHit[] = [];
  const seen = new Set<string>();

  for (const f of listFranchiseRecords()) {
    const franchiseHay = `${f.currentDisplayName} ${f.currentAbbr} ${f.franchiseId}`;
    if (matchesQuery(franchiseHay, q)) {
      const key = `franchise:${f.franchiseId}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({
          id: f.canonicalTeamId,
          name: f.currentDisplayName,
          kind: "franchise",
          teamKey: f.currentAbbr.toLowerCase(),
          subtitle: `Franchise · ${f.currentAbbr}`,
          href: teamHistoryHref(f.canonicalTeamId),
        });
      }
      const teamKey = `team:${f.canonicalTeamId}`;
      if (!seen.has(teamKey)) {
        seen.add(teamKey);
        hits.push({
          id: f.canonicalTeamId,
          name: f.currentDisplayName,
          kind: "team",
          teamKey: f.currentAbbr.toLowerCase(),
          subtitle: f.currentAbbr,
          href: `/teams/${encodeURIComponent(f.canonicalTeamId)}`,
        });
      }
    }

    for (const id of f.identities) {
      if (!identityMatches(id, q)) continue;
      // Historical identity is first-class — not a misspelling of successor.
      const histKey = `hist:${id.teamSeasonIdentityId}`;
      if (seen.has(histKey)) continue;
      seen.add(histKey);
      hits.push({
        id: f.canonicalTeamId,
        name: id.displayName,
        kind: "historical_team",
        teamKey: id.abbreviation.toLowerCase(),
        subtitle: `${id.abbreviation} · ${id.seasonFrom}${id.seasonTo ? `–${id.seasonTo}` : "+"}`,
        href: `/teams/${encodeURIComponent(f.canonicalTeamId)}?season=${encodeURIComponent(id.seasonFrom)}&from=history`,
      });
    }
  }

  return hits.slice(0, limit);
}

function identityMatches(id: TeamSeasonIdentity, q: string): boolean {
  return matchesQuery(
    `${id.displayName} ${id.city} ${id.nickname} ${id.abbreviation}`,
    q
  );
}
