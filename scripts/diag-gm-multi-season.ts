/**
 * Deep multi-season health check: parity, cap/TV growth, roster/contract shape.
 * Run: npx tsx scripts/diag-gm-multi-season.ts
 *
 * Env: SEASONS=12 START=2020 (season-end years)
 */
import { stampSeasonAwards } from "../src/gm/engine/awards";
import { capStatus, teamPayrollM } from "../src/gm/engine/cap";
import { expandDraftOrder } from "../src/gm/engine/draft-room";
import { startNextSeason } from "../src/gm/engine/offseason";
import { stepDay } from "../src/gm/engine/pace";
import {
  applyPlayInResult,
  createPlayInBoard,
  playInDone,
  playInOpenGames,
  playoffSeeds,
  playoffTeamIdSet,
} from "../src/gm/engine/play-in";
import { rollGameInjuries, tickInjuries } from "../src/gm/engine/progression";
import { uid } from "../src/gm/engine/rng";
import { simulateGame } from "../src/gm/engine/simulate";
import {
  betterRecord,
  buildPlayoffBracket,
  computeLotteryOrder,
  seriesHosts,
} from "../src/gm/engine/standings";
import { getCbaRules, latestCapSeasonEndYear } from "../src/gm/myleague/cba-registry";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import type {
  GmLeagueState,
  GmPlayInBoard,
  GmPlayoffSeries,
} from "../src/gm/types";

const START = Number(process.env.START ?? 2020);
const SEASONS = Number(process.env.SEASONS ?? 12);

type SeasonSnap = {
  season: number;
  phaseEnd: string;
  wins: number[];
  winMean: number;
  winStd: number;
  winMin: number;
  winMax: number;
  teams50: number;
  teams20: number;
  championId: string | null;
  capM: number;
  taxM: number;
  apron1M: number;
  apron2M: number;
  maxSalaryM: number;
  payrolls: number[];
  payMean: number;
  payMedian: number;
  payMin: number;
  payMax: number;
  overCap: number;
  overTax: number;
  overApron1: number;
  overApron2: number;
  illegalRoster: number;
  topContractM: number;
  avgTop5ContractM: number;
  contractsOverMax: number;
  playerCount: number;
  rostered: number;
  freeAgents: number;
  avgAge: number;
  avgImpact: number;
  impactStd: number;
  starsImpact4: number;
};

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function snapshot(league: GmLeagueState, championId: string | null): SeasonSnap {
  const wins = league.teams.map((t) => league.standings[t.id]?.wins ?? 0);
  const payrolls = league.teams.map((t) =>
    teamPayrollM(t.id, league.players, t.deadMoney ?? [])
  );
  const statuses = league.teams.map((t) =>
    capStatus(t, league.players, league.settings, league.season)
  );
  const contracts = league.players
    .filter((p) => p.teamId && p.contract)
    .map((p) => p.contract!.annualSalaryM)
    .sort((a, b) => b - a);
  const rosteredPlayers = league.players.filter((p) => p.teamId != null);
  const impacts = rosteredPlayers.map((p) => p.ratings.impact);
  const rules = getCbaRules(league.season);

  return {
    season: league.season,
    phaseEnd: league.phase,
    wins,
    winMean: mean(wins),
    winStd: std(wins),
    winMin: Math.min(...wins),
    winMax: Math.max(...wins),
    teams50: wins.filter((w) => w >= 50).length,
    teams20: wins.filter((w) => w <= 20).length,
    championId,
    capM: league.settings.salaryCapM,
    taxM: league.settings.luxuryTaxM,
    apron1M: league.settings.firstApronM,
    apron2M: league.settings.secondApronM,
    maxSalaryM: rules.maxSalaryM,
    payrolls,
    payMean: mean(payrolls),
    payMedian: median(payrolls),
    payMin: Math.min(...payrolls),
    payMax: Math.max(...payrolls),
    overCap: statuses.filter((s) => s.overCap).length,
    overTax: statuses.filter((s) => s.overTax).length,
    overApron1: statuses.filter((s) => s.overFirstApron).length,
    overApron2: statuses.filter((s) => s.overSecondApron).length,
    illegalRoster: statuses.filter((s) => !s.rosterLegal).length,
    topContractM: contracts[0] ?? 0,
    avgTop5ContractM: mean(contracts.slice(0, 5)),
    contractsOverMax: contracts.filter((c) => c > rules.maxSalaryM + 0.05).length,
    playerCount: league.players.length,
    rostered: rosteredPlayers.length,
    freeAgents: league.freeAgents.length,
    avgAge: mean(rosteredPlayers.map((p) => p.age)),
    avgImpact: mean(impacts),
    impactStd: std(impacts),
    starsImpact4: impacts.filter((i) => i >= 4).length,
  };
}

