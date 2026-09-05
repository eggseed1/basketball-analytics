/**
 * Bundled player awards for Cloudflare Workers (stats.nba playerawards is blocked).
 * Rows: [description, season] matching RawPlayerAward fields used by summarizePlayerAccolades.
 */
import snapshot from "./player-awards-snapshot.json";
import type { RawPlayerAward } from "@/data/providers/nba/player-awards";

type AwardsFile = {
  version?: number;
  generatedAt?: string;
  players?: Record<string, Array<[string, string]>>;
};

const data = snapshot as unknown as AwardsFile;
const players =
  data?.players && typeof data.players === "object" ? data.players : {};

export function getBundledPlayerAwardsRaw(
  nbaPlayerId: string
): RawPlayerAward[] {
  const key = String(nbaPlayerId ?? "").trim();
  if (!key) return [];
  const rows = players[key];
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .filter((row) => Array.isArray(row) && row[0])
    .map((row) => ({
      personId: key,
      description: String(row[0] ?? ""),
      season: row[1] != null ? String(row[1]) : null,
      team: null,
      allNbaTeamNumber: null,
    }));
}

export function hasBundledPlayerAwards(nbaPlayerId: string): boolean {
  const key = String(nbaPlayerId ?? "").trim();
  return Boolean(key && Array.isArray(players[key]) && players[key]!.length > 0);
}

export function bundledPlayerAwardsMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    playerCount: Object.keys(players).length,
  };
}
