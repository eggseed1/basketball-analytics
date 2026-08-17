import type {
  GmBoxPlayerLine,
  GmBoxScore,
  GmPlayer,
  GmScheduleGame,
  GmTeam,
} from "@/gm/types";
import { createRng, clamp, uid } from "@/gm/engine/rng";

function activeRoster(teamId: string, players: GmPlayer[]): GmPlayer[] {
  return players.filter(
    (p) =>
      p.teamId === teamId &&
      (!p.injury || p.injury.gamesRemaining <= 0)
  );
}

export function lineupPlayers(team: GmTeam, players: GmPlayer[]): GmPlayer[] {
  const roster = activeRoster(team.id, players);
  const byId = new Map(roster.map((p) => [p.id, p]));
  const starters = (
    Object.values(team.starters).map((id) =>
      id ? byId.get(id) : undefined
    ) as Array<GmPlayer | undefined>
  ).filter(Boolean) as GmPlayer[];
  const starterIds = new Set(starters.map((p) => p.id));
  const bench = team.benchOrder
    .map((id) => byId.get(id))
    .filter((p): p is GmPlayer => !!p && !starterIds.has(p.id));
  const rest = roster
    .filter((p) => !starterIds.has(p.id) && !bench.some((b) => b.id === p.id))
    .sort((a, b) => b.ratings.impact - a.ratings.impact);
  return [...starters, ...bench, ...rest].slice(0, 10);
}

function teamStrength(team: GmTeam, players: GmPlayer[]) {
  const lu = lineupPlayers(team, players).slice(0, 8);
  if (!lu.length) return { off: 110, def: 112, pace: 100 };
  const coach = team.staff.headCoach;
  // Build ORtg / DRtg-like numbers (league ~112). Higher off = better;
  // higher def = worse (points allowed per 100).
  const avgOff =
    lu.reduce((s, p) => s + p.ratings.offense, 0) / lu.length;
  const avgDef =
    lu.reduce((s, p) => s + p.ratings.defense, 0) / lu.length;
  const avgPlay =
    lu.reduce((s, p) => s + p.ratings.playmaking, 0) / lu.length;
  const off = clamp(112 + avgOff * 1.15 + coach.offenseBonus, 95, 130);
  const def = clamp(112 - avgDef * 1.15 - coach.defenseBonus, 95, 130);
  // playmaking is often 15-90; keep pace in a modern NBA band.
  const pace = clamp(97 + avgPlay * 0.08 + (rngNoiseFromIds(lu) % 5), 92, 108);
  return { off, def, pace };
}

/** Tiny deterministic jitter from lineup ids so empty RNGs still vary pace. */
function rngNoiseFromIds(players: GmPlayer[]): number {
  let n = 0;
  for (const p of players) {
    for (let i = 0; i < p.id.length; i++) n = (n + p.id.charCodeAt(i) * (i + 1)) % 97;
  }
  return n;
}

export function simulateGame(
  game: GmScheduleGame,
  teams: GmTeam[],
  players: GmPlayer[],
  seed?: number
): { game: GmScheduleGame; box: GmBoxScore } {
  const rng = createRng(
    seed ??
      hashSeed(
        game.id,
        game.day,
        game.homeTeamId,
        game.awayTeamId,
        game.season
      )
  );
  const home = teams.find((t) => t.id === game.homeTeamId)!;
  const away = teams.find((t) => t.id === game.awayTeamId)!;
  const hS = teamStrength(home, players);
  const aS = teamStrength(away, players);

  // Possessions roughly track NBA pace (one team’s possessions ≈ pace).
  const possessions = clamp(
    Math.round((hS.pace + aS.pace) / 2 + (rng() - 0.5) * 8),
    88,
    110
  );

  // Expected points / 100 ≈ blend of your ORtg and opponent DRtg.
  const homeEff = (hS.off + aS.def) / 2 + 2.5; // home court
  const awayEff = (aS.off + hS.def) / 2;

  let homeScore = Math.round(possessions * (homeEff / 100) + gaussian(rng) * 9);
  let awayScore = Math.round(possessions * (awayEff / 100) + gaussian(rng) * 9);

  // Soft bounds - blowouts and grinders allowed, not a flat floor.
  homeScore = clamp(homeScore, 82, 148);
  awayScore = clamp(awayScore, 82, 148);

  // Avoid ties for standings; prefer a one-possession finish over OT machinery.
  if (homeScore === awayScore) {
    if (rng() > 0.5) homeScore += 1;
    else awayScore += 1;
  }

  const homeLines = distributeStats(
    lineupPlayers(home, players),
    homeScore,
    possessions,
    rng,
    1
  );
  const awayLines = distributeStats(
    lineupPlayers(away, players),
    awayScore,
    possessions,
    rng,
    -1
  );

  const box: GmBoxScore = {
    id: uid("box"),
    gameId: game.id,
    season: game.season,
    day: game.day,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore,
    awayScore,
    players: [...awayLines, ...homeLines],
  };

  return {
    game: {
      ...game,
      played: true,
      homeScore,
      awayScore,
      boxScoreId: box.id,
    },
    box,
  };
}

