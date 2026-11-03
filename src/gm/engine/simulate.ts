import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import type { GmBoxPlayerLine, GmBoxScore, GmLeagueSettings, GmPlayer, GmScheduleGame, GmTeam } from "@/gm/types";
import { createRng, clamp } from "@/gm/engine/rng";
import { coachingOf, modsForTeam, paceWish, rotationForTeam, usageBoost } from "@/gm/engine/coaching";
import { minuteLoadMul } from "@/gm/engine/lineup";
import { ensureSimProfile, simulationRates } from "@/gm/engine/player-profile";
import { lineupBalance, roleFit } from "@/gm/engine/rotation-roles";
import { allStarSquadTeam } from "@/gm/engine/allstar";
import { gapBefore } from "@/gm/engine/schedule";
import { coachEffect } from "@/gm/engine/staff";
import { badgeEffects, ensureBadges } from "@/gm/engine/badges";
import { chooseSimShot } from "@/gm/engine/shot-selection";
import { frameActionTimes, playerNightForm, teamMatchForm } from "@/gm/engine/game-context";

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
  const compiled = rotationForTeam(team,players,playoff);
  if(compiled.rows.some(row=>row.on.filter(Boolean).length!==row.minutes/2)||compiled.frames.some(frame=>new Set(Object.values(frame).filter(Boolean)).size!==5))throw new Error(`${team.abbr} needs a complete rotation.`);
  return { ...compiled, coaching };

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
  const clockRng = createRng((actualSeed ^ 0x70611cfa) >>> 0);
  const teamForm = [teamMatchForm(actualSeed, 0), teamMatchForm(actualSeed, 1)];
  let home = teams.find(t => t.id === game.homeTeamId);
  let away = teams.find(t => t.id === game.awayTeamId);
  if (game.exhibition === "allstar" && game.squad) {
    home = allStarSquadTeam(game.homeTeamId, game.squad[0], players);
    away = allStarSquadTeam(game.awayTeamId, game.squad[1], players);
    const h = new Set(game.squad[0]), a = new Set(game.squad[1]);
    players = players.map(p => h.has(p.id) ? { ...p, teamId: home!.id, injury: null } : a.has(p.id) ? { ...p, teamId: away!.id, injury: null } : p);
  }
  if (!home || !away) throw new Error("The game references a missing team.");
  players = players.map(p => ensureBadges(ensureSimProfile(p)));
  const homeBook = book(home, players, Boolean(game.postseason));
  const awayBook = book(away, players, Boolean(game.postseason));
  const byId = new Map(players.map(p => [p.id, p]));
  const lines = new Map([...homeBook.roster, ...awayBook.roster].map(p => [p.id, emptyLine(p)]));
  const badges = new Map(players.map(p => [p.id, badgeEffects(p)]));
  const playerForm = new Map(players.map(p => [p.id, playerNightForm(actualSeed, p.id)]));
  const rates = new Map(players.map(p => {
    const r = simulationRates(p), b = badges.get(p.id)!;
    return [p.id, { ...r, twoPct: r.twoPct+b.two, threePct: r.threePct+b.three, ftPct: clamp(r.ftPct+b.ft-0.010,0,0.98), ast: r.ast*b.ast, stl: r.stl*b.stl, blk: r.blk*b.blk, orb: r.orb*b.reb, drb: r.drb*b.reb }];
  }));
  const entryTotals = players.filter(p => p.teamId && p.simProfile?.source === "nba" && p.nbaSeason).reduce((n, p) => ({ fga: n.fga + p.nbaSeason!.fga, tpa: n.tpa + p.nbaSeason!.tpa, blk: n.blk + p.nbaSeason!.blk }), { fga: 0, tpa: 0, blk: 0 });
  const leagueBlockRate = entryTotals.fga > 0 ? entryTotals.blk / entryTotals.fga : 0.055;
  const leagueThreeShare = entryTotals.fga > 0 ? entryTotals.tpa / entryTotals.fga : 0.415;
  const averageBlockWeight = 0.95 * (1 - leagueThreeShare) + 0.3 * leagueThreeShare;
  const usedOnCourt = new Map<string, number>();
  const events: PlayByPlayEvent[] = [];
  const stints: NonNullable<GmBoxScore["stints"]> = [];
  let homeScore = 0, awayScore = 0;
  let homeFloor: GmPlayer[] = [], awayFloor: GmPlayer[] = [];
  const courtSpots = new Map<string,GmPlayer["position"]>();
  const stintMinutes = new Map<string,number>();
  const span = clamp(game.span ?? 1, 0.05, 1);
  const regulation = Math.round(2880 * span);
  const eraPace = game.season < 2010 ? 93 : game.season < 2017 ? 96 : 99.5;
  const pace = eraPace * (paceWish(homeBook.coaching) + paceWish(awayBook.coaching)) / 2 * clamp(settings?.simPace ?? 1, 0.8, 1.2);
  // NBA published pace excludes some action sequences. The FGA + 0.44*FTA
  // + TOV - OREB estimator is ~3.8% above published pace in 2025-26.
  // Use an action-sequence count for events but report true pace in the box.
  const actionSequenceFactor = 1.046;
  const possessionsPerSide = Math.max(1, Math.round((pace + (teamForm[0]!.tempo + teamForm[1]!.tempo) / 2) * span * actionSequenceFactor + (rng() - 0.5) * 8));
  const gap = [schedule ? gapBefore(schedule, home.id, game.gameDate) : null, schedule ? gapBefore(schedule, away.id, game.gameDate) : null];
  const coach = [coachEffect(home), coachEffect(away)];
  // A full 82-game season needs the difference between elite and rebuilding
  // rotations to persist beyond one night's shooting variance. Every team's
  // projected on-court impact is calculated from the actual 240-minute book;
  // no team identity, historical W-L or fixed standings target enters here.
  // The bonus is symmetric: good teams do not inflate league-wide scoring,
  // and a GM changing the roster changes its strength immediately.
  const projectedImpact = [homeBook, awayBook].map(book =>
    book.roster.reduce((sum, player) =>
      sum + (book.minutes[player.id] ?? 0) / 240 * player.ratings.impact, 0)
  );

  let elapsed = 0;
  let overtime = 0;
  let totalPossessions = 0;
  let transitionForSide: 0 | 1 | null = null;
  const actualShiftSlots = new Map<string, boolean[]>([...homeBook.roster, ...awayBook.roster].map(p => [p.id, Array(24).fill(false)]));
  const homeStarts = clockRng() < 0.5;

  function push(player: GmPlayer, actionType: string, subType: string, description: string, points = 0, fieldGoal = false, made: boolean | null = null, second?: GmPlayer, location?: { x: number; y: number }) {
    const period = elapsed < 2880 ? Math.floor(elapsed / 720) + 1 : 5 + Math.floor((elapsed - 2880) / 300);
    const length = period <= 4 ? 720 : 300;
    const start = period <= 4 ? (period - 1) * 720 : 2880 + (period - 5) * 300;
    const seconds = clamp(length - Math.floor(elapsed - start), 0, length);
    const n = events.length + 1;
    if (actionType === "foul") {
      const line = lines.get(player.id);
      if (line) line.personalFouls = (line.personalFouls ?? 0) + 1;
    }
    events.push({ id: `${game.id}:${actualSeed}:${n}`, gameId: game.id, actionNumber: n, orderNumber: n,
      period, clockSeconds: seconds, clock: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
      actionType, subType, description, teamId: player.teamId!.toUpperCase(), teamTricode: player.teamId!.toUpperCase(),
      playerId: player.id, playerName: player.name, secondPlayerId: second?.id ?? null,
      scoreHome: homeScore, scoreAway: awayScore, shotResult: made == null ? null : made ? "Made" : "Missed",
      isFieldGoal: fieldGoal, points, locX: fieldGoal ? location?.x ?? null : null, locY: fieldGoal ? location?.y ?? null : null, wallMs: null });
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
    if (rng() < 0.125) {
      push(def[0]!, "rebound", "defensive", `${def[0]!.teamId!.toUpperCase()} team rebound`);
      events[events.length - 1]!.playerId = null;
      events[events.length - 1]!.playerName = null;
      return false;
    }
    const offensiveWeight = off.reduce((n, p) => n + rates.get(p.id)!.orb, 0) * mods.orb;
    const defensiveWeight = def.reduce((n, p) => n + rates.get(p.id)!.drb, 0);
    const offensive = rng() < clamp(offensiveWeight / Math.max(0.01, offensiveWeight + defensiveWeight) * 0.99 * clamp(settings?.simReboundRate ?? 1, 0.75, 1.25), 0.08, 0.42);
    const pool = offensive ? off : def;
    const p = weighted(pool, p => (offensive ? rates.get(p.id)!.orb : rates.get(p.id)!.drb) + (three && p.position !== "C" ? 0.015 : 0), rng);
    lines.get(p.id)!.rebounds++;
    if (offensive) lines.get(p.id)!.offensiveRebounds = (lines.get(p.id)!.offensiveRebounds ?? 0) + 1;
    else {
      lines.get(p.id)!.defensiveRebounds = (lines.get(p.id)!.defensiveRebounds ?? 0) + 1;
      if (rng() < .20) transitionForSide = def === homeFloor ? 0 : 1;
    }
    push(p, "rebound", offensive ? "offensive" : "defensive", `${p.name} ${offensive ? "offensive" : "defensive"} rebound`);
    return offensive;
  }
  function possession(off: GmPlayer[], def: GmPlayer[], side: number) {
    const own = side === 0 ? homeBook : awayBook;
    const other = side === 0 ? awayBook : homeBook;
    const mods = modsForTeam(own.coaching, other.coaching);
    const transition = transitionForSide === side;
    transitionForSide = null;
    const defensiveMods = modsForTeam(other.coaching, own.coaching);
    const volume = off.reduce((n, p) => n + rates.get(p.id)!.fga, 0);
    const turnovers = off.reduce((n, p) => n + rates.get(p.id)!.tov, 0);
    const freeThrows = off.reduce((n, p) => n + rates.get(p.id)!.fga * rates.get(p.id)!.ftPerFga, 0);
    const offensiveRebounds = off.reduce((n, p) => n + rates.get(p.id)!.orb, 0);
    const turnoverChance = clamp(turnovers / Math.max(0.1, volume + 0.44 * freeThrows + turnovers - offensiveRebounds) * mods.tov * 1.055 * clamp(settings?.simTurnoverRate ?? 1, 0.75, 1.25), 0.065, 0.24);
    const handler = weighted(off, p => rates.get(p.id)!.fga * playerForm.get(p.id)!.volume * usageBoost(p, own.coaching) + rates.get(p.id)!.ast, rng);
    for (const p of off) usedOnCourt.set(p.id, (usedOnCourt.get(p.id) ?? 0) + 1);
    // Most NBA personal fouls do not result in immediate free throws.
    const foulEligible = def.filter(p => (lines.get(p.id)?.personalFouls ?? 0) < 6);
    if (foulEligible.length && rng() < 0.079 * clamp(settings?.simFoulRate ?? 1, 0.75, 1.25)) {
      const fouler = weighted(foulEligible, p => p.sheet?.tendencies.foul ?? 55, rng);
      push(fouler, "foul", "personal", `${fouler.name} personal foul`);
    }
    if (rng() < turnoverChance * badges.get(handler.id)!.tov) {
      lines.get(handler.id)!.turnovers++;
      const stealShare = clamp(def.reduce((n, p) => n + rates.get(p.id)!.stl, 0) / Math.max(0.01, turnovers) * 0.96 * defensiveMods.stl, 0.2, 0.9);
      const steal = rng() < stealShare ? weighted(def, p => rates.get(p.id)!.stl, rng) : undefined;
      if (steal) {
        lines.get(steal.id)!.steals++;
        transitionForSide = side === 0 ? 1 : 0;
      }
      push(handler, "turnover", steal ? "steal" : "bad pass", `${handler.name} turnover${steal ? ` (${steal.name} steals)` : ""}`, 0, false, null, steal);
      return;
    }
    const defense = def.reduce((n, p) => {
      const a = p.sheet?.attributes, prior = p.simProfile!.baseline;
      const movement = ((a?.perimeterDefense ?? 65) - (prior.perimeterDefense ?? a?.perimeterDefense ?? 65)) * 0.06;
      const interior = ((a?.interiorDefense ?? 65) - (prior.interiorDefense ?? a?.interiorDefense ?? 65)) * 0.06;
      return n + p.ratings.defense + movement + interior;
    }, 0);
    // The impact estimate calibrates only a bounded residual around entry shot probabilities.
    // Future attribute changes move those probabilities directly.
    const baselineFga = off.reduce((n, p) => n + p.simProfile!.rates.fga, 0);
    const baselinePoints = off.reduce((n, p) => {
      const r = p.simProfile!.rates;
      return n + r.fga * (2 * (1 - r.threeShare) * r.twoPct + 3 * r.threeShare * r.threePct + r.ftPerFga * r.ftPct);
    }, 0);
    const baselineUses = off.reduce((n, p) => n + p.simProfile!.rates.fga * (1 + 0.44 * p.simProfile!.rates.ftPerFga) + p.simProfile!.rates.tov - p.simProfile!.rates.orb, 0);
    const entryImpact = off.reduce((n, p) => n + (p.simProfile!.offense ?? p.simProfile!.impact * 0.65), 0);
    const environment = game.season < 2017 ? 1.06 : 1.135;
    const residual = clamp((environment + entryImpact * 0.008 - baselinePoints / Math.max(0.2, baselineUses)) / 2.2, -0.035, 0.035);
    const fit = lineupBalance(off) * 0.002 - off.reduce((n, p) => n + (1 - roleFit(p, courtSpots.get(p.id) ?? p.position)) * 0.015, 0);
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) for (const p of off) usedOnCourt.set(p.id, (usedOnCourt.get(p.id) ?? 0) + 1);
      const shooter = weighted(off, p => rates.get(p.id)!.fga * playerForm.get(p.id)!.volume * usageBoost(p, own.coaching), rng);
      const r = rates.get(shooter.id)!;
      const line = lines.get(shooter.id)!;
      const tired = ((shooter.campFatigueGames ?? 0) > 0 ? 0.98 : 1) * secondNightScale(shooter.age, gap[side] ?? null) * minuteLoadMul(line.minutes, shooter.sheet?.attributes.stamina ?? 70) * clamp(1-Math.max(0,(stintMinutes.get(shooter.id)??0)-8)*0.003,0.95,1);
      const foulRatio = freeThrows / Math.max(0.1, volume);
      const deficit = side === 0 ? homeScore - awayScore : awayScore - homeScore;
      const deliberate = elapsed < regulation && deficit >= 1 && deficit <= 9 && elapsed >= regulation - (deficit >= 3 ? 35 : 18);
      const foulChance = deliberate ? 0.67 : clamp(foulRatio / (2 + foulRatio) * mods.ft * 0.958 * clamp(settings?.simFoulRate ?? 1, 0.75, 1.25), 0.025, 0.2);
      const canFoul = def.filter(p => (lines.get(p.id)?.personalFouls ?? 0) < 6);
      if (canFoul.length && rng() < foulChance) {
        const fouler = weighted(canFoul, p => p.sheet?.tendencies.foul ?? 55, rng);
        push(fouler, "foul", deliberate ? "intentional" : "shooting", `${fouler.name} ${deliberate ? "intentional" : "shooting"} foul on ${shooter.name}`);
        let finalMade = false;
        for (let ft = 1; ft <= 2; ft++) {
          line.fta++; finalMade = rng() < r.ftPct;
          if (finalMade) { line.ftm++; score(shooter, 1); }
          push(shooter, "freethrow", finalMade ? "made" : "missed", `${shooter.name} ${finalMade ? "makes" : "misses"} free throw ${ft} of 2`, finalMade ? 1 : 0, false, finalMade);
        }
        if (finalMade || !rebound(off, def, false)) return;
        continue;
      }
      // Trailing clubs hunt threes rather than trading slow twos in the final minute.
      const lateDeficit = side === 0 ? awayScore - homeScore : homeScore - awayScore;
      // A club down two generally looks for the tying rim attack; down three
      // must actively hunt a three. Do not fake ties or adjust the final score.
      const clutchOffense = elapsed >= regulation - 48 && elapsed < regulation;
      const lateThree = !clutchOffense ? 1
        : lateDeficit === 1 ? 0.72
        : lateDeficit === 2 ? 0.58
        : lateDeficit === 3 ? 1.62
        : lateDeficit >= 4 && lateDeficit <= 12 ? 1.34 : 1;
      const three = rng() < clamp(r.threeShare * mods.three * 1.04 * lateThree * clamp(settings?.simThreeRate ?? 1, 0.75, 1.25), 0, 0.88);
      const shot = chooseSimShot(shooter, three, rng, attempt > 0, transition);
      const blockWeight = three ? 0.3 : 0.95;
      const blocked = rng() < clamp(def.reduce((n, p) => n + rates.get(p.id)!.blk, 0) / Math.max(0.1, baselineFga) * blockWeight / averageBlockWeight * 0.98 * defensiveMods.blk, 0.005, 0.2);
      const blocker = blocked ? weighted(def, p => rates.get(p.id)!.blk, rng) : undefined;
      const homeAdvantage = side === 0 && !game.neutral ? 0.009 : 0;
      const passing = off.filter(p => p.id !== shooter.id).reduce((n,p) => n+badges.get(p.id)!.passing,0) / Math.max(1,off.length-1);
      const badgeDefense = def.reduce((n,p) => n+badges.get(p.id)!.defense,0) / Math.max(1,def.length);
      const closeLate = (elapsed >= 2640) && Math.abs(homeScore-awayScore) <= 10;
      const pct = (three ? r.threePct - 0.005 : r.twoPct * mods.two + shot.twoDelta - 0.008) * tired + playerForm.get(shooter.id)!.shot + teamForm[side]!.shot + (clamp(settings?.simShotAccuracy ?? 1, 0.75, 1.25) - 1) * 0.11 + residual + fit - defense * 0.003 + homeAdvantage + (coach[side]!.offense - coach[1 - side]!.defense) * 0.002 + passing - badgeDefense + clamp((projectedImpact[side]! - projectedImpact[1 - side]!) * 0.0042, -0.030, 0.030) + (closeLate ? badges.get(shooter.id)!.clutch : 0);
      // Observed shooting percentages already include average blocked attempts.
      // Convert to an unblocked attempt probability; opponent block skill can then vary.
      const observedBlockShare = clamp(leagueBlockRate * blockWeight / averageBlockWeight, 0, 0.2);
      const made = !blocked && rng() < clamp(pct / (1 - observedBlockShare), 0.08, 0.95);
      line.fga++; if (three) line.tpa++;
      const assisted = made && rng() < clamp(off.reduce((n, p) => n + rates.get(p.id)!.ast, 0) / Math.max(0.2, volume) / 0.47 * mods.ast * 1.0 * clamp(settings?.simAssistRate ?? 1, 0.75, 1.25), 0.18, 0.85);
      const passer = assisted ? weighted(off.filter(p => p.id !== shooter.id), p => rates.get(p.id)!.ast, rng) : undefined;
      if (made) { line.fgm++; if (three) line.tpm++; score(shooter, three ? 3 : 2); }
      if (passer) lines.get(passer.id)!.assists++;
      if (blocker) lines.get(blocker.id)!.blocks++;
      push(shooter, three ? "3pt" : "2pt", shot.subType, `${shooter.name} ${made ? "makes" : "misses"} ${shot.label}${passer ? ` (${passer.name} assists)` : blocker ? ` (${blocker.name} blocks)` : ""}`, made ? three ? 3 : 2 : 0, true, made, passer ?? blocker, shot);
      if (made || !rebound(off, def, three)) return;
    }
  }
  function runFrame(start: number, duration: number, slot: number, possessions: number, extra = false) {
    function selectFloor(b: ReturnType<typeof book>, side: number) {
      const seats = { ...(extra ? b.closingFrame : b.frames[slot]!) };
      const floorIds = new Set(Object.values(seats).filter((id): id is string => Boolean(id)));
      const spread = Math.abs(homeScore - awayScore);
      const blowout = !extra && start >= regulation - 360 && spread >= 22;
      const lateClose = !extra && start >= regulation - 240 && spread <= 8;
      // Saved shift charts are explicit instructions even in older saves
      // without the manual-mode flag. Never override them for routine rest.
      const manual = b.coaching.rotationMode === "manual" || Boolean(b.coaching.shifts && Object.keys(b.coaching.shifts).length);
      const frameRng = createRng((actualSeed ^ hash(b.roster[0]!.teamId! + ":" + slot)) >>> 0);
      for (const [pos, id] of Object.entries(seats)) {
        if (!id) continue;
        const fouledOut = (lines.get(id)?.personalFouls ?? 0) >= 6;
        const bench = !b.openingIds.has(id);
        const shouldRest = !manual && blowout && b.openingIds.has(id) && frameRng() < 0.70;
        const restoreStarter = !manual && lateClose && bench;
        // One shift may move by 2 minutes, without changing the coach's plan
        // wholesale. Manual minutes are respected except on foul-outs.
        const routine = !manual && !blowout && !lateClose && bench && slot > 0 && slot < 22 && frameRng() < 0.05;
        if (!fouledOut && !shouldRest && !restoreStarter && !routine) continue;
        const candidates = b.roster.filter(p => !floorIds.has(p.id) && (lines.get(p.id)?.personalFouls ?? 0) < 6
          && (!shouldRest || !b.openingIds.has(p.id)) && (!restoreStarter || b.openingIds.has(p.id))
          && (fouledOut || shouldRest || (b.minutes[p.id] ?? 0) > 0));
        if (!candidates.length) continue;
        const position = pos as GmPlayer["position"];
        candidates.sort((a, b) => roleFit(b, position) - roleFit(a, position)
          || (shouldRest ? (a.minutesPreference - b.minutesPreference) : (b.minutesPreference - a.minutesPreference))
          || a.id.localeCompare(b.id));
        const replacement = candidates[0]!;
        floorIds.delete(id);
        floorIds.add(replacement.id);
        seats[position] = replacement.id;
      }
      const group = Object.values(seats).map(id => byId.get(id ?? ""))
        .filter((p): p is GmPlayer => Boolean(p && p.teamId === b.roster[0]!.teamId && (!p.injury || p.injury.gamesRemaining <= 0)));
      if (group.length !== 5 || new Set(group.map(p => p.id)).size !== 5) throw new Error("Live game substitutions must field five distinct players.");
      return { group, seats, side };
    }
    const previousFloor = [...homeFloor, ...awayFloor];
    const homeNow = selectFloor(homeBook, 0);
    const awayNow = selectFloor(awayBook, 1);
    homeFloor = homeNow.group;
    awayFloor = awayNow.group;
    for (const p of previousFloor) if (![...homeFloor, ...awayFloor].some(q => q.id === p.id)) stintMinutes.set(p.id, 0);
    stints.push({ start, end: start + duration, home: homeFloor.map(p => p.id), away: awayFloor.map(p => p.id) });
    for (const { group, seats } of [homeNow, awayNow]) {
      for (const [spot, id] of Object.entries(seats)) if (id) courtSpots.set(id, spot as GmPlayer["position"]);
      for (const p of group) stintMinutes.set(p.id, (slot % 6 === 0 && !extra ? 0 : stintMinutes.get(p.id) ?? 0) + duration / 60);
      for (const p of group) {
        if (!extra && slot < 24) actualShiftSlots.get(p.id)![slot] = true;
        const line = lines.get(p.id)!;
        line.minutes += duration / 60;
        for (const [position, id] of Object.entries(seats)) if (id === p.id) {
          const key = position as GmPlayer["position"];
          line.positionMinutes = { ...line.positionMinutes, [key]: (line.positionMinutes?.[key] ?? 0) + duration / 60 };
        }
      }
    }
    // Randomized real-time event spacing replaces two hard-coded timestamps
    // per paired possession. Separate clock RNG preserves shooter outcomes.
    const moments = frameActionTimes(start, duration, possessions * 2, clockRng);
    const firstSide = (homeStarts ? 0 : 1) ^ (slot & 1);
    for (let i = 0; i < moments.length; i++) {
      const side = (firstSide + i) % 2;
      elapsed = moments[i]!;
      if (side === 0) possession(homeFloor, awayFloor, 0);
      else possession(awayFloor, homeFloor, 1);
    }
    totalPossessions += possessions;
  }
  for (let start = 0, slot = 0; start < regulation; start += 120, slot++) {
    const duration = Math.min(120, regulation - start);
    const n = Math.round(possessionsPerSide * (start + duration) / regulation) - Math.round(possessionsPerSide * start / regulation);
    runFrame(start, duration, slot, n);
  }
  // A made basket with time on the clock can leave a final inbound/timeout
  // possession. The older engine ended the game at the last regular scheduled
  // action, frequently denying the trailing team a realistic tying attempt.
  // Offer one *actual* event-generating late possession, never a scripted tie.
  const finalGap = Math.abs(homeScore - awayScore);
  if (span >= 0.999 && finalGap >= 1 && finalGap <= 3 && regulation - elapsed >= 2.5) {
    const trailing: 0 | 1 = homeScore < awayScore ? 0 : 1;
    const trailingId = trailing === 0 ? home!.id.toUpperCase() : away!.id.toUpperCase();
    const recent = [...events].reverse().find(e => e.isFieldGoal || e.actionType === "freethrow" || e.actionType === "turnover");
    const probability = recent?.teamId === trailingId ? 0.28 : 0.78;
    if (clockRng() < probability) {
      elapsed += Math.min(6, (regulation - elapsed) * 0.64);
      if (trailing === 0) possession(homeFloor, awayFloor, 0);
      else possession(awayFloor, homeFloor, 1);
      totalPossessions++;
    }
  }
  while (homeScore === awayScore) {
    const start = regulation + overtime * 300;
    overtime++;
    for (let offset = 0; offset < 300; offset += 120) runFrame(start + offset, Math.min(120, 300 - offset), 23, Math.max(1, Math.round(pace * Math.min(120, 300 - offset) / 2880)), true);
  }
  const played = [...lines.values()].filter(line => line.minutes > 0);
  for (const line of played) {
    const team = line.teamId === home.id ? home : away;
    line.started = (team.id === home.id ? homeBook : awayBook).openingIds.has(line.playerId);
    line.trueShootingPct = line.points / Math.max(1, 2 * (line.fga + 0.44 * line.fta));
    line.usagePct = (line.fga + 0.44 * line.fta + line.turnovers) / Math.max(1, usedOnCourt.get(line.playerId) ?? 1);
    // Hollinger Game Score: use actual offensive/defensive boards and foul penalty.
    line.gameScore = Math.round((line.points + 0.4 * line.fgm - 0.7 * line.fga - 0.4 * (line.fta - line.ftm) + 0.7 * (line.offensiveRebounds ?? 0) + 0.3 * (line.defensiveRebounds ?? 0) + line.steals + 0.7 * line.assists + 0.7 * line.blocks - 0.4 * (line.personalFouls ?? 0) - line.turnovers) * 10) / 10;
  }
  const box: GmBoxScore = { id: `box_${game.id}_${actualSeed}`, gameId: game.id, season: game.season, day: game.day, homeTeamId: home.id, awayTeamId: away.id,
    homeScore, awayScore, possessions: Math.round(totalPossessions / actionSequenceFactor), players: played, events, stints, overtime, postseason: game.postseason,
    shiftPlan: homeBook.rows.map(row => ({ playerId: row.id, playerName: byId.get(row.id)!.name, on: actualShiftSlots.get(row.id) ?? row.on })) };
  return { game: { ...game, played: true, homeScore, awayScore, boxScoreId: box.id }, box };
}

