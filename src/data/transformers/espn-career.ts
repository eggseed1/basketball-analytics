import type { Player, PlayerSeason, Position } from "@/data/types";
import {
  effectiveFieldGoalPct,
  trueShootingPct,
} from "@/data/providers/nba/compute-advanced";
import { canonicalSeasonFromEspnYear } from "@/data/providers/nba/season";
import { mapEspnPosition } from "@/data/transformers/espn";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";

export interface EspnCareerTeamMeta {
  id: string;
  displayName?: string;
  abbreviation?: string;
  location?: string;
  name?: string;
}

export interface EspnCareerSeasonRef {
  year: number;
  displayName?: string;
}

export interface EspnCareerStatRow {
  teamId?: string;
  teamSlug?: string;
  season: EspnCareerSeasonRef;
  stats: string[];
  position?: string;
}

export interface EspnCareerCategory {
  name: string;
  displayName?: string;
  names?: string[];
  labels?: string[];
  statistics?: EspnCareerStatRow[];
}

export interface EspnAthleteCareerStatsResponse {
  teams?: Record<string, EspnCareerTeamMeta>;
  categories?: EspnCareerCategory[];
}

export interface EspnAthleteProfileResponse {
  athlete?: {
    id?: string | number;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    age?: number;
    debutYear?: number;
    jersey?: string;
    displayJersey?: string;
    displayDOB?: string;
    displayBirthPlace?: string;
    displayHeight?: string;
    displayWeight?: string;
    displayDraft?: string;
    displayExperience?: string;
    height?: number;
    weight?: number;
    position?: { abbreviation?: string };
    team?: { id?: string | number };
    college?: { name?: string; shortName?: string };
  };
}

/**
 * Transform ESPN `/athletes/{id}/stats` career table into canonical
 * PlayerSeason rows (one per player-team-season).
 */
export function transformEspnAthleteCareerStats(
  playerId: string,
  playerName: string,
  payload: EspnAthleteCareerStatsResponse
): PlayerSeason[] {
  const averages = payload.categories?.find((c) => c.name === "averages");
  const totals = payload.categories?.find((c) => c.name === "totals");
  if (!averages?.statistics?.length && !totals?.statistics?.length) {
    return [];
  }

  const avgNames = averages?.names ?? [];
  const totNames = totals?.names ?? [];
  const teams = payload.teams ?? {};

  const avgByKey = new Map<string, Map<string, number>>();
  for (const row of averages?.statistics ?? []) {
    avgByKey.set(rowKey(row), zipStats(avgNames, row.stats));
  }

  const sourceRows =
    totals?.statistics?.length ? totals.statistics : averages?.statistics ?? [];

  const out: PlayerSeason[] = [];

  for (const row of sourceRows) {
    const key = rowKey(row);
    const tot = zipStats(totNames, row.stats);
    const avg = avgByKey.get(key) ?? zipStats(avgNames, row.stats);

    const gamesPlayed = firstNumber(avg, ["gamesPlayed"]) || 0;
    const avgMinutes = firstNumber(avg, ["avgMinutes"]);
    const minutes =
      avgMinutes > 0 && gamesPlayed > 0
        ? avgMinutes * gamesPlayed
        : firstNumber(avg, ["minutes"]);

    const points =
      firstNumber(tot, ["points"]) ||
      firstNumber(avg, ["avgPoints"]) * gamesPlayed;
    const assists =
      firstNumber(tot, ["assists"]) ||
      firstNumber(avg, ["avgAssists"]) * gamesPlayed;
    const rebounds =
      firstNumber(tot, ["totalRebounds", "rebounds"]) ||
      firstNumber(avg, ["avgRebounds"]) * gamesPlayed;
    const steals =
      firstNumber(tot, ["steals"]) ||
      firstNumber(avg, ["avgSteals"]) * gamesPlayed;
    const blocks =
      firstNumber(tot, ["blocks"]) ||
      firstNumber(avg, ["avgBlocks"]) * gamesPlayed;
    const turnovers =
      firstNumber(tot, ["turnovers"]) ||
      firstNumber(avg, ["avgTurnovers"]) * gamesPlayed;

    const [fgm, fga] = pairFromMaps(tot, avg, [
      "fieldGoalsMade-fieldGoalsAttempted",
      "avgFieldGoalsMade-avgFieldGoalsAttempted",
    ], gamesPlayed);
    const [tpm, tpa] = pairFromMaps(tot, avg, [
      "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
      "avgThreePointFieldGoalsMade-avgThreePointFieldGoalsAttempted",
    ], gamesPlayed);
    const [ftm, fta] = pairFromMaps(tot, avg, [
      "freeThrowsMade-freeThrowsAttempted",
      "avgFreeThrowsMade-avgFreeThrowsAttempted",
    ], gamesPlayed);

    const fieldGoalPct = pctToFraction(
      firstNumber(tot, ["fieldGoalPct"]) ||
        firstNumber(avg, ["fieldGoalPct"]) ||
        (fga > 0 ? fgm / fga : 0)
    );
    const threePointPct = pctToFraction(
      firstNumber(tot, ["threePointFieldGoalPct", "threePointPct"]) ||
        firstNumber(avg, ["threePointFieldGoalPct", "threePointPct"]) ||
        (tpa > 0 ? tpm / tpa : 0)
    );
    const freeThrowPct = pctToFraction(
      firstNumber(tot, ["freeThrowPct"]) ||
        firstNumber(avg, ["freeThrowPct"]) ||
        (fta > 0 ? ftm / fta : 0)
    );

    const teamMeta =
      (row.teamSlug && teams[row.teamSlug]) ||
      Object.values(teams).find((t) => t.id === String(row.teamId));

    const season = canonicalSeasonFromEspnYear(row.season.year);
    const possessions = fga + 0.44 * fta + turnovers;
    const offensiveRating =
      possessions > 0 ? (points / possessions) * 100 : undefined;
    const ts = trueShootingPct(points, fga, fta);
    const efg = effectiveFieldGoalPct(fgm, tpm, fga);

    out.push(
      withPlayerSeasonDefaults({
        playerId,
        playerName,
        teamId: String(row.teamId ?? teamMeta?.id ?? ""),
        teamName:
          teamMeta?.displayName ||
          [teamMeta?.location, teamMeta?.name].filter(Boolean).join(" ") ||
          "Unknown",
        season,
        position: mapEspnPosition(row.position) as Position | undefined,
        gamesPlayed,
        minutes,
        points,
        assists,
        rebounds,
        steals,
        blocks,
        turnovers,
        fieldGoalPct,
        threePointPct,
        freeThrowPct,
        ...(ts != null ? { trueShootingPct: ts } : {}),
        ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
        // Career ESPN totals lack team possessions — do not invent USG%=0.
        ...(offensiveRating != null ? { offensiveRating } : {}),
        // Career ESPN totals do not include individual DRtg/NET.
      })
    );
  }

  return out.sort((a, b) => b.season.localeCompare(a.season));
}