function hashSeed(
  gameId: string,
  day: number,
  homeId: string,
  awayId: string,
  season: number
): number {
  const s = `${gameId}|${day}|${homeId}|${awayId}|${season}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box-Muller-ish single sample, mean 0. */
function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function distributeStats(
  lineup: GmPlayer[],
  teamPoints: number,
  possessions: number,
  rng: () => number,
  pmSign: number
): GmBoxPlayerLine[] {
  if (!lineup.length) return [];

  const rawWeights = lineup.map((p, i) => {
    const usg =
      0.12 +
      clamp(p.ratings.impact / 20, 0, 0.12) +
      clamp(p.ratings.playmaking / 40, 0, 0.08) +
      clamp(p.ratings.finishing / 50, 0, 0.06);
    return (i < 5 ? 1.4 : 0.7) * usg * (0.9 + rng() * 0.2);
  });
  const sumW = rawWeights.reduce((a, b) => a + b, 0) || 1;

  let assignedPts = 0;
  const lines: GmBoxPlayerLine[] = lineup.map((p, i) => {
    const share = rawWeights[i]! / sumW;
    const minutes = clamp(
      (i < 5 ? 28 : 14) + p.ratings.impact * 1.2 + (rng() - 0.5) * 6,
      4,
      42
    );
    const points = Math.round(teamPoints * share * (0.85 + rng() * 0.3));
    assignedPts += points;
    const fga = Math.max(1, Math.round(points * (0.7 + rng() * 0.35)));
    const fgPct = clamp(
      0.38 + p.ratings.finishing / 80 + p.ratings.shooting / 120,
      0.3,
      0.62
    );
    const fgm = Math.min(fga, Math.round(fga * fgPct));
    const tpa = Math.round(
      fga * clamp(0.2 + p.ratings.shooting / 100, 0.1, 0.55)
    );
    const tpm = Math.min(
      tpa,
      Math.round(tpa * clamp(0.28 + p.ratings.shooting / 90, 0.2, 0.45))
    );
    const fta = Math.round(points * 0.25 * (0.7 + rng() * 0.6));
    const ftm = Math.min(
      fta,
      Math.round(fta * clamp(0.7 + p.ratings.shooting / 150, 0.55, 0.92))
    );
    const assists = Math.round(
      share *
        possessions *
        0.22 *
        (0.5 + p.ratings.playmaking / 40) *
        (0.7 + rng() * 0.6)
    );
    const rebounds = Math.round(
      (minutes / 48) * (4 + p.ratings.rebounding / 8) * (0.7 + rng() * 0.6)
    );
    const steals = Math.round(rng() * (0.3 + p.ratings.defense / 30));
    const blocks = Math.round(rng() * (0.2 + p.ratings.defense / 35));
    const turnovers = Math.round(share * 2.5 + rng() * 2);
    const tsDenom = 2 * (fga + 0.44 * fta);
    const ts = tsDenom > 0 ? points / tsDenom : 0;
    const gameScore =
      points +
      0.4 * fgm -
      0.7 * fga -
      0.4 * (fta - ftm) +
      rebounds * 0.5 +
      steals +
      0.7 * assists +
      0.7 * blocks -
      turnovers;

    return {
      playerId: p.id,
      playerName: p.name,
      teamId: p.teamId!,
      minutes: Math.round(minutes * 10) / 10,
      points,
      assists,
      rebounds,
      steals,
      blocks,
      turnovers,
      fgm,
      fga,
      tpm,
      tpa,
      ftm,
      fta,
      plusMinus: Math.round(
        pmSign * (points - teamPoints * share) * 2 + (rng() - 0.5) * 16
      ),
      trueShootingPct: ts,
      usagePct: share,
      gameScore: Math.round(gameScore * 10) / 10,
    };
  });

  const drift = teamPoints - assignedPts;
  if (lines[0]) lines[0].points = Math.max(0, lines[0].points + drift);
  return lines;
}
