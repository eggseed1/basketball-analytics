/**
 * Bake possession-level on/off, with/without pairs and five-man lineups from
 * NBA play-by-play, one file per team-season plus a league summary.
 *
 *   npx tsx scripts/build-runtime-onoff.ts 2025-26 [2024-25 ...]
 *
 * Reuses the DRBL raw cache (data/drbl/raw) and its validated lineup and
 * possession reconstruction. Quarantined games are skipped, not patched.
 * Writes public/runtime/on-off/{season}/{nbaTeamId}.json and league.json.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames, processGame } from "../drbl/index";
import type { DrblEvent, DrblPossession, DrblProcessedGame } from "../drbl/types";
import { NBA_TEAM_META } from "../src/data/providers/nba/nba-team-meta";
import { Z95 } from "../src/lib/on-off/derive";
import {
  CLUTCH_MARGIN,
  CLUTCH_SECONDS,
  K,
  ON_OFF_KEYS,
  ON_OFF_VIEWS,
  addVec,
  compareOnOff,
  emptyVec,
  garbageMarginThreshold,
  HEAVE_SECONDS,
  toRatingVec,
  type LeagueRates,
  type OnOffSplit,
  type OnOffVec,
  type OnOffView,
} from "../src/lib/on-off/metrics";
import {
  ON_OFF_FILE_VERSION,
  PAIR_MIN_POSS,
  onOffDir,
  type LeagueOnOffFile,
  type OnOffGameLog,
  type OnOffGameRow,
  type OnOffManifest,
  type OnOffPhase,
  type OnOffSharedWindow,
  type OnOffViews,
  type TeamOnOffFile,
} from "../src/lib/on-off/types";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public", "runtime", "on-off");
const DELAY_MS = Number(process.env.ONOFF_DELAY_MS ?? "0");
const LINEUPS_PER_TEAM = 30;
const LINEUP_MIN_POSS = 40;

const RIM_FEET = 4;
const SHORT_MID_FEET = 14;
/** Legacy y (tenths of a foot from the rim) where the corner-3 straightaway ends. */
const CORNER3_MAX_Y = 87.5;

type Views = Record<OnOffView, OnOffSplit>;
/** Schedule indexes of a player's first and last game with the team. */
type Window = [number, number];
const emptySplit = (): OnOffSplit => ({ o: emptyVec(), d: emptyVec() });
const emptyViews = (): Views => ({ clean: emptySplit(), all: emptySplit(), clutch: emptySplit() });

/** Season DRBL/100 by NBA person id, from the published season artifact. */
type Ratings = Map<string, number>;

async function loadRatings(season: string): Promise<Ratings> {
  const file = path.join(ROOT, "src", "data", "drbl", "precomputed", `${season}.json`);
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as {
      players?: Array<{ playerId: string; drbl100: number | null }>;
    };
    return new Map(
      (data.players ?? [])
        .filter((p) => p.drbl100 != null && Number.isFinite(p.drbl100))
        .map((p) => [String(p.playerId), p.drbl100!])
    );
  } catch {
    return new Map();
  }
}

function qualitySums(ids: readonly string[], ratings: Ratings): [number, number] {
  let sum = 0;
  let n = 0;
  for (const id of ids) {
    const r = ratings.get(id);
    if (r == null) continue;
    sum += r;
    n += 1;
  }
  return [sum, n];
}

/** Per game: [offense poss, points scored, defense poss, points allowed] for clean and all. */
type GameTotals = { clean: number[]; all: number[] };
type GameLogAcc = Map<string, GameTotals>;

/** Full stat vectors per game, summed over a stint window at write time. */
type ByGame = Map<string, Views>;

type PlayerAcc = {
  name: string;
  games: Set<string>;
  starts: number;
  views: Views;
  log: GameLogAcc;
  byGame: ByGame;
};
type TeamAcc = {
  games: Set<string>;
  views: Views;
  log: GameLogAcc;
  byGame: ByGame;
  players: Map<string, PlayerAcc>;
  pairs: Map<string, Views>;
  lineups: Map<string, Views>;
};

type ScheduleAcc = Map<string, { date: string; home: string; away: string }>;

const newPlayer = (name: string, starts: number): PlayerAcc => ({
  name,
  games: new Set(),
  starts,
  views: emptyViews(),
  log: new Map(),
  byGame: new Map(),
});

