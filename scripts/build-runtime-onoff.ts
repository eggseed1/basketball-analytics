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
import {
  K,
  ON_OFF_KEYS,
  addVec,
  compareOnOff,
  emptyVec,
  garbageMarginThreshold,
  HEAVE_SECONDS,
  type LeagueRates,
  type OnOffSplit,
  type OnOffVec,
  type OnOffView,
} from "../src/lib/on-off/metrics";
import {
  ON_OFF_FILE_VERSION,
  type LeagueOnOffFile,
  type OnOffManifest,
  type OnOffViews,
  type TeamOnOffFile,
} from "../src/lib/on-off/types";

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public", "runtime", "on-off");
const DELAY_MS = Number(process.env.ONOFF_DELAY_MS ?? "0");
/** Pairs need both players to clear this many on-court possessions (offense + defense). */
const PAIR_MIN_POSS = 400;
const LINEUPS_PER_TEAM = 30;
const LINEUP_MIN_POSS = 40;

const RIM_FEET = 4;
const SHORT_MID_FEET = 14;
/** Legacy y (tenths of a foot from the rim) where the corner-3 straightaway ends. */
const CORNER3_MAX_Y = 87.5;

type Views = { clean: OnOffSplit; all: OnOffSplit };
const emptySplit = (): OnOffSplit => ({ o: emptyVec(), d: emptyVec() });
const emptyViews = (): Views => ({ clean: emptySplit(), all: emptySplit() });

type PlayerAcc = { name: string; games: Set<string>; starts: number; views: Views };
type TeamAcc = {
  games: Set<string>;
  views: Views;
  players: Map<string, PlayerAcc>;
  pairs: Map<string, Views>;
  lineups: Map<string, Views>;
};

function log(message: string) {
  console.log(`[on-off] ${message}`);
}

function teamAcc(map: Map<string, TeamAcc>, teamId: string): TeamAcc {
  let t = map.get(teamId);
  if (!t) {
    t = { games: new Set(), views: emptyViews(), players: new Map(), pairs: new Map(), lineups: new Map() };
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
      out.push({ poss: p, seconds: Math.max(0, prevEnd - end), startClock: prevEnd, clean: true });
      prevEnd = end;
    });
  }

  for (const ctx of out) {
    if (ctx.startClock <= HEAVE_SECONDS) ctx.clean = false;
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
      const s = scoreBefore.get(c.poss.eventActionNumbers[0] ?? c.poss.startActionNumber);
      if (!s) break;
      const margin = Math.abs(s.home - s.away);
      const startersOn = [...c.poss.offensePlayerIds, ...c.poss.defensePlayerIds].filter((id) =>
        starters.has(id)
      ).length;
      if (margin >= garbageMarginThreshold(c.startClock) && startersOn <= 2) c.clean = false;
      else break;
    }
  }
  return out;
}

function addToViews(views: Views, side: "o" | "d", v: OnOffVec, clean: boolean) {
  addVec(views.all[side], v);
  if (clean) addVec(views.clean[side], v);
}