/** Actual regulation substitutions recorded from played stints.
 * Never replace this with a fresh pregame preview: foul trouble and garbage
 * time can change who actually took the court, including for away teams.
 */
export function actualShiftSnapshot(box: GmBoxScore, teamId: string): NonNullable<GmBoxScore["shiftPlan"]> {
  const side = box.homeTeamId === teamId ? "home" : box.awayTeamId === teamId ? "away" : null;
  if (!side || !box.stints?.length) return [];
  const regulation = box.stints.filter(stint => stint.start < 2880).slice(0, 24);
  const names = new Map(box.players.map(line => [line.playerId, line.playerName]));
  const ids = new Set<string>();
  for (const stint of regulation) for (const id of stint[side]) ids.add(id);
  return [...ids].map(id => ({
    playerId: id,
    playerName: names.get(id) ?? id,
    on: Array.from({ length: 24 }, (_, slot) => regulation[slot]?.[side].includes(id) ?? false),
  }));
}

/** Keep detailed feeds for the user's games without filling saves with CPU event logs. */
export function compactSimBox(box: GmBoxScore, userTeamId: string): GmBoxScore {
  return box.homeTeamId === userTeamId || box.awayTeamId === userTeamId ? box : { ...box, events: undefined, stints: undefined, shiftPlan: undefined };
}