function gameViews(byGame: ByGame, gameId: string): Views {
  let views = byGame.get(gameId);
  if (!views) {
    views = emptyViews();
    byGame.set(gameId, views);
  }
  return views;
}

function sumGames(byGame: ByGame, gameIds: readonly string[]): Views {
  const out = emptyViews();
  for (const id of gameIds) {
    const views = byGame.get(id);
    if (!views) continue;
    for (const view of ON_OFF_VIEWS) {
      addVec(out[view].o, views[view].o);
      addVec(out[view].d, views[view].d);
    }
  }
  return out;
}

function addToLog(log: GameLogAcc, gameId: string, side: "o" | "d", v: OnOffVec, ctx: PossessionContext) {
  let row = log.get(gameId);
  if (!row) {
    row = { clean: [0, 0, 0, 0], all: [0, 0, 0, 0] };
    log.set(gameId, row);
  }
  const at = side === "o" ? 0 : 2;
  for (const view of ctx.clean ? (["all", "clean"] as const) : (["all"] as const)) {
    row[view][at]! += v[K.poss]!;
    row[view][at + 1]! += v[K.pts]!;
  }
}

function finishLog(log: GameLogAcc, index: Map<string, number>): OnOffGameLog {
  const rows = [...log.entries()]
    .filter(([id]) => index.has(id))
    .sort((a, b) => index.get(a[0])! - index.get(b[0])!);
  const pick = (view: "clean" | "all"): OnOffGameRow[] =>
    rows
      .filter(([, t]) => t[view][0]! + t[view][2]! > 0)
      .map(([id, t]) => [index.get(id)!, ...t[view]] as OnOffGameRow);
  return { clean: pick("clean"), all: pick("all") };
}

function log(message: string) {
  console.log(`[on-off] ${message}`);
}

function teamAcc(map: Map<string, TeamAcc>, teamId: string): TeamAcc {
  let t = map.get(teamId);
  if (!t) {
    t = {
      games: new Set(),
      views: emptyViews(),
      log: new Map(),
      byGame: new Map(),
      players: new Map(),
      pairs: new Map(),
      lineups: new Map(),
    };
    map.set(teamId, t);
  }
  return t;
}

function periodLength(period: number): number {
  return period <= 4 ? 720 : 300;
}

/** Offense stat vector for one possession, from its own events. */
function possessionVec(
  poss: DrblPossession,
  events: Map<number, DrblEvent>,
  seconds: number,
  oppStarters: number
): OnOffVec {
  const v = emptyVec();
  v[K.poss] = 1;
  v[K.pts] = poss.points;
  v[K.pts2] = poss.points * poss.points;
  v[K.sec] = seconds;
  v[K.oppStarters] = oppStarters;
  for (const n of poss.eventActionNumbers) {
    const e = events.get(n);
    if (!e) continue;
    const isOffense = e.teamId === poss.offenseTeamId;
    if (e.isFieldGoal && isOffense) {
      const made = e.shotResult === "Made" ? 1 : 0;
      v[K.fga]! += 1;
      v[K.fgm]! += made;
      if (made && e.assistPlayerId) v[K.astFgm]! += 1;
      const three = e.actionType === "3pt";
      if (three) {
        v[K.fg3a]! += 1;
        v[K.fg3m]! += made;
      }
      if (e.x != null && e.y != null) {
        if (three) {
          if (e.y <= CORNER3_MAX_Y) {
            v[K.corner3A]! += 1;
            v[K.corner3M]! += made;
          }
        } else {
          const feet = Math.hypot(e.x, e.y) / 10;
          if (feet < RIM_FEET) {
            v[K.rimA]! += 1;
            v[K.rimM]! += made;
          } else if (feet < SHORT_MID_FEET) {
            v[K.shortMidA]! += 1;
            v[K.shortMidM]! += made;
          } else {
            v[K.longMidA]! += 1;
            v[K.longMidM]! += made;
          }
        }
      }
    } else if (e.actionType === "freethrow" && isOffense) {
      v[K.fta]! += 1;
      if (e.shotResult === "Made") v[K.ftm]! += 1;
    } else if (e.actionType === "turnover" && isOffense) {
      v[K.tov]! += 1;
    } else if (e.actionType === "rebound" && !e.qualifiers.includes("deadball") && e.teamId) {
      v[K.orbChances]! += 1;
      if (isOffense) v[K.orb]! += 1;
    }
  }
  return v;
}

type PossessionContext = {
  poss: DrblPossession;
  seconds: number;
  startClock: number;
  clean: boolean;
  clutch: boolean;
};

