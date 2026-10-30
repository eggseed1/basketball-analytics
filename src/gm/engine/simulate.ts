import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import type { GmBoxPlayerLine, GmBoxScore, GmLeagueSettings, GmPlayer, GmScheduleGame, GmTeam } from "@/gm/types";
import { createRng, clamp } from "@/gm/engine/rng";
import { coachingOf, modsForTeam, paceWish, paintShifts, usageBoost, validShiftPlan } from "@/gm/engine/coaching";
import { positionalMinuteTargets, minuteLoadMul } from "@/gm/engine/lineup";
import { ensureSimProfile, simulationRates } from "@/gm/engine/player-profile";
import { lineupBalance, roleFit, assignFive } from "@/gm/engine/rotation-roles";
import { allStarSquadTeam } from "@/gm/engine/allstar";
import { gapBefore } from "@/gm/engine/schedule";
import { coachEffect } from "@/gm/engine/staff";

export function lineupPlayers(team: GmTeam, players: GmPlayer[], max = 10): GmPlayer[] {
  const starters = new Set(Object.values(team.starters));
  return players.filter(p => p.teamId === team.id && (!p.injury || p.injury.gamesRemaining <= 0))
    .sort((a, b) => Number(starters.has(b.id)) - Number(starters.has(a.id)) ||
      (team.coaching?.minutes?.[b.id] ?? b.minutesPreference) - (team.coaching?.minutes?.[a.id] ?? a.minutesPreference) || a.id.localeCompare(b.id)).slice(0, max);
}

