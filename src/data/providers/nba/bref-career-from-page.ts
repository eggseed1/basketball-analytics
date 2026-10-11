/**
 * Convert a Basketball-Reference player page into PlayerSeason rows.
 * Used for all-era legends (pre-modern board window) addressed as bref:{slug}.
 */

import {
  fetchBrefPlayerPage,
  type BrefCountingRow,
  type BrefPlayerAdvancedRow,
} from "@/data/providers/nba/bref-player-page";
import { loadBundledBrefCareer } from "@/data/runtime/legend-careers-store";
import { displayNameForBrefSlug } from "@/data/runtime/legend-nba-to-bref";
import {
  findPlayerSearchRowByName,
  getPlayerSearchIndex,
} from "@/data/runtime/player-search-snapshot";
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
 * Slug-shaped bref ids prefer awards/legend display names, else null.
 */
export function displayNameFromBrefRouteId(playerId: string): string | null {
  const raw = String(playerId ?? "").trim();
  if (!raw.toLowerCase().startsWith("bref:")) return null;
  const slug = parseBrefPlayerSlug(raw);
  if (slug) {
    return (
      displayNameForBrefSlug(slug) ??
      getPlayerSearchIndex().find((row) => row.id === `bref:${slug}`)?.name ??
      null
    );
  }
  let inner = raw.slice(raw.indexOf(":") + 1);
  try {
    inner = decodeURIComponent(inner);
  } catch {
    // keep raw
  }
  const season = /(\d{4}-\d{2})$/.exec(inner)?.[1] ?? null;
  inner = (inner.split("|")[0] ?? "").trim();
  if (!inner || !/[a-z]/i.test(inner)) return null;
  // The route text has lost its punctuation ("ed obannon"); the index has it.
  const indexed = findPlayerSearchRowByName(inner, season);
  if (indexed) return indexed.name;
  return inner
    .split(/[\s_+-]+/)
    .filter(Boolean)
    .map((part) =>
      part
        .toLowerCase()
        .replace(/(^|['’])([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase())
    )
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
  const baked = await loadBundledBrefCareer(brefSlug);
  const page = baked
    ? null
    : await fetchBrefPlayerPage(brefSlug);
  const totals = baked?.totals ?? page?.regular.totals ?? [];
  const advanced = baked?.advanced ?? page?.regular.advanced ?? [];
  const seasons = [
    ...new Set(totals.map((r) => r.season).filter(Boolean)),
  ].sort((a, b) => b.localeCompare(a));

  const displayName =
    baked?.bio.displayName || page?.bio.displayName || brefSlug;
  const rows: PlayerSeason[] = [];

  for (const season of seasons) {
    const tot = pickTotalsRow(totals, season);
    if (!tot || !(tot.gamesPlayed && tot.gamesPlayed > 0)) continue;
    const adv = pickAdvancedRow(advanced, season, tot.teamAbbr);
    const gp = tot.gamesPlayed ?? 0;
    // Pre-1979-80 there was no three, so every field goal is a two.
    const fg3m = tot.threePointersMade ?? (season < "1979-80" ? 0 : null);
    const fg3a = tot.threePointersAttempted ?? (season < "1979-80" ? 0 : null);
    const fg2a =
      tot.fieldGoalsAttempted != null && fg3a != null
        ? tot.fieldGoalsAttempted - fg3a
        : null;
    const fg2m =
      tot.fieldGoalsMade != null && fg3m != null
        ? tot.fieldGoalsMade - fg3m
        : null;
    rows.push(
      withPlayerSeasonDefaults({
        playerId: routePlayerId,
        playerName: displayName,
        teamId: tot.teamAbbr || "UNK",
        teamName: tot.teamAbbr || "Unknown",
        teamAbbreviation:
          tot.league === "ABA" && tot.teamAbbr && tot.teamAbbr !== "TOT"
            ? `${tot.teamAbbr} (ABA)`
            : tot.teamAbbr || undefined,
        teamIdProvider: "nba",
        providerTeamId: tot.teamAbbr || undefined,
        season,
        gamesPlayed: gp,
        // Early seasons predate starts, steals, blocks, turnovers, and the
        // three; unpublished stays NaN (blank), not 0.
        gamesStarted: tot.gamesStarted ?? undefined,
        minutes: tot.minutes ?? undefined,
        points: tot.points ?? undefined,
        rebounds: tot.rebounds ?? undefined,
        assists: tot.assists ?? undefined,
        steals: tot.steals ?? undefined,
        blocks: tot.blocks ?? undefined,
        turnovers: tot.turnovers ?? undefined,
        fieldGoalPct: tot.fieldGoalPct ?? undefined,
        threePointPct: tot.threePointPct ?? undefined,
        freeThrowPct: tot.freeThrowPct ?? undefined,
        effectiveFieldGoalPct: tot.effectiveFieldGoalPct ?? undefined,
        age: tot.age ?? undefined,
        fieldGoalsMade: tot.fieldGoalsMade ?? undefined,
        fieldGoalsAttempted: tot.fieldGoalsAttempted ?? undefined,
        threePointersMade: tot.threePointersMade ?? undefined,
        threePointersAttempted: tot.threePointersAttempted ?? undefined,
        twoPointPct:
          fg2m != null && fg2a != null && fg2a > 0 ? fg2m / fg2a : undefined,
        freeThrowsMade: tot.freeThrowsMade ?? undefined,
        freeThrowsAttempted: tot.freeThrowsAttempted ?? undefined,
        offensiveRebounds: tot.offensiveRebounds ?? undefined,
        defensiveRebounds: tot.defensiveRebounds ?? undefined,
        personalFouls: tot.personalFouls ?? undefined,
        offensiveReboundPct: adv?.offensiveReboundPct ?? undefined,
        defensiveReboundPct: adv?.defensiveReboundPct ?? undefined,
        stealPct: adv?.stealPct ?? undefined,
        blockPct: adv?.blockPct ?? undefined,
        threePointAttemptRate: adv?.threePointAttemptRate ?? undefined,
        freeThrowRate: adv?.freeThrowRate ?? undefined,
        ows: adv?.offensiveWinShares ?? undefined,
        dws: adv?.defensiveWinShares ?? undefined,
        winSharesPer48: adv?.winSharesPer48 ?? undefined,
        obpm: adv?.offensiveBpm ?? undefined,
        dbpm: adv?.defensiveBpm ?? undefined,
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
