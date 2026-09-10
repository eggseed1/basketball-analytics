/**
 * Bundled slim DRBL overlay for Cloudflare Workers (no node:fs).
 * Full precomputed artifacts stay on disk for local / provenance; product
 * surfaces read this compact snapshot on CF.
 *
 * Row v2: [id, name, teamId, drbl100, raw, poss, O, D, P, Ln, B, r1, war1]
 * Row v1 (legacy): [id, drbl100, raw, poss, O, D, P, Ln, B, r1, war1]
 */
import snapshot from "./drbl-overlay-snapshot.json";
import type { DrblPlayerSeasonRow } from "../../../drbl/models/player-value";

type SlimRowV2 = [
  string, // playerId (NBA)
  string, // playerName
  string, // teamId
  number | null, // drbl100
  number | null, // rawAbilityRate
  number, // possessions
  number | null, // drblO
  number | null, // drblD
  number | null, // drblP
  number | null, // drblLn
  number | null, // drblB
  number | null, // r1Points
  number | null, // r1WinEquivalents
];

type SlimRowV1 = [
  string,
  number | null,
  number | null,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

type SlimRow = SlimRowV1 | SlimRowV2;

type OverlayFile = {
  version?: number;
  generatedAt?: string;
  seasons?: Record<string, SlimRow[]>;
};

const data = snapshot as unknown as OverlayFile;
const seasons =
  data?.seasons && typeof data.seasons === "object" ? data.seasons : {};

const seasonCache = new Map<string, DrblPlayerSeasonRow[]>();

function isV2(row: SlimRow): row is SlimRowV2 {
  return typeof row[1] === "string";
}

function toDrblRow(row: SlimRow): DrblPlayerSeasonRow {
  if (isV2(row)) {
    const [
      playerId,
      playerName,
      teamId,
      drbl100,
      rawAbilityRate,
      possessions,
      drblO,
      drblD,
      drblP,
      drblLn,
      drblB,
      r1Points,
      r1WinEquivalents,
    ] = row;
    return {
      playerId,
      playerName: playerName ?? "",
      teamId: teamId ?? "",
      possessions,
      actualPossessions: possessions,
      drbl100: drbl100 ?? 0,
      rawAbilityRate: rawAbilityRate ?? Number.NaN,
      posteriorAbilityRate: rawAbilityRate ?? Number.NaN,
      fusedRateRaw: rawAbilityRate ?? Number.NaN,
      reliabilityWeight: 0,
      priorMean: 0,
      priorEquivalentPossessions: 0,
      drblP: drblP ?? 0,
      drblLn: drblLn ?? 0,
      drblB: drblB ?? 0,
      drblO: drblO ?? 0,
      drblD: drblD ?? 0,
      r1Points: r1Points ?? null,
      r1WinEquivalents: r1WinEquivalents ?? null,
    } as DrblPlayerSeasonRow;
  }

  const [
    playerId,
    drbl100,
    rawAbilityRate,
    possessions,
    drblO,
    drblD,
    drblP,
    drblLn,
    drblB,
    r1Points,
    r1WinEquivalents,
  ] = row;
  return {
    playerId,
    playerName: "",
    teamId: "",
    possessions,
    actualPossessions: possessions,
    drbl100: drbl100 ?? 0,
    rawAbilityRate: rawAbilityRate ?? Number.NaN,
    posteriorAbilityRate: rawAbilityRate ?? Number.NaN,
    fusedRateRaw: rawAbilityRate ?? Number.NaN,
    reliabilityWeight: 0,
    priorMean: 0,
    priorEquivalentPossessions: 0,
    drblP: drblP ?? 0,
    drblLn: drblLn ?? 0,
    drblB: drblB ?? 0,
    drblO: drblO ?? 0,
    drblD: drblD ?? 0,
    r1Points: r1Points ?? null,
    r1WinEquivalents: r1WinEquivalents ?? null,
  } as DrblPlayerSeasonRow;
}

export function getBundledDrblSeason(season: string): DrblPlayerSeasonRow[] {
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const rows = (seasons[key] ?? []).map(toDrblRow);
  seasonCache.set(key, rows);
  return rows;
}

export function bundledDrblOverlayMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    seasons: Object.keys(seasons),
  };
}
