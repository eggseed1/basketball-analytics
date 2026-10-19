import type {
  GmBoxPlayerLine,
  GmBoxScore,
  GmPlayer,
  GmScheduleGame,
  GmTeam,
} from "@/gm/types";
import { createRng, clamp, uid } from "@/gm/engine/rng";
import {
  freeThrowMakeRateFromRating,
  threeMakeRateFromRating,
  twoMakeRateFromRating,
} from "@/gm/engine/attributes";
import {
  extraAst,
  extraFt,
  modsForTeam,
  paceWish,
  paintShifts,
  usageBoost,
  type RateMods,
} from "@/gm/engine/coaching";
import { overallOf, positionalMinuteTargets, rotationTarget } from "@/gm/engine/lineup";
import { allStarSquadTeam } from "@/gm/engine/allstar";
import { coachEffect } from "@/gm/engine/staff";
import { gapBefore } from "@/gm/engine/schedule";


function activeRoster(teamId: string, players: GmPlayer[]): GmPlayer[] {
  return players.filter(
    (p) =>
      p.teamId === teamId &&
      (!p.injury || p.injury.gamesRemaining <= 0)
  );
}

export function lineupPlayers(
  team: GmTeam,
  players: GmPlayer[],
  max = 10
): GmPlayer[] {
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
    .sort((a, b) => overallOf(b) - overallOf(a));
  return [...starters, ...bench, ...rest].slice(0, max);
}

/**
 * Who dresses tonight. Healthy starters are in. Everyone else follows the
 * rotation target, overall first. A short real-season sample does not sit a star.
 * Only the end of the bench misses a night.
 */
function dressTonight(team: GmTeam, players: GmPlayer[], rng: () => number): GmPlayer[] {
  const roster = activeRoster(team.id, players);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const targets = positionalMinuteTargets(roster, team.starters);
  const depth = [...roster].sort(
    (a, b) =>
      (targets[b.id] ?? 0) - (targets[a.id] ?? 0) ||
      rotationTarget(b) - rotationTarget(a) ||
      overallOf(b) - overallOf(a)
  );
  const dressed: GmPlayer[] = [];
  const used = new Set<string>();
  const take = (player: GmPlayer) => {
    if (used.has(player.id)) return;
    dressed.push(player);
    used.add(player.id);
  };
  for (const id of Object.values(team.starters)) {
    if (!id) continue;
    const starter = byId.get(id);
    if (starter) take(starter);
  }
  for (const player of depth) {
    if (dressed.length >= 10) break;
    const booked = dressed.reduce((sum, entry) => sum + (targets[entry.id] ?? rotationTarget(entry)), 0);
    if (booked >= 232 && dressed.length >= 8) break;
    if (!used.has(player.id) && dressed.length >= 8 && (targets[player.id] ?? 0) < 12 && rng() > 0.62) {
      continue;
    }
    take(player);
  }
  if (dressed.length < 8) {
    for (const player of depth) {
      if (dressed.length >= 8) break;
      take(player);
    }
  }
  return dressed;
}

/** The user's saved minute plan. Injuries still sit. Availability rolls do not. */
function dressFromPlan(team: GmTeam, players: GmPlayer[]): GmPlayer[] {
  const plan = team.coaching?.minutes;
  if (!plan) return [];
  const roster = activeRoster(team.id, players);
  const dressed = roster
    .filter((player) => (plan[player.id] ?? 0) >= 1)
    .sort((a, b) => (plan[b.id] ?? 0) - (plan[a.id] ?? 0));
  return dressed.length >= 5 ? dressed : [];
}

function finiteMean(values: number[], fallback: number): number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return fallback;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function teamStrength(team: GmTeam, players: GmPlayer[]) {
  const lu = lineupPlayers(team, players).slice(0, 8);
  if (!lu.length) return { off: 110, def: 112, pace: 100 };
  const coach = coachEffect(team);
  // Build ORtg / DRtg-like numbers (league ~112). Higher off = better;
  // higher def = worse (points allowed per 100).
  const avgOff = finiteMean(lu.map((player) => player.ratings.offense), 0);
  const avgDef = finiteMean(lu.map((player) => player.ratings.defense), 0);
  const avgPlay = finiteMean(lu.map((player) => player.ratings.playmaking), 48);
  const off = clamp(112 + avgOff * 1.15 + coach.offense, 95, 130);
  const def = clamp(112 - avgDef * 1.15 - coach.defense, 95, 130);
  const pace = clamp(99.2 + (avgPlay - 48) * 0.04, 96.5, 102.5);
  return { off, def, pace };
}