export function transformEspnAthleteProfile(
  payload: EspnAthleteProfileResponse,
  fallbackId: string
): Player | null {
  const raw = payload.athlete;
  if (!raw?.displayName && !raw?.id) return null;
  const fullName = raw.displayName ?? fallbackId;
  const jersey =
    raw.jersey?.replace(/^#/, "").trim() ||
    raw.displayJersey?.replace(/^#/, "").trim() ||
    undefined;

  return {
    id: String(raw.id ?? fallbackId),
    fullName,
    firstName: raw.firstName ?? fullName.split(" ")[0] ?? fullName,
    lastName:
      raw.lastName ?? fullName.split(" ").slice(1).join(" ") ?? fullName,
    position: mapEspnPosition(raw.position?.abbreviation),
    currentTeamId: raw.team?.id != null ? String(raw.team.id) : undefined,
    birthDate: parseEspnDisplayDob(raw.displayDOB),
    birthPlace: raw.displayBirthPlace?.trim() || undefined,
    heightInches: parseEspnHeight(raw.displayHeight, raw.height),
    weightLbs: parseEspnWeight(raw.displayWeight, raw.weight),
    jersey: jersey || undefined,
    college: raw.college?.name?.trim() || raw.college?.shortName?.trim() || undefined,
    draftInfo: raw.displayDraft?.trim() || undefined,
    experience: raw.displayExperience?.trim() || undefined,
    age: typeof raw.age === "number" && raw.age > 0 ? raw.age : undefined,
    debutYear:
      typeof raw.debutYear === "number" && raw.debutYear > 1900
        ? raw.debutYear
        : undefined,
  };
}

/** ESPN displayDOB is typically D/M/YYYY (e.g. "28/2/1999"). */
function parseEspnDisplayDob(display?: string): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display?.trim() ?? "");
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseEspnHeight(
  display?: string,
  inches?: number
): number | undefined {
  if (typeof inches === "number" && inches > 40 && inches < 100) {
    return Math.round(inches);
  }
  const m = /(\d+)\s*'\s*(\d+)/.exec(display ?? "");
  if (!m) return undefined;
  return Number(m[1]) * 12 + Number(m[2]);
}

function parseEspnWeight(
  display?: string,
  lbs?: number
): number | undefined {
  if (typeof lbs === "number" && lbs > 100 && lbs < 500) {
    return Math.round(lbs);
  }
  const m = /(\d{2,3})/.exec(display ?? "");
  return m ? Number(m[1]) : undefined;
}

/** Build a season totals row by summing a game log (fallback path). */
export function aggregatePlayerSeasonFromGames(
  games: import("@/data/types").PlayerGame[],
  playerName: string,
  teamName = "Unknown"
): PlayerSeason | null {
  if (!games.length) return null;
  const season = games[0].season;
  const playerId = games[0].playerId;
  const teamId = games[0].teamId;

  let minutes = 0;
  let points = 0;
  let assists = 0;
  let rebounds = 0;
  let steals = 0;
  let blocks = 0;
  let turnovers = 0;
  let fgm = 0;
  let fga = 0;
  let tpm = 0;
  let tpa = 0;
  let ftm = 0;
  let fta = 0;

  for (const g of games) {
    minutes += g.minutes;
    points += g.points;
    assists += g.assists;
    rebounds += g.rebounds;
    steals += g.steals;
    blocks += g.blocks;
    turnovers += g.turnovers;
    fgm += g.fieldGoalsMade;
    fga += g.fieldGoalsAttempted;
    tpm += g.threePointersMade;
    tpa += g.threePointersAttempted;
    ftm += g.freeThrowsMade;
    fta += g.freeThrowsAttempted;
  }

  const possessions = fga + 0.44 * fta + turnovers;
  const offensiveRating =
    possessions > 0 ? (points / possessions) * 100 : undefined;
  const ts = trueShootingPct(points, fga, fta);
  const efg = effectiveFieldGoalPct(fgm, tpm, fga);

  return withPlayerSeasonDefaults({
    playerId,
    playerName,
    teamId,
    teamName,
    season,
    gamesPlayed: games.length,
    minutes,
    points,
    assists,
    rebounds,
    steals,
    blocks,
    turnovers,
    fieldGoalPct: fga > 0 ? fgm / fga : 0,
    threePointPct: tpa > 0 ? tpm / tpa : 0,
    freeThrowPct: fta > 0 ? ftm / fta : 0,
    ...(ts != null ? { trueShootingPct: ts } : {}),
    ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
    ...(offensiveRating != null ? { offensiveRating } : {}),
  });
}

function rowKey(row: EspnCareerStatRow): string {
  return `${row.season.year}:${row.teamId ?? row.teamSlug ?? ""}`;
}

function zipStats(names: string[], values: string[]): Map<string, number> {
  const map = new Map<string, number>();
  names.forEach((name, index) => {
    const raw = values[index] ?? "";
    if (raw.includes("-") && name.includes("-")) {
      const [made, attempted] = raw.split("-").map((part) => Number(part) || 0);
      const [madeKey, attemptedKey] = name.split("-");
      map.set(madeKey, made);
      map.set(attemptedKey, attempted);
      map.set(name, made); // also keep pair name pointing at made for pairFromMaps
      map.set(`${name}__attempted`, attempted);
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) map.set(name, n);
    }
  });
  return map;
}

function firstNumber(map: Map<string, number>, keys: string[]): number {
  for (const key of keys) {
    const value = map.get(key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function pairFromMaps(
  tot: Map<string, number>,
  avg: Map<string, number>,
  pairKeys: string[],
  gamesPlayed: number
): [number, number] {
  for (const key of pairKeys) {
    for (const map of [tot, avg]) {
      if (!map.has(key.split("-")[0]) && !map.has(key)) continue;
      const [madeKey, attemptedKey] = key.split("-");
      let made = map.get(madeKey);
      let attempted = map.get(attemptedKey);
      if (made == null && map.has(key)) {
        made = map.get(key);
        attempted = map.get(`${key}__attempted`);
      }
      if (made == null || attempted == null) continue;
      // Average pairs need scaling to season totals.
      if (key.startsWith("avg") && gamesPlayed > 0) {
        return [made * gamesPlayed, attempted * gamesPlayed];
      }
      return [made, attempted];
    }
  }
  return [0, 0];
}

function pctToFraction(value: number): number {
  if (value > 1) return value / 100;
  return value;
}
