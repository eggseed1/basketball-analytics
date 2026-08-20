/**
 * P18B — build player-season + career aggregates from completed season artifacts.
 *
 *   npx tsx scripts/p18b-build-player-careers.ts
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { HISTORY_VERSION } from "../src/lib/history/capabilities";
import { parseBasketballMinutes } from "../src/lib/parse-basketball-minutes";

const ROOT = process.cwd();
const HISTORY = path.join(ROOT, "data", "drbl", "history");
const MANIFEST = path.join(HISTORY, "manifest.json");
const OUT = path.join(HISTORY, HISTORY_VERSION, "players");
mkdirSync(OUT, { recursive: true });

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

type PlayerGame = {
  gameId: string;
  season: string;
  date: string;
  playerId: string;
  playerName: string;
  teamId: string;
  opponentId: string;
  homeAway: string;
  result: string;
  minutes: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  starter: boolean | null;
};

function parseMinutes(m: string | null): number {
  return parseBasketballMinutes(m);
}

function main() {
  const root = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
    seasons: Record<string, { status?: string; gamesProcessed?: number; gamesExpected?: number }>;
  };
  const seasons = Object.keys(root.seasons)
    .filter((s) => {
      const e = root.seasons[s]!;
      return (
        e.status === "COMPLETE" &&
        Number(e.gamesProcessed ?? 0) >= Number(e.gamesExpected ?? 0) &&
        Number(e.gamesExpected ?? 0) > 0
      );
    })
    .sort();

  type SeasonAgg = {
    season: string;
    playerId: string;
    playerName: string;
    teamIds: string[];
    primaryTeamId: string;
    gp: number;
    gs: number | null;
    minutes: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    fgm: number;
    fga: number;
    threePm: number;
    threePa: number;
    ftm: number;
    fta: number;
    drbl100: null;
    war1: null;
  };

  const seasonRows: SeasonAgg[] = [];
  const careerMap = new Map<
    string,
    {
      playerId: string;
      playerName: string;
      firstSeason: string;
      lastSeason: string;
      seasons: number;
      games: number;
      minutes: number;
      points: number;
      rebounds: number;
      assists: number;
      steals: number;
      blocks: number;
      turnovers: number;
      teams: string[];
    }
  >();

  let playerGameRows = 0;
  let tradedSeasons = 0;

  for (const season of seasons) {
    const pgPath = path.join(
      HISTORY,
      HISTORY_VERSION,
      season,
      "player-games.json"
    );
    if (!existsSync(pgPath)) continue;
    const data = JSON.parse(readFileSync(pgPath, "utf8")) as {
      rows: PlayerGame[];
    };
    playerGameRows += data.rows.length;

    const byPlayer = new Map<string, PlayerGame[]>();
    for (const row of data.rows) {
      if (!row.playerId) continue;
      if (!byPlayer.has(row.playerId)) byPlayer.set(row.playerId, []);
      byPlayer.get(row.playerId)!.push(row);
    }

    for (const [playerId, rows] of byPlayer) {
      const teamCounts = new Map<string, number>();
      let gp = 0;
      let gs: number | null = null;
      let gsKnown = false;
      let minutes = 0;
      let points = 0;
      let rebounds = 0;
      let assists = 0;
      let steals = 0;
      let blocks = 0;
      let turnovers = 0;
      let fgm = 0;
      let fga = 0;
      let threePm = 0;
      let threePa = 0;
      let ftm = 0;
      let fta = 0;
      let name = rows[0]?.playerName ?? playerId;

      for (const r of rows) {
        gp += 1;
        if (r.starter != null) {
          gsKnown = true;
          gs = (gs ?? 0) + (r.starter ? 1 : 0);
        }
        minutes += parseMinutes(r.minutes);
        points += r.points || 0;
        rebounds += r.rebounds || 0;
        assists += r.assists || 0;
        steals += r.steals || 0;
        blocks += r.blocks || 0;
        turnovers += r.turnovers || 0;
        fgm += r.fgm || 0;
        fga += r.fga || 0;
        threePm += r.threePm || 0;
        threePa += r.threePa || 0;
        ftm += r.ftm || 0;
        fta += r.fta || 0;
        teamCounts.set(r.teamId, (teamCounts.get(r.teamId) ?? 0) + 1);
        if (r.playerName) name = r.playerName;
      }

      const teamIds = [...teamCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
      if (teamIds.length > 1) tradedSeasons++;

      const agg: SeasonAgg = {
        season,
        playerId,
        playerName: name,
        teamIds,
        primaryTeamId: teamIds[0] ?? "",
        gp,
        gs: gsKnown ? gs : null,
        minutes: Number(minutes.toFixed(1)),
        points,
        rebounds,
        assists,
        steals,
        blocks,
        turnovers,
        fgm,
        fga,
        threePm,
        threePa,
        ftm,
        fta,
        drbl100: null,
        war1: null,
      };
      seasonRows.push(agg);

      const c = careerMap.get(playerId) ?? {
        playerId,
        playerName: name,
        firstSeason: season,
        lastSeason: season,
        seasons: 0,
        games: 0,
        minutes: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        teams: [] as string[],
      };
      c.playerName = name;
      c.firstSeason = c.firstSeason < season ? c.firstSeason : season;
      c.lastSeason = c.lastSeason > season ? c.lastSeason : season;
      c.seasons += 1;
      c.games += gp;
      c.minutes += minutes;
      c.points += points;
      c.rebounds += rebounds;
      c.assists += assists;
      c.steals += steals;
      c.blocks += blocks;
      c.turnovers += turnovers;
      for (const t of teamIds) {
        if (!c.teams.includes(t)) c.teams.push(t);
      }
      careerMap.set(playerId, c);
    }
  }

  const careers = [...careerMap.values()].map((c) => ({
    ...c,
    minutes: Number(c.minutes.toFixed(1)),
    // Explicit: no career DRBL / WAR1 invent
    careerDrbl100: null,
    careerWar1: null,
  }));

  const seasonPath = path.join(OUT, "player-seasons.json");
  const careerPath = path.join(OUT, "career-summaries.json");
  const tmpSeason = seasonPath + ".tmp";
  const tmpCareer = careerPath + ".tmp";

  writeFileSync(
    tmpSeason,
    JSON.stringify({
      historyVersion: HISTORY_VERSION,
      seasonsIncluded: seasons,
      rows: seasonRows,
      generatedAt: new Date().toISOString(),
    })
  );
  writeFileSync(
    tmpCareer,
    JSON.stringify({
      historyVersion: HISTORY_VERSION,
      seasonsIncluded: seasons,
      players: careers,
      generatedAt: new Date().toISOString(),
    })
  );
  // atomic rename
  writeFileSync(seasonPath, readFileSync(tmpSeason));
  writeFileSync(careerPath, readFileSync(tmpCareer));

  const index = Object.fromEntries(
    careers.map((c) => [
      c.playerId,
      {
        playerName: c.playerName,
        firstSeason: c.firstSeason,
        lastSeason: c.lastSeason,
        seasons: c.seasons,
        games: c.games,
      },
    ])
  );
  writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify({
      historyVersion: HISTORY_VERSION,
      players: index,
      generatedAt: new Date().toISOString(),
    })
  );

  const summary = {
    seasonsIncluded: seasons.length,
    playerSeasonRows: seasonRows.length,
    careerPlayers: careers.length,
    playerGameRowsScanned: playerGameRows,
    tradedPlayerSeasons: tradedSeasons,
    hash: sha(
      JSON.stringify({
        n: careers.length,
        pts: careers.reduce((s, c) => s + c.points, 0),
        seasons: seasons.join(","),
      })
    ),
  };
  writeFileSync(path.join(OUT, "build-manifest.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

main();
