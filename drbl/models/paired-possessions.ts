/**
 * DIAGNOSTIC utility: count offensive/defensive on-court team possessions
 * from normalized possession files (M16e1).
 *
 * pairedPossessions = average(off, def) — canonical paired exposure.
 * Note: average(off,def) ≡ (off+def)/2 ≡ N_combined/2 algebraically;
 * we still count off/def separately to measure balance and document method.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface PlayerPairedPossessions {
  playerId: string;
  offensiveTeamPossessionsOnCourt: number;
  defensiveTeamPossessionsOnCourt: number;
  /** average(off, def) */
  pairedPossessions: number;
  /** off + def */
  combinedPossessionAppearances: number;
  pairedExposureMethod: typeof PAIRED_EXPOSURE_METHOD;
  uniquePossessionIdsOnCourt: number;
}

export const PAIRED_EXPOSURE_METHOD =
  "average_offensive_and_defensive_team_possessions_on_court" as const;

type PossRow = {
  possessionId?: string;
  offensePlayerIds?: string[];
  defensePlayerIds?: string[];
};

export async function calculateSeasonPlayerPairedPossessions(
  season: string,
  root = process.cwd()
): Promise<Map<string, PlayerPairedPossessions>> {
  const dir = path.join(root, "data", "drbl", "normalized", season);
  const games = (await readdir(dir)).filter((g) => !g.startsWith("."));
  const off = new Map<string, number>();
  const def = new Map<string, number>();
  const uniq = new Map<string, Set<string>>();

  const bump = (m: Map<string, number>, id: string) =>
    m.set(id, (m.get(id) ?? 0) + 1);
  const bumpUniq = (id: string, possId: string) => {
    let s = uniq.get(id);
    if (!s) {
      s = new Set();
      uniq.set(id, s);
    }
    s.add(possId);
  };

  for (const gameId of games) {
    const fp = path.join(dir, gameId, "possessions.json");
    let raw: string;
    try {
      raw = await readFile(fp, "utf8");
    } catch {
      continue;
    }
    let rows: PossRow[];
    try {
      rows = JSON.parse(raw) as PossRow[];
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const pid = row.possessionId ?? `${gameId}-anon`;
      for (const id of row.offensePlayerIds ?? []) {
        if (!id) continue;
        bump(off, id);
        bumpUniq(id, pid);
      }
      for (const id of row.defensePlayerIds ?? []) {
        if (!id) continue;
        bump(def, id);
        bumpUniq(id, pid);
      }
    }
  }

  const ids = new Set([...off.keys(), ...def.keys()]);
  const out = new Map<string, PlayerPairedPossessions>();
  for (const playerId of ids) {
    const o = off.get(playerId) ?? 0;
    const d = def.get(playerId) ?? 0;
    const combined = o + d;
    const paired = (o + d) / 2;
    out.set(playerId, {
      playerId,
      offensiveTeamPossessionsOnCourt: o,
      defensiveTeamPossessionsOnCourt: d,
      pairedPossessions: paired,
      combinedPossessionAppearances: combined,
      pairedExposureMethod: PAIRED_EXPOSURE_METHOD,
      uniquePossessionIdsOnCourt: uniq.get(playerId)?.size ?? 0,
    });
  }
  return out;
}

export function calculatePlayerPairedPossessions(
  map: Map<string, PlayerPairedPossessions>,
  playerId: string
): PlayerPairedPossessions | null {
  return map.get(playerId) ?? null;
}