function simRegular(league: GmLeagueState): GmLeagueState {
  let next = league;
  let guard = 0;
  while (next.phase === "regular" && guard < 400) {
    guard += 1;
    const stepped = stepDay(next);
    next = stepped.league;
    if (stepped.seasonOver) break;
  }
  return stampSeasonAwards(next);
}

function simPlayInNights(league: GmLeagueState): GmLeagueState {
  const board = createPlayInBoard(league);
  if (!board) {
    return {
      ...league,
      phase: "playoffs",
      playoffBracket: buildPlayoffBracket(league),
      lotteryOrder: computeLotteryOrder(league),
      draftPickIndex: 0,
    };
  }
  let next: GmLeagueState = { ...league, phase: "play_in", playIn: board };
  let guard = 0;
  while (!playInDone(next.playIn!) && guard < 8) {
    guard += 1;
    const result = simOnePlayInNight(next);
    next = result;
  }
  const seeds = playoffSeeds(next, next.playIn!);
  const playoffIds = playoffTeamIdSet(seeds);
  return {
    ...next,
    phase: "playoffs",
    playIn: undefined,
    playoffBracket: buildPlayoffBracket(next, seeds),
    lotteryOrder: computeLotteryOrder(next, playoffIds),
    draftPickIndex: 0,
  };
}

function simOnePlayInNight(league: GmLeagueState): GmLeagueState {
  let board: GmPlayInBoard = league.playIn!;
  const games = playInOpenGames(board);
  if (!games.length) return league;
  const schedule = [...league.schedule];
  let boxScores = [...league.boxScores];
  const players = [...league.players];
  for (const game of games) {
    const tip = {
      id: uid("pi"),
      season: league.season,
      day: league.day,
      homeTeamId: game.homeId,
      awayTeamId: game.awayId,
      played: false,
    };
    const result = simulateGame(tip, league.teams, players);
    result.game.postseason = "play_in";
    result.box.postseason = "play_in";
    schedule.push(result.game);
    boxScores = [result.box, ...boxScores].slice(0, 400);
    const homeWon = (result.game.homeScore ?? 0) > (result.game.awayScore ?? 0);
    board = applyPlayInResult(board, game, homeWon);
  }
  return {
    ...league,
    day: league.day + 1,
    playIn: board,
    schedule,
    boxScores,
    players,
  };
}

function simPlayoffsToDraft(league: GmLeagueState): {
  league: GmLeagueState;
  championId: string | null;
} {
  let next = { ...league };
  let championId: string | null = null;
  let guard = 0;
  while (next.phase === "playoffs" && guard < 120) {
    guard += 1;
    const stepped = simOnePlayoffDay(next);
    next = stepped.league;
    if (stepped.championId) championId = stepped.championId;
  }
  return { league: next, championId };
}

