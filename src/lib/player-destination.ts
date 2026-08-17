import { isCareerQualifyingSeason } from "@/analytics";
import type { PlayerSeason } from "@/data/types";

/** Resolve selected season from URL or latest career row. */
export function resolvePlayerSeason(
  career: PlayerSeason[],
  seasonParam?: string | null
): string {
  if (seasonParam) return seasonParam;
  return (
    [...new Set(career.map((row) => row.season))].sort((a, b) =>
      b.localeCompare(a)
    )[0] ?? "2024-25"
  );
}

/**
 * Primary team row for a season (max GP). Used for identity branding
 * before season-stats fetch completes.
 */
export function primaryTeamForSeason(
  career: PlayerSeason[],
  season: string
): PlayerSeason | null {
  const rows = career.filter((row) => row.season === season);
  if (!rows.length) return null;
  return rows.reduce((best, row) =>
    row.gamesPlayed > best.gamesPlayed ? row : best
  );
}

/** Merge season raw + career + peer overlays (USG / impact). */
export function mergePlayerSeasonStats(
  seasonRaw: PlayerSeason | null,
  careerSeason: PlayerSeason | null | undefined,
  peerRow: PlayerSeason | null | undefined
): PlayerSeason | null {
  if (seasonRaw) {
    return {
      ...seasonRaw,
      usagePct:
        seasonRaw.usagePct != null && seasonRaw.usagePct > 0
          ? seasonRaw.usagePct
          : peerRow?.usagePct != null && peerRow.usagePct > 0
            ? peerRow.usagePct
            : careerSeason?.usagePct != null && careerSeason.usagePct > 0
              ? careerSeason.usagePct
              : undefined,
      darkoDpm:
        seasonRaw.darkoDpm ?? careerSeason?.darkoDpm ?? peerRow?.darkoDpm,
      darkoOff:
        seasonRaw.darkoOff ?? careerSeason?.darkoOff ?? peerRow?.darkoOff,
      darkoDef:
        seasonRaw.darkoDef ?? careerSeason?.darkoDef ?? peerRow?.darkoDef,
      lebron: seasonRaw.lebron ?? careerSeason?.lebron ?? peerRow?.lebron,
      oLebron:
        seasonRaw.oLebron ?? careerSeason?.oLebron ?? peerRow?.oLebron,
      dLebron:
        seasonRaw.dLebron ?? careerSeason?.dLebron ?? peerRow?.dLebron,
      winsAdded:
        seasonRaw.winsAdded ??
        careerSeason?.winsAdded ??
        peerRow?.winsAdded,
    };
  }
  return peerRow ?? careerSeason ?? null;
}

/** Mean PPG / TS / USG over resume-qualifying seasons only. */
export function careerSeasonAverages(career: PlayerSeason[]): {
  ppg: number;
  ts: number | null;
  usg: number | null;
} | null {
  const rows = career.filter(isCareerQualifyingSeason);
  if (!rows.length) return null;
  let ppg = 0;
  let tsSum = 0;
  let tsN = 0;
  let usgSum = 0;
  let usgN = 0;
  for (const r of rows) {
    ppg += r.points / Math.max(1, r.gamesPlayed);
    if (
      r.trueShootingPct != null &&
      Number.isFinite(r.trueShootingPct) &&
      r.trueShootingPct > 0
    ) {
      tsSum += r.trueShootingPct;
      tsN += 1;
    }
    if (r.usagePct != null && Number.isFinite(r.usagePct) && r.usagePct > 0) {
      usgSum += r.usagePct;
      usgN += 1;
    }
  }
  return {
    ppg: ppg / rows.length,
    ts: tsN > 0 ? tsSum / tsN : null,
    usg: usgN > 0 ? usgSum / usgN : null,
  };
}

/** Primary team id per season (max GP) for timeline / chart theming. */
export function buildSeasonTeamsMap(
  career: PlayerSeason[]
): Record<string, string> {
  const seasonTeams: Record<string, string> = {};
  for (const row of career) {
    const existing = seasonTeams[row.season];
    if (!existing) {
      seasonTeams[row.season] = row.teamId;
      continue;
    }
    const existingRow = career.find(
      (r) => r.season === row.season && r.teamId === existing
    );
    if (!existingRow || row.gamesPlayed > existingRow.gamesPlayed) {
      seasonTeams[row.season] = row.teamId;
    }
  }
  return seasonTeams;
}

/** Season chip href — preserves Time Machine arrival when present. */
export function playerSeasonChipHref(
  playerId: string,
  season: string,
  opts?: {
    fromHistory?: boolean;
    themeMode?: "historical" | "modern";
  }
): string {
  const q = new URLSearchParams();
  q.set("season", season);
  if (opts?.fromHistory) {
    q.set("from", "history");
    if (opts.themeMode === "modern") q.set("theme", "modern");
    else q.set("theme", "historical");
  }
  return `/players/${encodeURIComponent(playerId)}?${q.toString()}`;
}
