/**
 * Historical franchise legacies are derived from saved season archives.
 * This is a resume, not a hidden GOAT score: no permanent ranking, secret
 * potential, or new save field is required. Retired stars remain eligible.
 */
import type { GmSeasonArchive } from "@/gm/types";

export type GmCareerLegacy = {
  id: string;
  name: string;
  seasons: number;
  games: number;
  points: number;
  rebounds: number;
  assists: number;
  peakOverall: number;
  peakSeason: number;
  mvps: number;
  finalsMvps: number;
  championships: number;
  allNba: number;
  allNbaFirst: number;
  dpoys: number;
  legacyPoints: number;
};

const qualifyingGames = 15;

export function careerLegacyLeaders(
  history: GmSeasonArchive[] | undefined, limit = 8
): GmCareerLegacy[] {
  const players = new Map<string, GmCareerLegacy>();
  // Old imported archives may include duplicates. Count each season once.
  const years = new Map<number, GmSeasonArchive>();
  for (const year of history ?? []) years.set(year.season, year);
  for (const year of [...years.values()].sort((a, b) => a.season - b.season)) {
    for (const p of year.players) {
      const line = p.line;
      if (!line || line.gp <= 0) continue;
      const row = players.get(p.id) ?? {
        id: p.id, name: p.name, seasons: 0, games: 0, points: 0,
        rebounds: 0, assists: 0, peakOverall: 0, peakSeason: year.season,
        mvps: 0, finalsMvps: 0, championships: 0, allNba: 0,
        allNbaFirst: 0, dpoys: 0, legacyPoints: 0,
      };
      row.name = p.name;
      row.seasons += 1;
      row.games += line.gp;
      row.points += line.pts;
      row.rebounds += line.reb;
      row.assists += line.ast;
      if (p.overall > row.peakOverall) {
        row.peakOverall = p.overall;
        row.peakSeason = year.season;
      }
      if (year.champion?.teamId === p.teamId && line.gp >= qualifyingGames) {
        row.championships += 1;
      }
      if (year.champion?.finalsMvpId === p.id) row.finalsMvps += 1;
      for (const race of year.awards?.races ?? []) {
        const index = race.candidates.findIndex(candidate => candidate.id === p.id);
        if (index < 0) continue;
        if (race.id === "mvp" && index === 0) row.mvps += 1;
        if (race.id === "dpoy" && index === 0) row.dpoys += 1;
        if (race.id === "all-nba-1" || race.id === "all-nba-2" || race.id === "all-nba-3") {
          row.allNba += 1;
          if (race.id === "all-nba-1") row.allNbaFirst += 1;
        }
      }
      players.set(p.id, row);
    }
  }
  const result = [...players.values()].map(p => ({
    ...p,
    // Big seasons, longevity, awards, and championships all matter.
    // A one-year 99 cannot outrank a decade of sustained excellence.
    legacyPoints: Math.round(
      p.mvps * 70 + p.finalsMvps * 48 + p.dpoys * 25 +
      p.championships * 19 + p.allNbaFirst * 16 +
      (p.allNba - p.allNbaFirst) * 9 +
      p.seasons * 3.5 + p.points / 240 +
      p.rebounds / 600 + p.assists / 420 +
      Math.max(0, p.peakOverall - 80) * 2.5
    ),
  }));
  return result.filter(p => p.seasons >= 2)
    .sort((a, b) => b.legacyPoints - a.legacyPoints ||
      b.mvps - a.mvps || b.peakOverall - a.peakOverall || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.floor(limit)));
}
