/**
 * Convert a Basketball-Reference player page into PlayerSeason rows.
 * Used for all-era legends (pre-modern board window) addressed as bref:{slug}.
 */

import {
  fetchBrefPlayerPage,
  type BrefCountingRow,
  type BrefPlayerAdvancedRow,
} from "@/data/providers/nba/bref-player-page";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import type { PlayerSeason } from "@/data/types";

/** `bref:russebi01` → russebi01; name-shaped bref ids return null. */
export function parseBrefPlayerSlug(playerId: string): string | null {
  const raw = String(playerId ?? "").trim();
  if (!raw.toLowerCase().startsWith("bref:")) return null;
  let inner = raw.slice(raw.indexOf(":") + 1);
  try {
    inner = decodeURIComponent(inner);
  } catch {
    // keep raw
  }
  inner = inner.split("|")[0]?.split(":")[0]?.trim() ?? "";
  // BRef slugs: russebi01, chambwi01, abdulka01, …
  if (/^[a-z]{3,12}\d{2}$/i.test(inner)) return inner.toLowerCase();
  return null;
}

/**
 * `bref:michael jordan` → "Michael Jordan".
 * Slug-shaped bref ids return null (resolve the display name from the page).
 */
export function displayNameFromBrefRouteId(playerId: string): string | null {
  const raw = String(playerId ?? "").trim();
  if (!raw.toLowerCase().startsWith("bref:")) return null;
  if (parseBrefPlayerSlug(raw)) return null;
  let inner = raw.slice(raw.indexOf(":") + 1);
  try {
    inner = decodeURIComponent(inner);
  } catch {
    // keep raw
  }
  inner = (inner.split("|")[0] ?? "").trim();
  if (!inner || !/[a-z]/i.test(inner)) return null;
  return inner
    .split(/[\s_+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function pickTotalsRow(
  totals: BrefCountingRow[],
  season: string
): BrefCountingRow | null {
  const inSeason = totals.filter((r) => r.season === season);
  if (!inSeason.length) return null;
  return inSeason.find((r) => r.combined) ?? inSeason[0] ?? null;
}

function pickAdvancedRow(
  advanced: BrefPlayerAdvancedRow[],
  season: string,
  teamAbbr: string
): BrefPlayerAdvancedRow | null {
  const inSeason = advanced.filter((r) => r.season === season);
  if (!inSeason.length) return null;
  return (
    inSeason.find((r) => r.combined) ??
    inSeason.find((r) => r.teamAbbr === teamAbbr) ??
    inSeason[0] ??
    null
  );
}

/**
 * Load career counting + advanced seasons from a BRef player page slug.
 */
export async function loadCareerFromBrefSlug(
  brefSlug: string,
  routePlayerId: string
): Promise<PlayerSeason[]> {
  const page = await fetchBrefPlayerPage(brefSlug);
  const totals = page.regular.totals;
  const advanced = page.regular.advanced;
  const seasons = [
    ...new Set(totals.map((r) => r.season).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a));

  const displayName = page.bio.displayName || brefSlug;
  const rows: PlayerSeason[] = [];

  for (const season of seasons) {
    const tot = pickTotalsRow(totals, season);
    if (!tot || !(tot.gamesPlayed && tot.gamesPlayed > 0)) continue;
    const adv = pickAdvancedRow(advanced, season, tot.teamAbbr);
    const gp = tot.gamesPlayed ?? 0;
    rows.push(
      withPlayerSeasonDefaults({
        playerId: routePlayerId,
        playerName: displayName,
        teamId: tot.teamAbbr || "UNK",
        teamName: tot.teamAbbr || "Unknown",
        teamAbbreviation: tot.teamAbbr || undefined,
        teamIdProvider: "nba",
        providerTeamId: tot.teamAbbr || undefined,
        season,
        gamesPlayed: gp,
        gamesStarted: tot.gamesStarted ?? 0,
        minutes: tot.minutes ?? 0,
        points: tot.points ?? 0,
        rebounds: tot.rebounds ?? 0,
        assists: tot.assists ?? 0,
        steals: tot.steals ?? 0,
        blocks: tot.blocks ?? 0,
        turnovers: tot.turnovers ?? 0,
        fieldGoalPct: tot.fieldGoalPct ?? 0,
        threePointPct: tot.threePointPct ?? 0,
        freeThrowPct: tot.freeThrowPct ?? 0,
        effectiveFieldGoalPct: tot.effectiveFieldGoalPct ?? 0,
        per: adv?.per ?? undefined,
        trueShootingPct: adv?.trueShootingPct ?? undefined,
        usagePct: adv?.usagePct ?? undefined,
        turnoverPct: adv?.turnoverPct ?? undefined,
        assistPct: adv?.assistPct ?? undefined,
        reboundPct: adv?.reboundPct ?? undefined,
        bpm: adv?.bpm ?? undefined,
        vorp: adv?.vorp ?? undefined,
        winShares: adv?.winShares ?? undefined,
        offensiveRating: adv?.offensiveRating ?? undefined,
        defensiveRating: adv?.defensiveRating ?? undefined,
        r1Points: null,
        r1WinEquivalents: null,
      })
    );
  }

  return rows;
}
