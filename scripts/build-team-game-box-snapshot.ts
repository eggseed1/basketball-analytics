/**
 * Team box score totals per game from the local NBA box score archive
 * (data/drbl/raw/games/{nbaGameId}/boxscore.json). Numbers only.
 *
 * Run: npx tsx scripts/build-team-game-box-snapshot.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveTeamBrand } from "../src/lib/nba-brand";
import {
  TEAM_GAME_BOX_COLUMNS,
  type TeamGameBoxRow,
  type TeamGameBoxSnapshot,
} from "../src/lib/team-game-box";

const ROOT = join(__dirname, "..");
const RAW = join(ROOT, "data", "drbl", "raw", "games");
const OUT = join(ROOT, "src", "data", "runtime", "team-game-box-snapshot.json");

type BoxTeam = {
  teamTricode: string;
  score: number;
  statistics: Record<string, number>;
};

function seasonFromGameId(gameId: string): string | null {
  const m = /^00[24](\d{2})\d{5}$/.exec(gameId);
  if (!m) return null;
  const start = 2000 + Number(m[1]);
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function teamRow(date: string, t: BoxTeam): TeamGameBoxRow | null {
  const s = t.statistics;
  const values = [
    t.score,
    s.fieldGoalsMade,
    s.fieldGoalsAttempted,
    s.threePointersMade,
    s.threePointersAttempted,
    s.freeThrowsMade,
    s.freeThrowsAttempted,
    s.reboundsOffensive,
    s.reboundsDefensive,
    s.assists,
    s.steals,
    s.blocks,
    s.turnoversTotal,
    s.foulsPersonal,
  ];
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  return [date, ...values] as TeamGameBoxRow;
}

function main() {
  const teams: TeamGameBoxSnapshot["teams"] = {};
  let games = 0;
  let skipped = 0;
  for (const gameId of readdirSync(RAW).sort()) {
    const season = seasonFromGameId(gameId);
    if (!season) continue;
    let game: { gameStatus: number; gameEt: string; homeTeam: BoxTeam; awayTeam: BoxTeam };
    try {
      game = JSON.parse(readFileSync(join(RAW, gameId, "boxscore.json"), "utf8")).game;
    } catch {
      skipped++;
      continue;
    }
    if (game?.gameStatus !== 3 || typeof game.gameEt !== "string") {
      skipped++;
      continue;
    }
    const date = game.gameEt.slice(0, 10);
    const rows = [game.homeTeam, game.awayTeam].map((t) => ({
      espnId: resolveTeamBrand(t.teamTricode)?.espnTeamId,
      row: teamRow(date, t),
    }));
    if (rows.some((r) => !r.espnId || !r.row)) {
      skipped++;
      continue;
    }
    const bySeason = (teams[season] ??= {});
    for (const { espnId, row } of rows) (bySeason[espnId!] ??= []).push(row!);
    games++;
  }
  for (const bySeason of Object.values(teams)) {
    for (const list of Object.values(bySeason)) list.sort((a, b) => a[0].localeCompare(b[0]));
  }
  const snapshot: TeamGameBoxSnapshot = {
    generatedAt: new Date().toISOString(),
    source: "NBA box score archive (team totals)",
    columns: [...TEAM_GAME_BOX_COLUMNS],
    teams,
  };
  writeFileSync(OUT, `${JSON.stringify(snapshot)}\n`);
  console.log(`team box totals: ${games} games, ${skipped} skipped, seasons ${Object.keys(teams).join(", ")}`);
}

main();