/**
 * Lineup value in points per 100. Ratings are per player, so a starter's
 * number is weighted by the minutes he is about to play.
 */
function possessionValue(players: GmPlayer[], key: "offense" | "defense"): number {
  let sum = 0;
  let minutes = 0;
  const targets = positionalMinuteTargets(players);
  for (const player of players) {
    const rating = player.ratings[key];
    const weight = Math.max(0, targets[player.id] ?? rotationTarget(player));
    if (!Number.isFinite(rating) || weight <= 0) continue;
    sum += rating * weight;
    minutes += weight;
  }
  if (minutes <= 0) return 0;
  // Five players share the floor, so the lineup is the minute-weighted average times five.
  return (sum / minutes) * 5;
}

/** Second night of a back-to-back. Older legs lose more makes. A night off is even. */
export function secondNightScale(age: number, gapDays: number | null): number {
  if (gapDays !== 1) return 1;
  if (age >= 34) return 0.974;
  if (age >= 30) return 0.986;
  return 0.994;
}

/** Move the shot volume so the box adds up to the matchup, and keep each player's percentages. */
function fitScore(lines: GmBoxPlayerLine[], target: number) {
  if (!lines.length || !(target > 0)) return;
  const raw = lines.reduce((sum, line) => sum + line.points, 0);
  if (raw < 1) return;
  const scale = clamp(target / raw, 0.72, 1.28);
  const top = Math.max(...lines.map((line) => line.points), 1);
  const give = lines.map((line) => 1.45 - 0.75 * (line.points / top));
  const weight = lines.reduce((sum, line, index) => sum + line.points * give[index]!, 0) / raw;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const factor = clamp(1 + (scale - 1) * (give[index]! / weight), 0.6, 1.4);
    line.fga = clamp(Math.round(line.fga * factor), 0, 40);
    line.tpa = clamp(Math.round(line.tpa * factor), 0, line.fga);
    line.fta = clamp(Math.round(line.fta * factor), 0, 25);
    line.fgm = clamp(Math.round(line.fgm * factor), 0, line.fga);
    line.tpm = clamp(Math.round(line.tpm * factor), 0, Math.min(line.tpa, line.fgm));
    line.ftm = clamp(Math.round(line.ftm * factor), 0, line.fta);
    line.points = 2 * line.fgm + line.tpm + line.ftm;
    line.assists = clamp(Math.round(line.assists * factor), 0, 22);
    line.turnovers = clamp(Math.round(line.turnovers * factor * 0.96), 0, 12);
    line.rebounds = clamp(Math.round(line.rebounds * factor), 0, 28);
    const shots = 2 * (line.fga + 0.44 * line.fta);
    line.trueShootingPct = shots > 0 ? line.points / shots : 0;
  }
  const want = Math.round(target);
  const sum = lines.reduce((total, line) => total + line.points, 0);
  const leader = lines.reduce(
    (best, line) => (line.points > best.points ? line : best),
    lines[0]!
  );
  if (!leader || sum === want) return;
  leader.points = Math.max(0, leader.points + clamp(want - sum, -3, 3));
}