function accumulateGame(g: DrblProcessedGame, teams: Map<string, TeamAcc>) {
  const events = new Map(g.events.map((e) => [e.actionNumber, e]));
  const names = new Map(g.box.players.map((p) => [p.playerId, p.playerName]));
  const starters = new Set(g.box.players.filter((p) => p.starter).map((p) => p.playerId));

  for (const teamId of [g.box.homeTeamId, g.box.awayTeamId]) {
    const t = teamAcc(teams, teamId);
    t.games.add(g.meta.gameId);
    for (const p of g.box.players) {
      if (p.teamId !== teamId || !p.starter) continue;
      const acc = t.players.get(p.playerId);
      if (acc) acc.starts += 1;
      else t.players.set(p.playerId, { name: p.playerName, games: new Set(), starts: 1, views: emptyViews() });
    }
  }

  for (const ctx of possessionContexts(g, starters)) {
    const { poss } = ctx;
    if (poss.offensePlayerIds.length !== 5 || poss.defensePlayerIds.length !== 5) continue;
    const oppStartersOnD = poss.offensePlayerIds.filter((id) => starters.has(id)).length;
    const oppStartersOnO = poss.defensePlayerIds.filter((id) => starters.has(id)).length;
    const v = possessionVec(poss, events, ctx.seconds, oppStartersOnO);
    const vForDefense = [...v];
    vForDefense[K.oppStarters] = oppStartersOnD;

    for (const [teamId, side, ids, vec] of [
      [poss.offenseTeamId, "o", poss.offensePlayerIds, v],
      [poss.defenseTeamId, "d", poss.defensePlayerIds, vForDefense],
    ] as const) {
      const t = teamAcc(teams, teamId);
      addToViews(t.views, side, vec, ctx.clean);
      const sorted = [...ids].sort();
      for (const id of sorted) {
        let acc = t.players.get(id);
        if (!acc) {
          acc = { name: names.get(id) ?? id, games: new Set(), starts: 0, views: emptyViews() };
          t.players.set(id, acc);
        }
        acc.games.add(poss.gameId);
        addToViews(acc.views, side, vec, ctx.clean);
      }
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}|${sorted[j]}`;
          let pair = t.pairs.get(key);
          if (!pair) {
            pair = emptyViews();
            t.pairs.set(key, pair);
          }
          addToViews(pair, side, vec, ctx.clean);
        }
      }
      const lineupKey = sorted.join("|");
      let lineup = t.lineups.get(lineupKey);
      if (!lineup) {
        lineup = emptyViews();
        t.lineups.set(lineupKey, lineup);
      }
      addToViews(lineup, side, vec, ctx.clean);
    }
  }
}

const totalPoss = (views: Views) => views.all.o[K.poss]! + views.all.d[K.poss]!;

const round = (v: OnOffVec): OnOffVec => v.map((x) => Math.round(x * 10) / 10);
const roundViews = (views: Views): OnOffViews => ({
  clean: { o: round(views.clean.o), d: round(views.clean.d) },
  all: { o: round(views.all.o), d: round(views.all.d) },
});

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

async function buildSeason(season: string) {
  const games = await listSeasonGames(season);
  log(`${season}: ${games.length} games listed`);
  const teams = new Map<string, TeamAcc>();
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
      accumulateGame(g, teams);
      processed += 1;
      for (const d of g.reconcile.lineup?.playerMinuteDiffs ?? []) {
        minuteErr += Math.abs(d.delta);
        minuteRows += 1;
      }
    } catch {
      failed += 1;
    }
    if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));
    if ((i + 1) % 200 === 0) log(`${season}: ${i + 1}/${games.length}`);
  }
  log(
    `${season}: processed=${processed} quarantined=${quarantined} failed=${failed}` +
      (minuteRows ? ` lineupMinuteMAE=${(minuteErr / minuteRows).toFixed(2)}` : "")
  );
  if (!processed) return null;

  const generatedAt = new Date().toISOString();
  const rates = { clean: leagueRates(teams, "clean"), all: leagueRates(teams, "all") };
  const leaguePlayers: LeagueOnOffFile["players"] = [];
  const teamIds: string[] = [];

  for (const [teamId, t] of teams) {
    const meta = NBA_TEAM_META[teamId];
    if (!meta) continue;
    teamIds.push(teamId);
    const players = [...t.players.entries()]
      .filter(([, p]) => totalPoss(p.views) > 0)
      .sort((a, b) => totalPoss(b[1].views) - totalPoss(a[1].views));
    const pairEligible = new Set(
      players.filter(([, p]) => totalPoss(p.views) >= PAIR_MIN_POSS).map(([id]) => id)
    );
    const file: TeamOnOffFile = {
      version: ON_OFF_FILE_VERSION,
      season,
      teamId,
      teamAbbr: meta.abbreviation,
      generatedAt,
      games: t.games.size,
      keys: ON_OFF_KEYS,
      team: roundViews(t.views),
      players: players.map(([id, p]) => ({
        id,
        name: p.name,
        gp: p.games.size,
        starts: p.starts,
        ...roundViews(p.views),
      })),
      pairs: [...t.pairs.entries()]
        .filter(([key]) => {
          const [a, b] = key.split("|");
          return pairEligible.has(a!) && pairEligible.has(b!);
        })
        .map(([key, views]) => {
          const [a, b] = key.split("|");
          return { a: a!, b: b!, ...roundViews(views) };
        }),
      lineups: [...t.lineups.entries()]
        .filter(([, views]) => totalPoss(views) >= LINEUP_MIN_POSS)
        .sort((a, b) => totalPoss(b[1]) - totalPoss(a[1]))
        .slice(0, LINEUPS_PER_TEAM)
        .map(([key, views]) => ({ ids: key.split("|"), ...roundViews(views) })),
    };
    await writeJson(path.join(OUT_ROOT, season, `${teamId}.json`), file);

    for (const [id, p] of players) {
      const cmp = (["clean", "all"] as const).map((view) =>
        compareOnOff(t.views[view], p.views[view], rates[view])
      );
      const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
      leaguePlayers.push({
        id,
        teamId,
        name: p.name,
        poss: [
          p.views.clean.o[K.poss]! + p.views.clean.d[K.poss]!,
          p.views.all.o[K.poss]! + p.views.all.d[K.poss]!,
        ],
        netDiff: [r1(cmp[0]!.netDiff), r1(cmp[1]!.netDiff)],
        netLuckAdjDiff: [r1(cmp[0]!.netLuckAdjDiff), r1(cmp[1]!.netLuckAdjDiff)],
        ortgDiff: [r1(cmp[0]!.ortgDiff), r1(cmp[1]!.ortgDiff)],
        drtgDiff: [r1(cmp[0]!.drtgDiff), r1(cmp[1]!.drtgDiff)],
      });
    }
  }

  const league: LeagueOnOffFile = {
    version: ON_OFF_FILE_VERSION,
    season,
    generatedAt,
    games: processed,
    gamesQuarantined: quarantined + failed,
    rates,
    players: leaguePlayers,
  };
  await writeJson(path.join(OUT_ROOT, season, "league.json"), league);
  log(`${season}: wrote ${teamIds.length} team files, ${leaguePlayers.length} player rows`);
  return { season, games: processed, teams: teamIds.sort() };
}

async function main() {
  const seasons = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  if (!seasons.length) throw new Error("usage: build-runtime-onoff.ts <season> [season ...]");

  const manifestPath = path.join(OUT_ROOT, "manifest.json");
  let manifest: OnOffManifest = { version: ON_OFF_FILE_VERSION, generatedAt: "", seasons: [] };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as OnOffManifest;
  } catch {
    // first run
  }

  let changed = false;
  for (const season of seasons) {
    const built = await buildSeason(season);
    if (!built) {
      log(`${season}: nothing processed, manifest unchanged`);
      continue;
    }
    changed = true;
    manifest.seasons = [...manifest.seasons.filter((s) => s.season !== season), built].sort((a, b) =>
      b.season.localeCompare(a.season)
    );
  }
  if (!changed) return;
  manifest.generatedAt = new Date().toISOString();
  await writeJson(manifestPath, manifest);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