function simOnePlayoffDay(league: GmLeagueState): {
  league: GmLeagueState;
  championId: string | null;
} {
  if (!league.playoffBracket) {
    return { league: { ...league, phase: "draft" }, championId: null };
  }
  const bracket = league.playoffBracket.map((s) => ({ ...s }));
  const schedule = [...league.schedule];
  let boxScores = [...league.boxScores];
  let players = league.players;
  let championId: string | null = null;

  const openRound = Math.min(
    ...bracket.filter((series) => !series.done).map((series) => series.round)
  );
  const open = bracket.filter((series) => !series.done && series.round === openRound);
  if (!open.length) {
    return { league: { ...league, phase: "draft" }, championId: null };
  }
  const tonight = open.filter(
    (_, index) => open.length <= 2 || index % 2 === league.day % 2
  );
  for (const series of tonight) {
    const court = seriesHosts(series);
    const game = {
      id: uid("pg"),
      season: league.season,
      day: league.day,
      homeTeamId: court.homeTeamId,
      awayTeamId: court.awayTeamId,
      played: false,
      postseason: "playoffs" as const,
    };
    const result = simulateGame(game, league.teams, players);
    result.box.postseason = "playoffs";
    schedule.push(result.game);
    boxScores = [result.box, ...boxScores].slice(0, 400);
    players = rollGameInjuries(
      { ...league, players },
      result.box.players.map((line) => line.playerId),
      league.day * 17 + series.id.length
    );
    if (result.game.homeScore != null && result.game.awayScore != null) {
      series.games = [
        ...(series.games ?? []),
        {
          homeTeamId: result.game.homeTeamId,
          awayTeamId: result.game.awayTeamId,
          homeScore: result.game.homeScore,
          awayScore: result.game.awayScore,
        },
      ];
    }
    const homeWin = (result.game.homeScore ?? 0) > (result.game.awayScore ?? 0);
    if (homeWin) {
      if (result.game.homeTeamId === series.teamAId) series.winsA += 1;
      else series.winsB += 1;
    } else {
      if (result.game.awayTeamId === series.teamAId) series.winsA += 1;
      else series.winsB += 1;
    }
    if (series.winsA >= 4 || series.winsB >= 4) {
      series.done = true;
      series.winnerId = series.winsA >= 4 ? series.teamAId : series.teamBId;
    }
  }
  players = tickInjuries(
    players,
    league.teams.find((team) => team.id === league.userTeamId)?.staff.trainerLevel ?? 1
  );

  const currentRound = Math.max(...bracket.map((b) => b.round));
  const roundDone = bracket
    .filter((s) => s.round === currentRound)
    .every((s) => s.done);

  if (roundDone) {
    if (currentRound === 1) {
      for (const conf of ["East", "West"] as const) {
        const confW = bracket
          .filter((s) => s.round === 1 && s.conf === conf)
          .map((s) => s.winnerId!);
        for (let i = 0; i < confW.length; i += 2) {
          if (confW[i] && confW[i + 1]) {
            const home = betterRecord(league, confW[i]!, confW[i + 1]!);
            const away = home === confW[i] ? confW[i + 1]! : confW[i]!;
            bracket.push(newSeries(2, conf, home, away));
          }
        }
      }
    } else if (currentRound === 2) {
      for (const conf of ["East", "West"] as const) {
        const confW = bracket
          .filter((s) => s.round === 2 && s.conf === conf)
          .map((s) => s.winnerId!);
        if (confW[0] && confW[1]) {
          const home = betterRecord(league, confW[0], confW[1]);
          const away = home === confW[0] ? confW[1] : confW[0];
          bracket.push(newSeries(3, conf, home, away));
        }
      }
    } else if (currentRound === 3) {
      const east = bracket.find((s) => s.round === 3 && s.conf === "East" && s.winnerId);
      const west = bracket.find((s) => s.round === 3 && s.conf === "West" && s.winnerId);
      if (east?.winnerId && west?.winnerId) {
        const home = betterRecord(league, east.winnerId, west.winnerId);
        const away = home === east.winnerId ? west.winnerId : east.winnerId;
        bracket.push(newSeries(4, "Finals", home, away));
      }
    } else if (currentRound === 4) {
      const finals = bracket.find((s) => s.round === 4 && s.done);
      championId = finals?.winnerId ?? null;
      const lotteryOrder = league.lotteryOrder ?? computeLotteryOrder(league);
      return {
        league: {
          ...league,
          phase: "draft",
          playoffBracket: bracket,
          schedule,
          boxScores,
          players,
          draftPickIndex: 0,
          lotteryOrder,
          draftOrder: expandDraftOrder(lotteryOrder),
        },
        championId,
      };
    }
  }

  return {
    league: {
      ...league,
      playoffBracket: bracket,
      schedule,
      boxScores,
      players,
      day: league.day + 1,
    },
    championId,
  };
}

