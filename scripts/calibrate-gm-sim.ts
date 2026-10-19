/**
 * Sim several 2025-26 seasons and compare box-score rates to the real year.
 * Run: npx tsx scripts/calibrate-gm-sim.ts
 */
import { getBundledBrefPeerBoard } from "../src/data/runtime/bref-advanced-snapshot";
import { simulateGame } from "../src/gm/engine/simulate";
import { buildLeagueFromPlayerSeasons } from "../src/gm/seed/create-real-league";
const rows = getBundledBrefPeerBoard("2025-26").filter(
  (row) => row.gamesPlayed >= 5 && row.minutes > 40 && row.fieldGoalsAttempted > 0
);

const league = buildLeagueFromPlayerSeasons(rows, {
  userTeamId: "bos",
  seasonCanonical: "2025-26",
  seed: 11,
});

const roster = league.players.filter((player) => player.teamId && player.nbaSeason);
const benched = league.players.filter((player) => !player.teamId && player.nbaSeason);
const sumStat = (list: typeof roster, key: "pts" | "reb" | "ast" | "stl" | "blk" | "tov") =>
  list.reduce((sum, player) => sum + (player.nbaSeason?.[key] ?? 0), 0);
const per = (list: typeof roster, key: "pts" | "reb" | "ast" | "stl" | "blk" | "tov") =>
  (sumStat(list, key) / (30 * 82)).toFixed(2);
console.log(
  `roster owns pts ${per(roster, "pts")} reb ${per(roster, "reb")} ast ${per(roster, "ast")} stl ${per(roster, "stl")} blk ${per(roster, "blk")} tov ${per(roster, "tov")} (cut ${benched.length})`
);
const realById = new Map(roster.map((player) => [player.id, player]));

function perGame(total: number, games: number): number {
  return games > 0 ? total / games : 0;
}

type Totals = {
  games: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
};

function empty(): Totals {
  return {
    games: 0,
    min: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
  };
}

function addLine(bucket: Totals, line: {
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}) {
  bucket.games += 1;
  bucket.min += line.minutes;
  bucket.pts += line.points;
  bucket.reb += line.rebounds;
  bucket.ast += line.assists;
  bucket.stl += line.steals;
  bucket.blk += line.blocks;
  bucket.tov += line.turnovers;
  bucket.fgm += line.fgm;
  bucket.fga += line.fga;
  bucket.tpm += line.tpm;
  bucket.tpa += line.tpa;
  bucket.ftm += line.ftm;
  bucket.fta += line.fta;
}

const SEEDS = [3, 11, 19, 27];
const mae = {
  ppg: 0,
  rpg: 0,
  apg: 0,
  spg: 0,
  bpg: 0,
  mpg: 0,
  fg: 0,
  tp: 0,
  ft: 0,
  biasPpg: 0,
  biasMpg: 0,
  n: 0,
  nFg: 0,
  nTp: 0,
  nFt: 0,
};
let teamPts = 0;
let teamReb = 0;
let teamAst = 0;
let teamStl = 0;
let teamBlk = 0;
let teamTov = 0;
let teamFgm = 0;
let teamFga = 0;
let teamTpm = 0;
let teamTpa = 0;
let teamFtm = 0;
let teamFta = 0;
let teamGames = 0;
const watched = new Map<string, Totals>();

function absorb(into: Totals, from: Totals) {
  (Object.keys(into) as Array<keyof Totals>).forEach((key) => {
    into[key] += from[key];
  });
}

for (const seed of SEEDS) {
  const byPlayer = new Map<string, Totals>();
  let gameCount = 0;
  for (const game of league.schedule) {
    const result = simulateGame(game, league.teams, league.players, seed * 100000 + gameCount);
    gameCount += 1;
    teamGames += 1;
    teamPts += result.box.homeScore + result.box.awayScore;
    for (const line of result.box.players) {
      const bucket = byPlayer.get(line.playerId) ?? empty();
      addLine(bucket, line);
      byPlayer.set(line.playerId, bucket);
      teamReb += line.rebounds;
      teamAst += line.assists;
      teamStl += line.steals;
      teamBlk += line.blocks;
      teamTov += line.turnovers;
      teamFgm += line.fgm;
      teamFga += line.fga;
      teamTpm += line.tpm;
      teamTpa += line.tpa;
      teamFtm += line.ftm;
      teamFta += line.fta;
    }
  }

  for (const [id, sim] of byPlayer) {
    const player = realById.get(id);
    const real = player?.nbaSeason;
    if (!player || !real || real.min / real.gp < 20) continue;
    const rpg = perGame(real.reb, real.gp);
    const apg = perGame(real.ast, real.gp);
    const simPpg = perGame(sim.pts, sim.games);
    const realPpg = perGame(real.pts, real.gp);
    mae.biasPpg += simPpg - realPpg;
    mae.biasMpg += perGame(sim.min, sim.games) - real.min / real.gp;
    mae.ppg += Math.abs(simPpg - realPpg);
    mae.rpg += Math.abs(perGame(sim.reb, sim.games) - rpg);
    mae.apg += Math.abs(perGame(sim.ast, sim.games) - apg);
    mae.spg += Math.abs(perGame(sim.stl, sim.games) - perGame(real.stl, real.gp));
    mae.bpg += Math.abs(perGame(sim.blk, sim.games) - perGame(real.blk, real.gp));
    mae.mpg += Math.abs(perGame(sim.min, sim.games) - real.min / real.gp);
    mae.n += 1;
    if (real.fga >= 100 && sim.fga >= 50) {
      mae.fg += Math.abs(sim.fgm / sim.fga - real.fgm / real.fga);
      mae.nFg += 1;
    }
    if (real.tpa >= 80 && sim.tpa >= 40) {
      mae.tp += Math.abs(sim.tpm / sim.tpa - real.tpm / real.tpa);
      mae.nTp += 1;
    }
    if (real.fta >= 50 && sim.fta >= 20) {
      mae.ft += Math.abs(sim.ftm / sim.fta - real.ftm / real.fta);
      mae.nFt += 1;
    }
  }

  for (const player of roster) {
    if (!/robinson|tatum|gilgeous|doncic|donči/i.test(player.name)) continue;
    const sim = byPlayer.get(player.id);
    if (!sim) continue;
    const bucket = watched.get(player.id) ?? empty();
    absorb(bucket, sim);
    watched.set(player.id, bucket);
  }
}