/**
 * Splits each period's clock across its possessions (previous end to this
 * end), then flags garbage time and end-of-quarter heaves.
 */
function possessionContexts(g: DrblProcessedGame, starters: Set<string>): PossessionContext[] {
  const scoreBefore = new Map<number, { home: number; away: number }>();
  let home = 0;
  let away = 0;
  for (const e of [...g.events].sort((a, b) => a.orderNumber - b.orderNumber)) {
    scoreBefore.set(e.actionNumber, { home, away });
    home = e.scoreHome || home;
    away = e.scoreAway || away;
  }

  const out: PossessionContext[] = [];
  const byPeriod = new Map<number, DrblPossession[]>();
  for (const p of g.possessions) {
    const list = byPeriod.get(p.period) ?? [];
    list.push(p);
    byPeriod.set(p.period, list);
  }
  for (const [period, list] of byPeriod) {
    list.sort((a, b) => a.startActionNumber - b.startActionNumber);
    let prevEnd = periodLength(period);
    list.forEach((p, i) => {
      const end = i === list.length - 1 ? 0 : Math.min(prevEnd, p.endClockSeconds);
      out.push({
        poss: p,
        seconds: Math.max(0, prevEnd - end),
        startClock: prevEnd,
        clean: true,
        clutch: false,
      });
      prevEnd = end;
    });
  }

  const marginAt = (p: DrblPossession) => {
    const s = scoreBefore.get(p.eventActionNumbers[0] ?? p.startActionNumber);
    return s ? Math.abs(s.home - s.away) : null;
  };
  for (const ctx of out) {
    if (ctx.startClock <= HEAVE_SECONDS) ctx.clean = false;
    if (ctx.poss.period >= 4 && ctx.startClock <= CLUTCH_SECONDS) {
      const margin = marginAt(ctx.poss);
      ctx.clutch = margin != null && margin <= CLUTCH_MARGIN;
    }
  }

  // Garbage time only exists if regulation decided the game, and only in the
  // final unbroken run of qualifying 4th-quarter possessions.
  const wentToOt = g.possessions.some((p) => p.period > 4);
  if (!wentToOt) {
    const q4 = out
      .filter((c) => c.poss.period === 4)
      .sort((a, b) => a.poss.startActionNumber - b.poss.startActionNumber);
    for (let i = q4.length - 1; i >= 0; i--) {
      const c = q4[i]!;
      const margin = marginAt(c.poss);
      if (margin == null) break;
      const startersOn = [...c.poss.offensePlayerIds, ...c.poss.defensePlayerIds].filter((id) =>
        starters.has(id)
      ).length;
      if (margin >= garbageMarginThreshold(c.startClock) && startersOn <= 2) c.clean = false;
      else break;
    }
  }
  return out;
}

function addToViews(views: Views, side: "o" | "d", v: OnOffVec, ctx: PossessionContext) {
  addVec(views.all[side], v);
  if (ctx.clean) addVec(views.clean[side], v);
  if (ctx.clutch) addVec(views.clutch[side], v);
}