function newSeries(
  round: number,
  conf: GmPlayoffSeries["conf"],
  home: string,
  away: string
): GmPlayoffSeries {
  return {
    id: uid("series"),
    round,
    conf,
    teamAId: home,
    teamBId: away,
    seedA: 1,
    seedB: 2,
    winsA: 0,
    winsB: 0,
    done: false,
    games: [],
  };
}

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

function main() {
  const t0 = Date.now();
  const latestCap = latestCapSeasonEndYear();
  console.log(
    `GM multi-season health | start=${START} seasons=${SEASONS} latestCapOnFile=${latestCap}`
  );
  console.log("---");

  let league = createGeneratedLeague({
    userTeamId: "bos",
    season: START,
    seed: 2020 * 997,
  });

  const rows: SeasonSnap[] = [];
  const champions: string[] = [];

  for (let i = 0; i < SEASONS; i++) {
    const seasonStart = Date.now();
    process.stdout.write(`S${league.season} regular… `);
    league = simRegular(league);
    process.stdout.write(`play-in… `);
    league = simPlayInNights(league);
    process.stdout.write(`playoffs… `);
    const { league: afterPo, championId } = simPlayoffsToDraft(league);
    league = afterPo;
    if (championId) champions.push(championId);
    const snap = snapshot(league, championId);
    rows.push(snap);
    const abbr =
      league.teams.find((t) => t.id === championId)?.abbr ?? championId ?? "?";
    console.log(
      `done ${(Date.now() - seasonStart) / 1000}s | ${abbr} champ | wins ${snap.winMin}-${snap.winMax} σ=${fmt(snap.winStd)} | cap $${fmt(snap.capM)} pay μ=$${fmt(snap.payMean)} taxers=${snap.overTax}`
    );
    if (i < SEASONS - 1) {
      process.stdout.write(`  → ${league.season + 1} FA/next… `);
      league = startNextSeason(league);
      console.log(`ok (${league.players.length} players, cap $${fmt(league.settings.salaryCapM)})`);
    }
  }

  console.log("\n========== PARITY ==========");
  console.log(
    "season | wins min-max | σ | 50+ | ≤20 | champ"
  );
  for (const r of rows) {
    const abbr =
      league.teams.find((t) => t.id === r.championId)?.abbr ??
      r.championId ??
      "?";
    console.log(
      `${r.season} | ${r.winMin}-${r.winMax} | ${fmt(r.winStd)} | ${r.teams50} | ${r.teams20} | ${abbr}`
    );
  }
  const uniqueChamps = new Set(champions);
  console.log(
    `champions: ${champions.length} titles, ${uniqueChamps.size} unique teams (${[...uniqueChamps].join(", ")})`
  );
  const earlyStd = mean(rows.slice(0, 3).map((r) => r.winStd));
  const lateStd = mean(rows.slice(-3).map((r) => r.winStd));
  console.log(
    `win σ early(3)=${fmt(earlyStd)} late(3)=${fmt(lateStd)} (NBA-like ~10–14)`
  );

  console.log("\n========== CAP / TV / PAYROLL ==========");
  console.log(
    "season | cap | tax | payμ | pay med | pay max | overCap | overTax | A1 | A2 | top$ | max$"
  );
  for (const r of rows) {
    console.log(
      `${r.season} | ${fmt(r.capM)} | ${fmt(r.taxM)} | ${fmt(r.payMean)} | ${fmt(r.payMedian)} | ${fmt(r.payMax)} | ${r.overCap} | ${r.overTax} | ${r.overApron1} | ${r.overApron2} | ${fmt(r.topContractM)} | ${fmt(r.maxSalaryM)}`
    );
  }
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const capGrowth = last.capM - first.capM;
  const freezeStart = rows.findIndex(
    (r, idx) => idx > 0 && r.capM === rows[idx - 1]!.capM && r.season > latestCap
  );
  console.log(
    `cap Δ ${first.season}→${last.season}: $${fmt(capGrowth)}M (${fmt((capGrowth / first.capM) * 100, 1)}%)`
  );
  if (last.season > latestCap) {
    const projected = rows.filter((r) => r.season > latestCap);
    const allFlat = projected.every((r) => r.capM === projected[0]!.capM);
    console.log(
      `post-${latestCap} cap rows: ${projected.length} seasons, flat=${allFlat}, $${fmt(projected[0]?.capM ?? 0)}M → $${fmt(projected[projected.length - 1]?.capM ?? 0)}M`
    );
  }
  void freezeStart;

  console.log("\n========== ROSTER / TALENT HEALTH ==========");
  console.log(
    "season | rostered | FA | illegal | avgAge | avgImpact | σimpact | stars≥4 | overMax$"
  );
  for (const r of rows) {
    console.log(
      `${r.season} | ${r.rostered} | ${r.freeAgents} | ${r.illegalRoster} | ${fmt(r.avgAge)} | ${fmt(r.avgImpact, 2)} | ${fmt(r.impactStd, 2)} | ${r.starsImpact4} | ${r.contractsOverMax}`
    );
  }

  console.log("\n========== VERDICT ==========");
  const issues: string[] = [];
  const goods: string[] = [];

  if (uniqueChamps.size >= Math.min(5, Math.ceil(champions.length * 0.5))) {
    goods.push(`title spread looks healthy (${uniqueChamps.size} champs in ${champions.length})`);
  } else {
    issues.push(
      `title concentration: only ${uniqueChamps.size} unique champs in ${champions.length} seasons`
    );
  }

  if (lateStd >= 8 && lateStd <= 16) {
    goods.push(`late-era win σ ${fmt(lateStd)} is in a believable band`);
  } else if (lateStd < 8) {
    issues.push(`late-era win σ ${fmt(lateStd)} is too flat (over-parity / sim noise)`);
  } else {
    issues.push(`late-era win σ ${fmt(lateStd)} is wide (dynasty / broken balance)`);
  }

  if (last.season > latestCap && last.capM <= getCbaRules(latestCap).salaryCapM + 0.05) {
    issues.push(
      `salary cap still flat after ${latestCap} ($${fmt(last.capM)}M) — projection failed`
    );
  } else if (capGrowth > 0) {
    goods.push(`cap grew $${fmt(capGrowth)}M over the window`);
  }

  const earlyFa = mean(rows.slice(0, 3).map((r) => r.freeAgents));
  const lateFa = mean(rows.slice(-3).map((r) => r.freeAgents));
  if (lateFa > earlyFa * 2.5 && lateFa > 250) {
    issues.push(
      `FA pool still balloons (early μ=${fmt(earlyFa, 0)} → late μ=${fmt(lateFa, 0)})`
    );
  } else {
    goods.push(
      `FA pool stays bounded (early μ=${fmt(earlyFa, 0)}, late μ=${fmt(lateFa, 0)})`
    );
  }

  const lateTax = mean(rows.slice(-3).map((r) => r.overTax));
  if (lateTax >= 4 && lateTax <= 18) {
    goods.push(`~${fmt(lateTax, 0)} tax teams late is a workable pressure band`);
  } else if (lateTax < 2) {
    issues.push(`almost nobody hits the tax late (mean ${fmt(lateTax, 1)}) — underpriced deals or soft market`);
  } else if (lateTax > 22) {
    issues.push(`almost everyone is a tax team late (mean ${fmt(lateTax, 1)}) — cap/spend mismatch`);
  }

  const lateIllegal = mean(rows.slice(-3).map((r) => r.illegalRoster));
  if (lateIllegal > 2) {
    issues.push(`illegal roster sizes persist (mean ${fmt(lateIllegal, 1)} teams)`);
  } else {
    goods.push("roster sizes stay mostly legal after FA");
  }

  if (last.contractsOverMax > 5) {
    issues.push(`${last.contractsOverMax} deals above CBA max in final season`);
  } else {
    goods.push("supermax ceiling mostly respected");
  }

  if (last.avgAge < 24 || last.avgAge > 30) {
    issues.push(`avg roster age ${fmt(last.avgAge)} looks off`);
  } else {
    goods.push(`avg age ${fmt(last.avgAge)} is fine`);
  }

  for (const g of goods) console.log(`+ ${g}`);
  for (const i of issues) console.log(`! ${i}`);
  if (!issues.length) console.log("League looks in good shape for this window.");

  console.log(`\nelapsed ${(Date.now() - t0) / 1000}s`);
}

main();