const sides = teamGames * 2;
const fmt = (n: number) => n.toFixed(2);
console.log(
  `roster ${roster.length} schedule ${league.schedule.length} seeds ${SEEDS.length}`
);
console.log(
  `sim/team pts ${fmt(teamPts / sides)} reb ${fmt(teamReb / sides)} ast ${fmt(teamAst / sides)} stl ${fmt(teamStl / sides)} blk ${fmt(teamBlk / sides)} tov ${fmt(teamTov / sides)}`
);
console.log(
  `FG ${fmt((100 * teamFgm) / teamFga)}% 3P ${fmt((100 * teamTpm) / teamTpa)}% 3PAr ${fmt((100 * teamTpa) / teamFga)}% FT ${fmt((100 * teamFtm) / teamFta)}% FTr ${fmt(teamFta / teamFga)}`
);
console.log(
  `MAE mpg ${fmt(mae.mpg / mae.n)} ppg ${fmt(mae.ppg / mae.n)} rpg ${fmt(mae.rpg / mae.n)} apg ${fmt(mae.apg / mae.n)} spg ${fmt(mae.spg / mae.n)} bpg ${fmt(mae.bpg / mae.n)}`
);
console.log(`bias mpg ${fmt(mae.biasMpg / mae.n)} ppg ${fmt(mae.biasPpg / mae.n)}`);

const real = rows.reduce(
  (sum, row) => {
    sum.pts += row.points;
    sum.reb += row.rebounds;
    sum.ast += row.assists;
    sum.stl += row.steals;
    sum.blk += row.blocks;
    sum.tov += row.turnovers;
    sum.fgm += row.fieldGoalsMade;
    sum.fga += row.fieldGoalsAttempted;
    sum.tpm += row.threePointersMade;
    sum.tpa += row.threePointersAttempted;
    sum.ftm += row.freeThrowsMade;
    sum.fta += row.freeThrowsAttempted;
    return sum;
  },
  { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 }
);
const realSides = 30 * 82;
console.log(
  `real/team pts ${fmt(real.pts / realSides)} reb ${fmt(real.reb / realSides)} ast ${fmt(real.ast / realSides)} stl ${fmt(real.stl / realSides)} blk ${fmt(real.blk / realSides)} tov ${fmt(real.tov / realSides)}`
);
console.log(
  `real FG ${fmt((100 * real.fgm) / real.fga)}% 3P ${fmt((100 * real.tpm) / real.tpa)}% 3PAr ${fmt((100 * real.tpa) / real.fga)}% FT ${fmt((100 * real.ftm) / real.fta)}% FTr ${fmt(real.fta / real.fga)}`
);
console.log(
  `MAE FG ${fmt((100 * mae.fg) / mae.nFg)} pts 3P ${fmt((100 * mae.tp) / mae.nTp)} pts FT ${fmt((100 * mae.ft) / mae.nFt)} pts on ${mae.n} players`
);

function show(pattern: RegExp) {
  const player = roster.find((item) => pattern.test(item.name));
  if (!player?.nbaSeason) {
    console.log(pattern, "missing");
    return;
  }
  const realLine = player.nbaSeason;
  const sim = watched.get(player.id);
  const realText = `real ${fmt(realLine.pts / realLine.gp)}/${fmt(realLine.reb / realLine.gp)}/${fmt(realLine.ast / realLine.gp)} ${fmt(realLine.min / realLine.gp)} mpg`;
  const simText = sim
    ? `sim ${fmt(perGame(sim.pts, sim.games))}/${fmt(perGame(sim.reb, sim.games))}/${fmt(perGame(sim.ast, sim.games))} ${fmt(perGame(sim.min, sim.games))} mpg`
    : "sim —";
  console.log(player.name, realText, "|", simText);
}

for (const pattern of [/doncic|donči/i, /mitchell robinson/i, /jayson tatum/i, /gilgeous/i]) {
  show(pattern);
}