export function simulateGame(
  game: GmScheduleGame,
  teams: GmTeam[],
  players: GmPlayer[],
  seed?: number,
  schedule?: GmScheduleGame[]
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
  let home = teams.find((t) => t.id === game.homeTeamId)!;
  let away = teams.find((t) => t.id === game.awayTeamId)!;
  if (game.exhibition === "allstar" && game.squad) {
    home = allStarSquadTeam(game.homeTeamId, game.squad[0], players);
    away = allStarSquadTeam(game.awayTeamId, game.squad[1], players);
    const homeIds = new Set(game.squad[0]);
    const awayIds = new Set(game.squad[1]);
    players = players.map((player) => {
      if (homeIds.has(player.id)) return { ...player, teamId: home.id, injury: null };
      if (awayIds.has(player.id)) return { ...player, teamId: away.id, injury: null };
      return player;
    });
  }
  const hS = teamStrength(home, players);
  const aS = teamStrength(away, players);

  // Possessions roughly track NBA pace (one team’s possessions ≈ pace).
  const paceScheme = clamp((paceWish(home.coaching) + paceWish(away.coaching)) / 2, 0.96, 1.06);
  const span = game.span != null && game.span > 0 && game.span < 1 ? game.span : 1;
  const rawPossessions = Math.round(((hS.pace + aS.pace) / 2) * paceScheme + (rng() - 0.5) * 6);
  const possessions =
    span === 1 ? clamp(rawPossessions, 92, 108) : clamp(Math.round(rawPossessions * span), 22, 34);

  const homeDressed = dressFromPlan(home, players);
  const awayDressed = dressFromPlan(away, players);
  const homeGroup = homeDressed.length ? homeDressed : dressTonight(home, players, rng);
  const awayGroup = awayDressed.length ? awayDressed : dressTonight(away, players, rng);
  // Lineup ratings are points per 100. BPM and DARKO are one player's effect,
  // so five men on the floor are the minute-weighted average times five.
  // 0.55 keeps a great roster near +10 to +12 a night instead of a blowout every time.
  const homeOff = possessionValue(homeGroup, "offense");
  const homeDef = possessionValue(homeGroup, "defense");
  const awayOff = possessionValue(awayGroup, "offense");
  const awayDef = possessionValue(awayGroup, "defense");
  const homeOrt = 114.0 + (homeOff - awayDef) * 0.55;
  const awayOrt = 114.0 + (awayOff - homeDef) * 0.55;
  const scoreFloor = span === 1 ? 86 : 18;
  const scoreCeil = span === 1 ? 148 : 48;
  const homeTarget = clamp(
    possessions * homeOrt / 100 + (game.neutral ? 0 : 1.4) + gaussian(rng) * 8.6 * span,
    scoreFloor,
    scoreCeil
  );
  const awayTarget = clamp(
    possessions * awayOrt / 100 + gaussian(rng) * 8.6 * span,
    scoreFloor,
    scoreCeil
  );
  const paceScale = clamp(possessions / 99.5, 0.94, 1.06);
  const homeGap = schedule ? gapBefore(schedule, game.homeTeamId, game.gameDate) : null;
  const awayGap = schedule ? gapBefore(schedule, game.awayTeamId, game.gameDate) : null;
  const homeLines = distributeStats(
    home,
    homeGroup,
    paceScale,
    1,
    rng,
    modsForTeam(home.coaching, away.coaching),
    home.coaching,
    homeDressed.length ? home.coaching?.minutes : undefined,
    homeGap
  );
  const awayLines = distributeStats(
    away,
    awayGroup,
    paceScale,
    1,
    rng,
    modsForTeam(away.coaching, home.coaching),
    away.coaching,
    awayDressed.length ? away.coaching?.minutes : undefined,
    awayGap
  );
  fitScore(homeLines, homeLines.length ? homeTarget : 0);
  fitScore(awayLines, awayLines.length ? awayTarget : 0);

  balanceRebounds(homeLines, awayLines);

  let homeScore = homeLines.reduce((sum, line) => sum + line.points, 0);
  let awayScore = awayLines.reduce((sum, line) => sum + line.points, 0);
  if (!homeLines.length) homeScore = Math.round(homeTarget);
  if (!awayLines.length) awayScore = Math.round(awayTarget);
  if (!homeLines.length && span === 1) homeScore = clamp(homeScore, 78, 155);
  if (!awayLines.length && span === 1) awayScore = clamp(awayScore, 78, 155);
  if (homeScore === awayScore) {
    const lines = rng() > 0.5 ? homeLines : awayLines;
    const leader = lines.reduce(
      (best, line) => (line.points > best.points ? line : best),
      lines[0]
    );
    if (leader) {
      leader.points += 1;
      if (lines === homeLines) homeScore += 1;
      else awayScore += 1;
    } else if (rng() > 0.5) homeScore += 1;
    else awayScore += 1;
  }
  stampPlusMinus(homeLines, homeScore - awayScore, rng);
  stampPlusMinus(awayLines, awayScore - homeScore, rng);
  const homeStarters = new Set(Object.values(home.starters).filter((id): id is string => !!id));
  const awayStarters = new Set(Object.values(away.starters).filter((id): id is string => !!id));
  for (const line of homeLines) {
    if (line.minutes > 0 && homeStarters.has(line.playerId)) line.started = true;
  }
  for (const line of awayLines) {
    if (line.minutes > 0 && awayStarters.has(line.playerId)) line.started = true;
  }
  if (span < 1) {
    for (const line of [...homeLines, ...awayLines]) {
      line.minutes = Math.max(1, Math.round(line.minutes * span));
    }
  }

  const box: GmBoxScore = {
    id: uid("box"),
    gameId: game.id,
    season: game.season,
    day: game.day,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore,
    awayScore,
    possessions,
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

type PerMinute = {
  mpg: number;
  fga: number;
  threeShare: number;
  ftPerFga: number;
  twoPct: number;
  threePct: number;
  ftPct: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
};

/**
 * Shot mix and per-minute counting from the season the player entered with.
 * Prospects and generated players fall back to the attribute sheet.
 */
function perMinute(player: GmPlayer): PerMinute {
  const line = player.nbaSeason;
  const minutes = line && line.gp > 0 ? line.min : 0;
  if (line && line.gp >= 5 && minutes >= 40 && line.fga > 0) {
    const twoA = Math.max(1, line.fga - line.tpa);
    const twoM = Math.max(0, line.fgm - line.tpm);
    const orb =
      line.orb ??
      line.reb * (player.position === "C" || player.position === "PF" ? 0.32 : 0.16);
    const drb = line.drb ?? Math.max(0, line.reb - orb);
    return {
      mpg: line.min / line.gp,
      fga: line.fga / minutes,
      threeShare: clamp((line.tpa / line.fga) * 1.035, 0, 0.9),
      ftPerFga: clamp(line.fta / line.fga, 0, 1.2),
      twoPct: clamp(twoM / twoA, 0.3, 0.85),
      threePct: line.tpa > 0 ? clamp(line.tpm / line.tpa, 0.15, 0.55) : 0,
      ftPct: line.fta > 0 ? clamp(line.ftm / line.fta, 0.35, 0.98) : 0.75,
      orb: orb / minutes,
      drb: drb / minutes,
      ast: line.ast / minutes,
      stl: line.stl / minutes,
      blk: line.blk / minutes,
      tov: line.tov / minutes,
    };
  }

  const sheet = player.sheet;
  const threeShare = sheet
    ? clamp(sheet.tendencies.shootThree / 100, 0, 0.85)
    : clamp(0.15 + player.ratings.shooting / 200, 0, 0.6);
  const attrs = sheet?.attributes;
  const twoPct = attrs
    ? twoMakeRateFromRating(attrs.closeShot, attrs.midrange)
    : clamp(0.42 + player.ratings.finishing / 400, 0.4, 0.7);
  const threePct = attrs
    ? threeMakeRateFromRating(attrs.threePoint)
    : clamp(0.28 + player.ratings.shooting / 400, 0.25, 0.42);
  const ftPct = attrs
    ? freeThrowMakeRateFromRating(attrs.freeThrow)
    : 0.75;
  const usg = clamp(
    0.14 + player.ratings.impact * 0.012 + (player.position === "PG" ? 0.03 : 0),
    0.1,
    0.34
  );
  const reb = player.ratings.rebounding;
  const big = player.position === "C" || player.position === "PF";
  return {
    mpg: player.minutesPreference || 16,
    fga: 1.83 * usg,
    threeShare,
    ftPerFga: big ? 0.32 : 0.22,
    twoPct,
    threePct,
    ftPct,
    orb: (big ? 0.09 : 0.025) + Math.max(0, reb - 40) / 900,
    drb: (big ? 0.18 : 0.08) + Math.max(0, reb - 40) / 500,
    ast: (player.position === "PG" ? 0.16 : 0.05) + player.ratings.playmaking / 800,
    stl: 0.02 + player.ratings.defense / 2500,
    blk: big ? 0.035 + player.ratings.defense / 1800 : 0.012,
    tov: 0.04 + usg * 0.08,
  };
}

/**
 * Shift chart minutes. A saved plan is the coach's own numbers, with a small wobble.
 */
function assignMinutes(
  team: GmTeam,
  lineup: GmPlayer[],
  rng: () => number,
  plan?: Record<string, number>
): number[] {
  if (plan) {
    const wants = lineup.map((player) =>
      clamp((plan[player.id] ?? 0) * (0.97 + rng() * 0.06), 0, 42)
    );
    const sum = wants.reduce((total, minutes) => total + minutes, 0);
    if (sum > 240) {
      const scale = 240 / sum;
      return wants.map((minutes) => minutes * scale);
    }
    return wants;
  }
  const starterIds = new Set(
    Object.values(team.starters).filter((id): id is string => !!id)
  );
  const targets = positionalMinuteTargets(lineup, team.starters);
  const painted = paintShifts({
    coaching: team.coaching,
    players: lineup.map((player) => ({
      id: player.id,
      minutes: targets[player.id] ?? rotationTarget(player),
      starter: starterIds.has(player.id),
      position: player.position,
    })),
  });
  const byId = new Map(painted.map((row) => [row.id, row.minutes]));
  return lineup.map((player) => byId.get(player.id) ?? 0);
}

/** Poisson draw. Rounding a normal up from zero was inflating steals, blocks, and free throws. */
function varyCount(mean: number, rng: () => number, cap?: number): number {
  if (mean <= 0) return 0;
  if (mean < 12) {
    const limit = Math.exp(-mean);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rng();
    } while (p > limit && k < 40);
    return clamp(k - 1, 0, cap ?? 40);
  }
  const next = Math.round(mean + gaussian(rng) * Math.sqrt(mean));
  return clamp(next, 0, cap ?? 80);
}

function varyMakes(attempts: number, pct: number, rng: () => number): number {
  if (attempts <= 0 || pct <= 0) return 0;
  const rate = clamp(pct, 0, 0.95);
  if (attempts <= 24) {
    let made = 0;
    for (let i = 0; i < attempts; i++) {
      if (rng() < rate) made += 1;
    }
    return made;
  }
  const mean = attempts * rate;
  const std = Math.sqrt(attempts * rate * (1 - rate));
  return clamp(Math.round(mean + gaussian(rng) * std), 0, attempts);
}

function distributeStats(
  team: GmTeam,
  lineup: GmPlayer[],
  paceScale: number,
  fgMult: number,
  rng: () => number,
  mods: RateMods = {
    three: 1,
    two: 1,
    ft: 1,
    ast: 1,
    tov: 1,
    stl: 1,
    blk: 1,
    orb: 1,
  },
  coaching?: GmTeam["coaching"],
  minutePlan?: Record<string, number>,
  gapDays: number | null = null
): GmBoxPlayerLine[] {
  if (!lineup.length) return [];
  const minutes = assignMinutes(team, lineup, rng, minutePlan);
  const profiles = lineup.map((player) => perMinute(player));
  const usage = lineup.map((player) => usageBoost(player, coaching));
  const baseFga = lineup.map((_, index) => {
    const rate = profiles[index]!;
    return rate.fga * (minutes[index] ?? 0) * paceScale;
  });
  const boosted = baseFga.map((fga, index) => fga * usage[index]!);
  const baseSum = baseFga.reduce((total, fga) => total + fga, 0);
  const boostSum = boosted.reduce((total, fga) => total + fga, 0) || 1;
  const keep = boostSum > 0 ? baseSum / boostSum : 1;
  const drafted = lineup.map((player, index) => {
    const rate = profiles[index]!;
    const min = minutes[index] ?? 0;
    if (min < 1) return null;
    const volume = min * paceScale;
    const fga = varyCount((boosted[index] ?? 0) * keep, rng, 45);
    const threeShare = clamp(
      (rate.threeShare < 0.012 ? 0 : rate.threeShare) * mods.three,
      0,
      0.78
    );
    let tpa = 0;
    for (let shot = 0; shot < fga; shot++) {
      if (rng() < threeShare) tpa += 1;
    }
    const twoA = Math.max(0, fga - tpa);
    const tired = secondNightScale(player.age, gapDays);
    const tpm = varyMakes(tpa, clamp(rate.threePct, 0.12, 0.55) * fgMult * tired, rng);
    const twoM = varyMakes(twoA, clamp(rate.twoPct * mods.two, 0.32, 0.78) * fgMult * tired, rng);
    const fgm = twoM + tpm;
    const fta = varyCount(fga * rate.ftPerFga * mods.ft * extraFt(player, coaching), rng, 30);
    const ftm = varyMakes(fta, rate.ftPct, rng);
    const points = Math.max(0, twoM * 2 + tpm * 3 + ftm);
    const orb = varyCount(rate.orb * volume * mods.orb, rng, 20);
    const drb = varyCount(rate.drb * volume, rng, 25);
    const assists = varyCount(
      rate.ast * volume * mods.ast * extraAst(player, coaching),
      rng,
      25
    );
    const steals = varyCount(rate.stl * volume * mods.stl, rng, 8);
    const blocks = varyCount(rate.blk * volume * mods.blk, rng, 10);
    const turnovers = varyCount(rate.tov * volume * mods.tov, rng, 12);
    return {
      player,
      min,
      fga,
      fgm,
      tpa,
      tpm,
      fta,
      ftm,
      points,
      orb,
      drb,
      assists,
      steals,
      blocks,
      turnovers,
    };
  });

  const played = drafted.filter((row) => row != null);
  const teamFgm = played.reduce((sum, row) => sum + row.fgm, 0) || 1;
  const teamAst = played.reduce((sum, row) => sum + row.assists, 0);
  const astScale = teamAst > teamFgm * 0.82 ? (teamFgm * 0.82) / teamAst : 1;

  return played.map((row) => {
    const fgm = row.fgm;
    const fga = row.fga;
    const points = row.points;
    const assists = Math.round(row.assists * astScale);
    const rebounds = row.orb + row.drb;
    const tsDenom = 2 * (fga + 0.44 * row.fta);
    const gameScore =
      points +
      0.4 * fgm -
      0.7 * fga -
      0.4 * (row.fta - row.ftm) +
      rebounds * 0.5 +
      row.steals +
      0.7 * assists +
      0.7 * row.blocks -
      row.turnovers;
    return {
      playerId: row.player.id,
      playerName: row.player.name,
      teamId: row.player.teamId!,
      minutes: Math.round(row.min * 10) / 10,
      points,
      assists,
      rebounds,
      steals: row.steals,
      blocks: row.blocks,
      turnovers: row.turnovers,
      fgm,
      fga,
      tpm: row.tpm,
      tpa: row.tpa,
      ftm: row.ftm,
      fta: row.fta,
      plusMinus: 0,
      trueShootingPct: tsDenom > 0 ? points / tsDenom : 0,
      usagePct: fga / Math.max(1, played.reduce((sum, item) => sum + item.fga, 0)),
      gameScore: Math.round(gameScore * 10) / 10,
    };
  });
}

/** Almost every missed shot becomes a rebound for somebody. */
function balanceRebounds(home: GmBoxPlayerLine[], away: GmBoxPlayerLine[]) {
  const misses = (lines: GmBoxPlayerLine[]) =>
    lines.reduce((sum, line) => sum + Math.max(0, line.fga - line.fgm), 0);
  const grabbed = (lines: GmBoxPlayerLine[]) =>
    lines.reduce((sum, line) => sum + line.rebounds, 0);
  const target = (misses(home) + misses(away)) * 0.925;
  const have = grabbed(home) + grabbed(away);
  if (have < 1 || target < 1) return;
  const scale = clamp(target / have, 0.84, 1.18);
  for (const line of [...home, ...away]) {
    const next = Math.round(line.rebounds * scale);
    line.gameScore = Math.round((line.gameScore + (next - line.rebounds) * 0.5) * 10) / 10;
    line.rebounds = next;
  }
  const want = Math.round(target);
  const got = grabbed(home) + grabbed(away);
  const board = [...home, ...away];
  const host = board.reduce(
    (best, line) => (line.rebounds > (best?.rebounds ?? -1) ? line : best),
    board[0]
  );
  if (host) host.rebounds = Math.max(0, host.rebounds + (want - got));
}

function stampPlusMinus(
  lines: GmBoxPlayerLine[],
  margin: number,
  rng: () => number
) {
  for (const line of lines) {
    line.plusMinus = Math.round((line.minutes / 48) * margin * 2.1 + gaussian(rng) * 5);
  }
}