function accumulateGame(
  g: DrblProcessedGame,
  teams: Map<string, TeamAcc>,
  ratings: Ratings,
  schedule: ScheduleAcc
) {
  const events = new Map(g.events.map((e) => [e.actionNumber, e]));
  const names = new Map(g.box.players.map((p) => [p.playerId, p.playerName]));
  const starters = new Set(g.box.players.filter((p) => p.starter).map((p) => p.playerId));
  schedule.set(g.meta.gameId, { date: g.meta.gameDate, home: g.box.homeTeamId, away: g.box.awayTeamId });

  for (const teamId of [g.box.homeTeamId, g.box.awayTeamId]) {
    const t = teamAcc(teams, teamId);
    t.games.add(g.meta.gameId);
    for (const p of g.box.players) {
      if (p.teamId !== teamId || !p.starter) continue;
      const acc = t.players.get(p.playerId);
      if (acc) acc.starts += 1;
      else t.players.set(p.playerId, newPlayer(p.playerName, 1));
    }
  }

  for (const ctx of possessionContexts(g, starters)) {
    const { poss } = ctx;
    if (poss.offensePlayerIds.length !== 5 || poss.defensePlayerIds.length !== 5) continue;
    const oppStartersOnD = poss.offensePlayerIds.filter((id) => starters.has(id)).length;
    const oppStartersOnO = poss.defensePlayerIds.filter((id) => starters.has(id)).length;
    const v = possessionVec(poss, events, ctx.seconds, oppStartersOnO);
    const [offQ, offQN] = qualitySums(poss.offensePlayerIds, ratings);
    const [defQ, defQN] = qualitySums(poss.defensePlayerIds, ratings);
    v[K.ownQ] = offQ;
    v[K.ownQN] = offQN;
    v[K.oppQ] = defQ;
    v[K.oppQN] = defQN;
    const vForDefense = [...v];
    vForDefense[K.oppStarters] = oppStartersOnD;
    vForDefense[K.ownQ] = defQ;
    vForDefense[K.ownQN] = defQN;
    vForDefense[K.oppQ] = offQ;
    vForDefense[K.oppQN] = offQN;

    for (const [teamId, side, ids, vec] of [
      [poss.offenseTeamId, "o", poss.offensePlayerIds, v],
      [poss.defenseTeamId, "d", poss.defensePlayerIds, vForDefense],
    ] as const) {
      const t = teamAcc(teams, teamId);
      addToViews(t.views, side, vec, ctx);
      addToViews(gameViews(t.byGame, poss.gameId), side, vec, ctx);
      addToLog(t.log, poss.gameId, side, vec, ctx);
      const sorted = [...ids].sort();
      for (const id of sorted) {
        let acc = t.players.get(id);
        if (!acc) {
          acc = newPlayer(names.get(id) ?? id, 0);
          t.players.set(id, acc);
        }
        acc.games.add(poss.gameId);
        addToViews(acc.views, side, vec, ctx);
        addToViews(gameViews(acc.byGame, poss.gameId), side, vec, ctx);
        addToLog(acc.log, poss.gameId, side, vec, ctx);
      }
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}|${sorted[j]}`;
          let pair = t.pairs.get(key);
          if (!pair) {
            pair = emptyViews();
            t.pairs.set(key, pair);
          }
          addToViews(pair, side, vec, ctx);
        }
      }
      const lineupKey = sorted.join("|");
      let lineup = t.lineups.get(lineupKey);
      if (!lineup) {
        lineup = emptyViews();
        t.lineups.set(lineupKey, lineup);
      }
      addToViews(lineup, side, vec, ctx);
    }
  }
}

const totalPoss = (views: Views) => views.all.o[K.poss]! + views.all.d[K.poss]!;

const round = (v: OnOffVec): OnOffVec => v.map((x) => Math.round(x * 10) / 10);
const roundViews = (views: Views): OnOffViews =>
  Object.fromEntries(
    ON_OFF_VIEWS.map((view) => [view, { o: round(views[view].o), d: round(views[view].d) }])
  ) as OnOffViews;

const ratingViews = (views: Views): OnOffViews =>
  Object.fromEntries(
    ON_OFF_VIEWS.map((view) => [
      view,
      { o: toRatingVec(round(views[view].o)), d: toRatingVec(round(views[view].d)) },
    ])
  ) as OnOffViews;

function leagueRates(teams: Map<string, TeamAcc>, view: OnOffView): LeagueRates {
  const sum = emptyVec();
  for (const t of teams.values()) addVec(sum, t.views[view].o);
  const n = sum[K.poss]!;
  const mean = n > 0 ? sum[K.pts]! / n : 0;
  return {
    fg3Pct: sum[K.fg3a]! > 0 ? sum[K.fg3m]! / sum[K.fg3a]! : 0,
    ftPct: sum[K.fta]! > 0 ? sum[K.ftm]! / sum[K.fta]! : 0,
    pppVar: n > 0 ? sum[K.pts2]! / n - mean * mean : 1.2,
  };
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

async function buildSeason(season: string, phase: OnOffPhase) {
  const label = phase === "playoffs" ? `${season} playoffs` : season;
  const games = await listSeasonGames(season, {
    seasonType: phase === "playoffs" ? "Playoffs" : "Regular Season",
  });
  const ratings = await loadRatings(season);
  log(`${label}: ${games.length} games listed, ${ratings.size} rated players`);
  const teams = new Map<string, TeamAcc>();
  const schedule: ScheduleAcc = new Map();
  let processed = 0;
  let quarantined = 0;
  let failed = 0;
  let minuteErr = 0;
  let minuteRows = 0;

  for (let i = 0; i < games.length; i++) {
    try {
      const g = await processGame(games[i]!, { persist: false });
      if (g.reconcile.quarantined) {
        quarantined += 1;
        continue;
      }
      accumulateGame(g, teams, ratings, schedule);
      processed += 1;
      for (const d of g.reconcile.lineup?.playerMinuteDiffs ?? []) {
        minuteErr += Math.abs(d.delta);
        minuteRows += 1;
      }
    } catch {
      failed += 1;
    }
    if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));
    if ((i + 1) % 200 === 0) log(`${label}: ${i + 1}/${games.length}`);
  }
  log(
    `${label}: processed=${processed} quarantined=${quarantined} failed=${failed}` +
      (minuteRows ? ` lineupMinuteMAE=${(minuteErr / minuteRows).toFixed(2)}` : "")
  );
  if (!processed) return null;

  const dir = path.join(OUT_ROOT, onOffDir(season, phase));
  const generatedAt = new Date().toISOString();
  const rates = Object.fromEntries(
    ON_OFF_VIEWS.map((view) => [view, leagueRates(teams, view)])
  ) as Record<OnOffView, LeagueRates>;
  const leaguePlayers: LeagueOnOffFile["players"] = [];
  const teamIds: string[] = [];

  for (const [teamId, t] of teams) {
    const meta = NBA_TEAM_META[teamId];
    if (!meta) continue;
    teamIds.push(teamId);
    const players = [...t.players.entries()]
      .filter(([, p]) => totalPoss(p.views) > 0)
      .sort((a, b) => totalPoss(b[1].views) - totalPoss(a[1].views));
    const pairMin = PAIR_MIN_POSS[phase];
    const pairEligible = new Set(
      players.filter(([, p]) => totalPoss(p.views) >= pairMin).map(([id]) => id)
    );
    const teamSchedule = [...t.games]
      .map((id) => ({ id, ...schedule.get(id)! }))
      .filter((s) => s.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const index = new Map(teamSchedule.map((s, i) => [s.id, i]));
    const lastIndex = teamSchedule.length - 1;
    const windows = new Map<string, Window>();
    for (const [id, p] of players) {
      const at = [...p.games].map((g) => index.get(g)).filter((i): i is number => i != null);
      if (at.length) windows.set(id, [Math.min(...at), Math.max(...at)]);
    }
    const isFull = (w: Window | undefined) => !w || (w[0] === 0 && w[1] === lastIndex);
    const sameWindow = (a: Window, b: Window) => a[0] === b[0] && a[1] === b[1];
    const gamesIn = (w: Window) => teamSchedule.slice(w[0], w[1] + 1).map((s) => s.id);
    const stintTeam = new Map<string, Views>();
    for (const [id] of players) {
      const w = windows.get(id);
      stintTeam.set(id, isFull(w) ? t.views : sumGames(t.byGame, gamesIn(w!)));
    }
    const sharedWindow = (a: string, b: string): OnOffSharedWindow | undefined => {
      const wa = windows.get(a);
      const wb = windows.get(b);
      if (!wa || !wb) return undefined;
      const w: Window = [Math.max(wa[0], wb[0]), Math.min(wa[1], wb[1])];
      if (w[0] > w[1] || isFull(w)) return undefined;
      const ids = gamesIn(w);
      const shared: OnOffSharedWindow = { team: ratingViews(sumGames(t.byGame, ids)) };
      if (!sameWindow(wa, w)) shared.a = ratingViews(sumGames(t.players.get(a)!.byGame, ids));
      if (!sameWindow(wb, w)) shared.b = ratingViews(sumGames(t.players.get(b)!.byGame, ids));
      return shared;
    };
    const file: TeamOnOffFile = {
      version: ON_OFF_FILE_VERSION,
      season,
      phase,
      teamId,
      teamAbbr: meta.abbreviation,
      generatedAt,
      games: t.games.size,
      keys: ON_OFF_KEYS,
      schedule: teamSchedule.map((s) => {
        const home = s.home === teamId;
        return {
          id: s.id,
          date: s.date,
          opp: NBA_TEAM_META[home ? s.away : s.home]?.abbreviation ?? "",
          home,
        };
      }),
      team: roundViews(t.views),
      teamLog: finishLog(t.log, index),
      players: players.map(([id, p]) => ({
        id,
        name: p.name,
        gp: p.games.size,
        starts: p.starts,
        rating: ratings.get(id) ?? null,
        log: finishLog(p.log, index),
        ...(isFull(windows.get(id))
          ? {}
          : {
              stint: {
                first: windows.get(id)![0],
                last: windows.get(id)![1],
                team: roundViews(stintTeam.get(id)!),
              },
            }),
        ...roundViews(p.views),
      })),
      pairs: [...t.pairs.entries()]
        .filter(([key]) => {
          const [a, b] = key.split("|");
          return pairEligible.has(a!) && pairEligible.has(b!);
        })
        .map(([key, views]) => {
          const [a, b] = key.split("|");
          const shared = sharedWindow(a!, b!);
          return { a: a!, b: b!, ...(shared ? { shared } : {}), ...roundViews(views) };
        }),
      lineups: [...t.lineups.entries()]
        .filter(([, views]) => totalPoss(views) >= LINEUP_MIN_POSS)
        .sort((a, b) => totalPoss(b[1]) - totalPoss(a[1]))
        .slice(0, LINEUPS_PER_TEAM)
        .map(([key, views]) => ({ ids: key.split("|"), ...roundViews(views) })),
    };
    await writeJson(path.join(dir, `${teamId}.json`), file);

    for (const [id, p] of players) {
      const team = stintTeam.get(id)!;
      const cmp = ON_OFF_VIEWS.map((view) => compareOnOff(team[view], p.views[view], rates[view]));
      const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
      const range = (c: (typeof cmp)[number]): [number, number] | null =>
        c.netDiff == null || c.netDiffSe == null
          ? null
          : [r1(c.netDiff - Z95 * c.netDiffSe)!, r1(c.netDiff + Z95 * c.netDiffSe)!];
      const perView = <T>(f: (i: number) => T): [T, T, T] => [f(0), f(1), f(2)];
      const possIn = (s: OnOffSplit) => s.o[K.poss]! + s.d[K.poss]!;
      leaguePlayers.push({
        id,
        teamId,
        name: p.name,
        gp: p.games.size,
        poss: perView((i) => possIn(p.views[ON_OFF_VIEWS[i]!])),
        offPoss: perView((i) => {
          const view = ON_OFF_VIEWS[i]!;
          return possIn(team[view]) - possIn(p.views[view]);
        }),
        netDiff: perView((i) => r1(cmp[i]!.netDiff)),
        netDiffRange: perView((i) => range(cmp[i]!)),
        netLuckAdjDiff: perView((i) => r1(cmp[i]!.netLuckAdjDiff)),
        ortgDiff: perView((i) => r1(cmp[i]!.ortgDiff)),
        drtgDiff: perView((i) => r1(cmp[i]!.drtgDiff)),
      });
    }
  }

  const league: LeagueOnOffFile = {
    version: ON_OFF_FILE_VERSION,
    season,
    phase,
    generatedAt,
    games: processed,
    gamesQuarantined: quarantined + failed,
    rates,
    players: leaguePlayers,
  };
  await writeJson(path.join(dir, "league.json"), league);
  log(`${label}: wrote ${teamIds.length} team files, ${leaguePlayers.length} player rows`);
  return { games: processed, teams: teamIds.sort() };
}

async function main() {
  const seasons = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  if (!seasons.length) {
    throw new Error("usage: build-runtime-onoff.ts <season> [season ...] [--playoffs]");
  }
  const phase: OnOffPhase = process.argv.includes("--playoffs") ? "playoffs" : "regular";

  const manifestPath = path.join(OUT_ROOT, "manifest.json");
  let manifest: OnOffManifest = { version: ON_OFF_FILE_VERSION, generatedAt: "", seasons: [] };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as OnOffManifest;
  } catch {
    // first run
  }

  let changed = false;
  for (const season of seasons) {
    const built = await buildSeason(season, phase);
    if (!built) {
      log(`${season} ${phase}: nothing processed, manifest unchanged`);
      continue;
    }
    const prior = manifest.seasons.find((s) => s.season === season);
    if (phase === "regular") {
      manifest.seasons = [
        ...manifest.seasons.filter((s) => s.season !== season),
        { season, ...built, ...(prior?.playoffs ? { playoffs: prior.playoffs } : {}) },
      ];
    } else if (prior) {
      prior.playoffs = built;
    } else {
      log(`${season}: playoffs built before the regular season, not listed in the manifest`);
      continue;
    }
    changed = true;
    manifest.seasons.sort((a, b) => b.season.localeCompare(a.season));
  }
  if (!changed) return;
  manifest.version = ON_OFF_FILE_VERSION;
  manifest.generatedAt = new Date().toISOString();
  await writeJson(manifestPath, manifest);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