export function secondNightScale(age: number, gapDays: number | null): number {
  if (gapDays !== 1) return 1;
  return age >= 34 ? 0.974 : age >= 30 ? 0.986 : 0.994;
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function weighted<T>(list: T[], weight: (item: T) => number, rng: () => number): T {
  const weights = list.map(item => Math.max(0.0001, weight(item)));
  let roll = rng() * weights.reduce((sum, n) => sum + n, 0);
  for (let i = 0; i < list.length; i++) { roll -= weights[i]!; if (roll <= 0) return list[i]!; }
  return list[list.length - 1]!;
}

function emptyLine(p: GmPlayer): GmBoxPlayerLine {
  return { playerId: p.id, playerName: p.name, teamId: p.teamId!, minutes: 0, points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, turnovers: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, plusMinus: 0, trueShootingPct: 0, usagePct: 0, gameScore: 0 };
}

function book(team: GmTeam, players: GmPlayer[], playoff: boolean) {
  const roster = players.filter(p => p.teamId === team.id && (!p.injury || p.injury.gamesRemaining <= 0));
  if (roster.length < 5) throw new Error(`${team.abbr} needs five healthy players to simulate.`);
  const coaching = coachingOf(team);
  const saved = coaching.minutes;
  const targets = saved && roster.filter(p => (saved[p.id] ?? 0) > 0).length >= 5 ? saved : positionalMinuteTargets(roster, team.starters, playoff ? 8 : coaching.rotationDepth);
  const starters = new Set(Object.values(team.starters));
  const rows = validShiftPlan(coaching.shifts, roster.map(p => p.id)) ?? paintShifts({
    players: roster.map(p => ({ id: p.id, minutes: targets[p.id] ?? 0, starter: starters.has(p.id), position: coaching.coverSlot?.[p.id] ?? p.position })),
    coaching,
  });
  if (!rows.some(row => row.minutes > 0)) throw new Error(`${team.abbr} needs a complete rotation.`);
  return { roster, rows, coaching };
}

/** One source for minutes, score, stats, shared stints and the shot-chart feed. */
export function simulateGame(
  game: GmScheduleGame,
  teams: GmTeam[],
  players: GmPlayer[],
  seed?: number,
  schedule?: GmScheduleGame[],
  settings?: GmLeagueSettings
): { game: GmScheduleGame; box: GmBoxScore } {
  const actualSeed = seed ?? hash(`${game.id}:${game.season}:${game.day}`);
  const rng = createRng(actualSeed);
  let home = teams.find(t => t.id === game.homeTeamId);
  let away = teams.find(t => t.id === game.awayTeamId);
  if (!home || !away) throw new Error("The game references a missing team.");
  if (game.exhibition === "allstar" && game.squad) {
    home = allStarSquadTeam(game.homeTeamId, game.squad[0], players);
    away = allStarSquadTeam(game.awayTeamId, game.squad[1], players);
    const h = new Set(game.squad[0]), a = new Set(game.squad[1]);
    players = players.map(p => h.has(p.id) ? { ...p, teamId: home!.id, injury: null } : a.has(p.id) ? { ...p, teamId: away!.id, injury: null } : p);
  }
  players = players.map(ensureSimProfile);
  const homeBook = book(home, players, Boolean(game.postseason));
  const awayBook = book(away, players, Boolean(game.postseason));
  const byId = new Map(players.map(p => [p.id, p]));
  const lines = new Map([...homeBook.roster, ...awayBook.roster].map(p => [p.id, emptyLine(p)]));
  const rates = new Map(players.map(p => [p.id, simulationRates(p)]));
  const usedOnCourt = new Map<string, number>();
  const events: PlayByPlayEvent[] = [];
  const stints: NonNullable<GmBoxScore["stints"]> = [];
  let homeScore = 0, awayScore = 0;
  let homeFloor: GmPlayer[] = [], awayFloor: GmPlayer[] = [];
  const span = clamp(game.span ?? 1, 0.05, 1);
  const regulation = Math.round(2880 * span);
  const eraPace = game.season < 2010 ? 93 : game.season < 2017 ? 96 : 99.5;
  const pace = eraPace * (paceWish(homeBook.coaching) + paceWish(awayBook.coaching)) / 2 * clamp(settings?.simPace ?? 1, 0.8, 1.2);
  const possessionsPerSide = Math.max(1, Math.round(pace * span + (rng() - 0.5) * 6));
  const gap = [schedule ? gapBefore(schedule, home.id, game.gameDate) : null, schedule ? gapBefore(schedule, away.id, game.gameDate) : null];
  const coach = [coachEffect(home), coachEffect(away)];
  let elapsed = 0;
  let overtime = 0;
  let totalPossessions = 0;

  function push(player: GmPlayer, actionType: string, subType: string, description: string, points = 0, fieldGoal = false, made: boolean | null = null, second?: GmPlayer, three = false) {
    const period = elapsed < 2880 ? Math.floor(elapsed / 720) + 1 : 5 + Math.floor((elapsed - 2880) / 300);
    const length = period <= 4 ? 720 : 300;
    const start = period <= 4 ? (period - 1) * 720 : 2880 + (period - 5) * 300;
    const seconds = clamp(length - Math.floor(elapsed - start), 0, length);
    const n = events.length + 1;
    const angle = rng() * Math.PI;
    const radius = three ? 24.2 + rng() * 3 : subType === "layup" ? 1 + rng() * 4 : 5 + rng() * 16;
    events.push({ id: `${game.id}:${actualSeed}:${n}`, gameId: game.id, actionNumber: n, orderNumber: n,
      period, clockSeconds: seconds, clock: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
      actionType, subType, description, teamId: player.teamId!.toUpperCase(), teamTricode: player.teamId!.toUpperCase(),
      playerId: player.id, playerName: player.name, secondPlayerId: second?.id ?? null,
      scoreHome: homeScore, scoreAway: awayScore, shotResult: made == null ? null : made ? "Made" : "Missed",
      isFieldGoal: fieldGoal, points, locX: fieldGoal ? Math.cos(angle) * radius : null, locY: fieldGoal ? Math.sin(angle) * radius : null, wallMs: null });
  }
  function score(player: GmPlayer, points: number) {
    lines.get(player.id)!.points += points;
    const isHome = player.teamId === home!.id;
    if (isHome) homeScore += points; else awayScore += points;
    for (const p of homeFloor) lines.get(p.id)!.plusMinus += isHome ? points : -points;
    for (const p of awayFloor) lines.get(p.id)!.plusMinus += isHome ? -points : points;
  }
  function rebound(off: GmPlayer[], def: GmPlayer[], three: boolean): boolean {
    const offense = off === homeFloor ? homeBook : awayBook;
    const defense = off === homeFloor ? awayBook : homeBook;
    const mods = modsForTeam(offense.coaching, defense.coaching);
    const offensiveWeight = off.reduce((n, p) => n + rates.get(p.id)!.orb, 0) * mods.orb;
    const defensiveWeight = def.reduce((n, p) => n + rates.get(p.id)!.drb, 0);
    const offensive = rng() < clamp(offensiveWeight / Math.max(0.01, offensiveWeight + defensiveWeight), 0.08, 0.42);
    const pool = offensive ? off : def;
    const p = weighted(pool, p => (offensive ? rates.get(p.id)!.orb : rates.get(p.id)!.drb) + (three && p.position !== "C" ? 0.015 : 0), rng);
    lines.get(p.id)!.rebounds++;
    push(p, "rebound", offensive ? "offensive" : "defensive", `${p.name} ${offensive ? "offensive" : "defensive"} rebound`);
    return offensive;
  }
  function possession(off: GmPlayer[], def: GmPlayer[], side: number) {
    const own = side === 0 ? homeBook : awayBook;
    const other = side === 0 ? awayBook : homeBook;
    const mods = modsForTeam(own.coaching, other.coaching);
    const volume = off.reduce((n, p) => n + rates.get(p.id)!.fga, 0);
    const turnovers = off.reduce((n, p) => n + rates.get(p.id)!.tov, 0);
    const freeThrows = off.reduce((n, p) => n + rates.get(p.id)!.fga * rates.get(p.id)!.ftPerFga, 0);
    const turnoverChance = clamp(turnovers / Math.max(0.1, volume + 0.44 * freeThrows + turnovers) * mods.tov, 0.065, 0.24);
    const handler = weighted(off, p => rates.get(p.id)!.fga * usageBoost(p, own.coaching) + rates.get(p.id)!.ast, rng);
    for (const p of off) usedOnCourt.set(p.id, (usedOnCourt.get(p.id) ?? 0) + 1);
    if (rng() < turnoverChance) {
      lines.get(handler.id)!.turnovers++;
      const steal = rng() < 0.56 ? weighted(def, p => rates.get(p.id)!.stl, rng) : undefined;
      if (steal) lines.get(steal.id)!.steals++;
      push(handler, "turnover", steal ? "steal" : "bad pass", `${handler.name} turnover${steal ? ` (${steal.name} steals)` : ""}`, 0, false, null, steal);
      return;
    }
    const defense = def.reduce((n, p) => n + p.ratings.defense, 0);
    // The impact estimate calibrates only a bounded residual around entry shot probabilities.
    // Future attribute changes move those probabilities directly.
    const baselineFga = off.reduce((n, p) => n + p.simProfile!.rates.fga, 0);
    const baselinePoints = off.reduce((n, p) => {
      const r = p.simProfile!.rates;
      return n + r.fga * (2 * (1 - r.threeShare) * r.twoPct + 3 * r.threeShare * r.threePct + r.ftPerFga * r.ftPct);
    }, 0);
    const baselineUses = off.reduce((n, p) => n + p.simProfile!.rates.fga * (1 + 0.44 * p.simProfile!.rates.ftPerFga) + p.simProfile!.rates.tov - p.simProfile!.rates.orb, 0);
    const entryImpact = off.reduce((n, p) => n + p.simProfile!.impact * 0.65, 0);
    const environment = game.season < 2017 ? 1.06 : 1.135;
    const residual = clamp((environment + entryImpact * 0.008 - baselinePoints / Math.max(0.2, baselineUses)) / 2.2, -0.035, 0.035);
    const fit = lineupBalance(off) * 0.002 - off.reduce((n, p) => n + (1 - roleFit(p, own.coaching.coverSlot?.[p.id] ?? p.position)) * 0.015, 0);
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) for (const p of off) usedOnCourt.set(p.id, (usedOnCourt.get(p.id) ?? 0) + 1);
      const shooter = weighted(off, p => rates.get(p.id)!.fga * usageBoost(p, own.coaching), rng);
      const r = rates.get(shooter.id)!;
      const line = lines.get(shooter.id)!;
      const tired = secondNightScale(shooter.age, gap[side] ?? null) * minuteLoadMul(line.minutes, shooter.sheet?.attributes.stamina ?? 70);
      const foulChance = clamp((freeThrows / Math.max(0.1, volume)) / 2.5 * mods.ft, 0.025, 0.2);
      if (rng() < foulChance) {
        let finalMade = false;
        for (let ft = 1; ft <= 2; ft++) {
          line.fta++; finalMade = rng() < r.ftPct;
          if (finalMade) { line.ftm++; score(shooter, 1); }
          push(shooter, "freethrow", finalMade ? "made" : "missed", `${shooter.name} ${finalMade ? "makes" : "misses"} free throw ${ft} of 2`, finalMade ? 1 : 0, false, finalMade);
        }
        if (finalMade || !rebound(off, def, false)) return;
        continue;
      }
      const three = rng() < clamp(r.threeShare * mods.three, 0, 0.88);
      const blocked = rng() < clamp(def.reduce((n, p) => n + rates.get(p.id)!.blk, 0) / Math.max(0.1, baselineFga) * (three ? 0.3 : 0.95), 0.005, 0.16);
      const blocker = blocked ? weighted(def, p => rates.get(p.id)!.blk, rng) : undefined;
      const homeAdvantage = side === 0 && !game.neutral ? 0.004 : 0;
      const pct = (three ? r.threePct : r.twoPct * mods.two) * tired + residual + fit - defense * 0.003 + homeAdvantage + (coach[side]!.offense - coach[1 - side]!.defense) * 0.002;
      const made = !blocked && rng() < clamp(pct, 0.08, 0.87);
      line.fga++; if (three) line.tpa++;
      const assisted = made && rng() < clamp(off.filter(p => p.id !== shooter.id).reduce((n, p) => n + rates.get(p.id)!.ast, 0) / Math.max(0.2, volume) / 0.47 * mods.ast, 0.18, 0.85);
      const passer = assisted ? weighted(off.filter(p => p.id !== shooter.id), p => rates.get(p.id)!.ast, rng) : undefined;
      if (made) { line.fgm++; if (three) line.tpm++; score(shooter, three ? 3 : 2); }
      if (passer) lines.get(passer.id)!.assists++;
      if (blocker) lines.get(blocker.id)!.blocks++;
      const layup = !three && rng() < clamp(r.twoPct - 0.1, 0.2, 0.7);
      push(shooter, three ? "3pt" : "2pt", layup ? "layup" : "jump shot", `${shooter.name} ${made ? "makes" : "misses"} ${three ? "three pointer" : layup ? "layup" : "jump shot"}${passer ? ` (${passer.name} assists)` : blocker ? ` (${blocker.name} blocks)` : ""}`, made ? three ? 3 : 2 : 0, true, made, passer ?? blocker, three);
      if (made || !rebound(off, def, three)) return;
    }
  }
  function runFrame(start: number, duration: number, slot: number, possessions: number, extra = false) {
    function floor(b: ReturnType<typeof book>): GmPlayer[] {
      const ids = extra
        ? (b.coaching.closingLineup?.length === 5 ? b.coaching.closingLineup : b.rows.filter(row => row.on[23]).map(row => row.id))
        : b.rows.filter(row => row.on[slot]).map(row => row.id);
      const available = ids.map(id => byId.get(id)).filter((p): p is GmPlayer => Boolean(p && p.teamId === b.roster[0]!.teamId && !p.injury));
      for (const p of b.roster) if (available.length < 5 && !available.some(q => q.id === p.id)) available.push(p);
      return available.slice(0, 5);
    }
    homeFloor = floor(homeBook); awayFloor = floor(awayBook);
    stints.push({ start, end: start + duration, home: homeFloor.map(p => p.id), away: awayFloor.map(p => p.id) });
    for (const group of [homeFloor, awayFloor]) {
      const coaching = group === homeFloor ? homeBook.coaching : awayBook.coaching;
      const desired = Object.fromEntries(group.map(p => [p.id, Object.fromEntries(Object.entries(coaching.positionMinutes?.[p.id] ?? {}).map(([pos, min]) => [pos, Math.max(0, (min ?? 0) - (lines.get(p.id)!.positionMinutes?.[pos as GmPlayer["position"]] ?? 0))]))]));
      const seats = assignFive(group, desired).starters;
      for (const p of group) {
        const line = lines.get(p.id)!;
        line.minutes += duration / 60;
        for (const [position, id] of Object.entries(seats)) if (id === p.id) {
          const key = position as GmPlayer["position"];
          line.positionMinutes = { ...line.positionMinutes, [key]: (line.positionMinutes?.[key] ?? 0) + duration / 60 };
        }
      }
    }
    for (let i = 0; i < possessions; i++) {
      elapsed = start + (i + 0.25) * duration / Math.max(1, possessions);
      possession(homeFloor, awayFloor, 0);
      elapsed = start + (i + 0.75) * duration / Math.max(1, possessions);
      possession(awayFloor, homeFloor, 1);
    }
    totalPossessions += possessions;
  }
  for (let start = 0, slot = 0; start < regulation; start += 120, slot++) {
    const duration = Math.min(120, regulation - start);
    const n = Math.round(possessionsPerSide * (start + duration) / regulation) - Math.round(possessionsPerSide * start / regulation);
    runFrame(start, duration, slot, n);
  }
  while (homeScore === awayScore) {
    const start = regulation + overtime * 300;
    overtime++;
    for (let offset = 0; offset < 300; offset += 120) runFrame(start + offset, Math.min(120, 300 - offset), 23, Math.max(1, Math.round(pace * Math.min(120, 300 - offset) / 2880)), true);
  }
  const played = [...lines.values()].filter(line => line.minutes > 0);
  for (const line of played) {
    const team = line.teamId === home.id ? home : away;
    line.started = Object.values(team.starters).includes(line.playerId);
    line.trueShootingPct = line.points / Math.max(1, 2 * (line.fga + 0.44 * line.fta));
    line.usagePct = (line.fga + 0.44 * line.fta + line.turnovers) / Math.max(1, usedOnCourt.get(line.playerId) ?? 1);
    line.gameScore = Math.round((line.points + 0.4 * line.fgm - 0.7 * line.fga - 0.4 * (line.fta - line.ftm) + 0.5 * line.rebounds + line.steals + 0.7 * line.assists + 0.7 * line.blocks - line.turnovers) * 10) / 10;
  }
  const box: GmBoxScore = { id: `box_${game.id}_${actualSeed}`, gameId: game.id, season: game.season, day: game.day, homeTeamId: home.id, awayTeamId: away.id,
    homeScore, awayScore, possessions: totalPossessions, players: played, events, stints, overtime, postseason: game.postseason,
    shiftPlan: homeBook.rows.map(row => ({ playerId: row.id, playerName: byId.get(row.id)!.name, on: row.on })) };
  return { game: { ...game, played: true, homeScore, awayScore, boxScoreId: box.id }, box };
}

/** Keep detailed feeds for the user's games without filling saves with CPU event logs. */
export function compactSimBox(box: GmBoxScore, userTeamId: string): GmBoxScore {
  return box.homeTeamId === userTeamId || box.awayTeamId === userTeamId ? box : { ...box, events: undefined, stints: undefined, shiftPlan: undefined };
}
