import type { GmScheduleGame, GmTeam } from "@/gm/types";
import { createRng, uid } from "@/gm/engine/rng";

/** Balanced-ish 82-game schedule (each team ≈ TARGET games). */
export function generateSchedule(
  teams: GmTeam[],
  season: number,
  seed = 42,
  targetGames = 82
): GmScheduleGame[] {
  const rng = createRng(seed + season);
  const games: GmScheduleGame[] = [];
  const ids = teams.map((t) => t.id);
  const counts = Object.fromEntries(ids.map((id) => [id, 0])) as Record<
    string,
    number
  >;

  const matchups: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      matchups.push([ids[i]!, ids[j]!]);
      matchups.push([ids[j]!, ids[i]!]);
    }
  }
  shuffle(matchups, rng);

  let day = 0;
  // Synthetic calendar starting mid-October of the season start year.
  const opener = Date.UTC(season - 1, 9, 15); // Oct 15
  const dateForDay = (d: number) => {
    const ms = opener + d * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  };

  const pushGame = (home: string, away: string) => {
    games.push({
      id: uid("g"),
      season,
      day,
      gameDate: dateForDay(day),
      homeTeamId: home,
      awayTeamId: away,
      played: false,
    });
    counts[home] = (counts[home] ?? 0) + 1;
    counts[away] = (counts[away] ?? 0) + 1;
    if (games.length % 8 === 0) day += 1;
  };

  for (const [home, away] of matchups) {
    if ((counts[home] ?? 0) >= targetGames || (counts[away] ?? 0) >= targetGames)
      continue;
    pushGame(home, away);
  }

  // Pad rematches until every team hits target (or we can't pair anyone)
  let guard = 0;
  while (ids.some((id) => (counts[id] ?? 0) < targetGames) && guard < 5000) {
    guard += 1;
    const needy = ids
      .filter((id) => (counts[id] ?? 0) < targetGames)
      .sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0));
    if (needy.length < 2) break;
    const home = needy[0]!;
    const away =
      needy.find((id) => id !== home) ??
      ids[Math.floor(rng() * ids.length)]!;
    if (home === away) continue;
    pushGame(home, away);
  }

  return games;
}

function shuffle<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function maxScheduleDay(schedule: GmScheduleGame[]): number {
  return schedule.reduce((m, g) => Math.max(m, g.day), 0);
}

export function regularSeasonComplete(schedule: GmScheduleGame[]): boolean {
  return schedule.every((g) => g.played);
}
