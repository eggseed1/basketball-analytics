/**
 * Reproduce Career Per36 defect — provenance dump before any fix.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  getHistorySeasonsForPlayer,
  getHistoryPlayerGames,
} from "../src/data/history/player-career";
import { per36, perGame } from "../src/lib/player-page-contract";

const OUT = path.join(process.cwd(), "reports", "p18c13r");
mkdirSync(OUT, { recursive: true });

function dumpPlayer(playerId: string, label: string) {
  const seasons = getHistorySeasonsForPlayer(playerId);
  const rows = seasons.map((s) => {
    const games = getHistoryPlayerGames(playerId, s.season, { limit: 5000 });
    const gameMin = games.reduce((a, g) => {
      const m = g.minutes;
      if (!m) return a;
      if (/^\d+:\d+/.test(m)) {
        const match = /^(\d+):(\d+)/.exec(m);
        return a + (match ? Number(match[1]) + Number(match[2]) / 60 : 0);
      }
      return a + (Number(m) || 0);
    }, 0);
    const gamePts = games.reduce((a, g) => a + g.points, 0);
    const gameFgm = games.reduce((a, g) => a + g.fgm, 0);
    const gameFga = games.reduce((a, g) => a + g.fga, 0);
    return {
      label,
      playerId,
      season: s.season,
      gp: s.gp,
      minutes_field: s.minutes,
      fgm: s.fgm,
      fga: s.fga,
      pts: s.points,
      reb: s.rebounds,
      ast: s.assists,
      threePm: s.threePm,
      ftm: s.ftm,
      fta: s.fta,
      per36_fgm: per36(s.fgm, s.minutes),
      per36_pts: per36(s.points, s.minutes),
      perGame_pts: perGame(s.points, s.gp),
      gameCount: games.length,
      gameMinSum: Math.round(gameMin * 10) / 10,
      gamePts,
      gameFgm,
      gameFga,
      minutesLooksLikePerGame:
        s.minutes != null && s.gp > 0 && s.minutes < 50 && s.minutes > 0,
      minutesNull: s.minutes == null,
      countingNull: s.fgm == null || s.points == null,
    };
  });
  return rows;
}

// Trae Young is classic ATL recent seasons with wild 2019-20
const candidates = [
  ["1629027", "TraeYoung"],
  ["2544", "LeBron"],
  ["201939", "Curry"],
  ["203076", "AD"],
];

const all: ReturnType<typeof dumpPlayer> = [];
for (const [id, label] of candidates) {
  const rows = dumpPlayer(id, label);
  console.log(
    "\n===",
    label,
    id,
    "seasons",
    rows.length,
    "==="
  );
  for (const r of rows.slice(0, 12)) {
    console.log(
      JSON.stringify({
        season: r.season,
        gp: r.gp,
        min: r.minutes_field,
        fgm: r.fgm,
        pts: r.pts,
        per36_pts: r.per36_pts,
        per36_fgm: r.per36_fgm,
        games: r.gameCount,
        gameMin: r.gameMinSum,
        gamePts: r.gamePts,
        minPerGameish: r.minutesLooksLikePerGame,
        countingNull: r.countingNull,
      })
    );
  }
  all.push(...rows);
}

writeFileSync(
  path.join(OUT, "_repro_raw.json"),
  JSON.stringify(all, null, 2)
);
console.log("\nwrote", path.join(OUT, "_repro_raw.json"));
