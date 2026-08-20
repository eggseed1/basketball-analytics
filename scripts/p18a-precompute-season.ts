/**
 * P18A — precompute historical product data for one season (resumable).
 *
 *   npx tsx scripts/p18a-precompute-season.ts --season 2005-06
 *   npx tsx scripts/p18a-precompute-season.ts --season 2005-06 --limit 50
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  HISTORY_VERSION,
  getSeasonCapabilities,
} from "../src/lib/history/capabilities";
import {
  buildScoreTimeline,
  computeGameFlowStats,
  normalizeHistoryEvents,
  validateTimelineFinalScore,
  type RawHistoryAction,
  type StrictScoringRun,
} from "../src/lib/history/score-flow";
import { loadRawArchiveShotEvents } from "../src/data/history/raw-archive-shots";
import { shotCoverage } from "../src/lib/shots/shot-events";

const ROOT = process.cwd();
const RAW_GAMES = path.join(ROOT, "data", "drbl", "raw", "games");
const HISTORY_ROOT = path.join(ROOT, "data", "drbl", "history");

function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function seasonPrefix(season: string): string {
  const [start] = season.split("-");
  const yy = String(Number(start) % 100).padStart(2, "0");
  return `002${yy}`;
}

function listGameIds(prefix: string): string[] {
  return readdirSync(RAW_GAMES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
    .map((d) => d.name)
    .sort();
}

function readJson(p: string): unknown | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function metaEndpoint(gameId: string, kind: "boxscore" | "playbyplay"): string {
  const p = path.join(RAW_GAMES, gameId, `${kind}.json.meta.json`);
  const j = readJson(p) as { endpoint?: string } | null;
  return j?.endpoint ?? "";
}

function parseDateFromGameEt(gameEt: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(gameEt)) return gameEt.slice(0, 10);
  return "";
}

function loadSeasonSchedule(
  season: string
): Map<
  string,
  { gameDate: string; homeScore: number; awayScore: number; status?: number }
> {
  const p = path.join(
    ROOT,
    "data",
    "drbl",
    "raw",
    season,
    "meta",
    "games_regular_season.json"
  );
  const map = new Map<
    string,
    { gameDate: string; homeScore: number; awayScore: number; status?: number }
  >();
  if (!existsSync(p)) return map;
  try {
    const rows = JSON.parse(readFileSync(p, "utf8")) as Array<{
      gameId: string;
      gameDate?: string;
      homeScore?: number;
      awayScore?: number;
      status?: number;
    }>;
    for (const r of rows) {
      map.set(String(r.gameId), {
        gameDate: String(r.gameDate ?? "").slice(0, 10),
        homeScore: Number(r.homeScore) || 0,
        awayScore: Number(r.awayScore) || 0,
        status: r.status,
      });
    }
  } catch {
    /* */
  }
  return map;
}

interface BoxTeam {
  teamId: number;
  teamTricode?: string;
  teamCity?: string;
  teamName?: string;
  score: number;
  players: Array<{
    personId: number;
    name?: string;
    firstName?: string;
    familyName?: string;
    starter?: string | number | boolean;
    played?: string | number;
    statistics?: Record<string, unknown>;
  }>;
}

function starterFlag(v: unknown): boolean | null {
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  return null;
}

function runToPlain(r: StrictScoringRun | null) {
  if (!r) return null;
  return {
    teamId: r.teamId,
    points: r.points,
    startEventIndex: r.startEventIndex,
    endEventIndex: r.endEventIndex,
    startPeriod: r.startPeriod,
    startClock: r.startClock,
    endPeriod: r.endPeriod,
    endClock: r.endClock,
    scoreBefore: r.scoreBefore,
    scoreAfter: r.scoreAfter,
    scorerIds: r.scorerIds,
  };
}

async function main() {
  const season = arg("season", "2005-06")!;
  const limit = Number(arg("limit", "0") || 0);
  const prefix = seasonPrefix(season);
  const caps = getSeasonCapabilities(season);
  const outDir = path.join(HISTORY_ROOT, HISTORY_VERSION, season);
  const gamesDir = path.join(outDir, "games");
  mkdirSync(gamesDir, { recursive: true });

  const schedule = loadSeasonSchedule(season);
  const allIds = listGameIds(prefix);
  const ids = limit > 0 ? allIds.slice(0, limit) : allIds;
  const startedAt = new Date().toISOString();
  const expectedGames = schedule.size > 0 ? schedule.size : allIds.length;

  const gameSummaries: Record<string, unknown>[] = [];
  const playerGames: Record<string, unknown>[] = [];
  const teamGames: Record<string, unknown>[] = [];
  const indexByTeam = new Map<string, string[]>();
  const indexByPlayer = new Map<string, string[]>();
  const indexByDate = new Map<string, string[]>();

  let processed = 0;
  let scoreTimelineSupported = 0;
  let scoreTimelineMismatch = 0;
  let boxMissing = 0;
  let pbpMissing = 0;

  for (const gameId of ids) {
    const gameOut = path.join(gamesDir, `${gameId}.json`);
    if (existsSync(gameOut) && !arg("force")) {
      // resumable: load existing summary into indexes
      try {
        const existing = JSON.parse(readFileSync(gameOut, "utf8")) as {
          summary: Record<string, unknown>;
          playerGames: Record<string, unknown>[];
          teamGames: Record<string, unknown>[];
        };
        gameSummaries.push(existing.summary);
        playerGames.push(...(existing.playerGames ?? []));
        teamGames.push(...(existing.teamGames ?? []));
        if (existing.summary.scoreTimelineAvailable) scoreTimelineSupported++;
        processed++;
        continue;
      } catch {
        /* recompute */
      }
    }

    const boxPath = path.join(RAW_GAMES, gameId, "boxscore.json");
    const pbpPath = path.join(RAW_GAMES, gameId, "playbyplay.json");
    const boxRaw = readJson(boxPath) as {
      game?: {
        gameId?: string;
        gameEt?: string;
        homeTeam?: BoxTeam;
        awayTeam?: BoxTeam;
      };
    } | null;
    const pbpRaw = readJson(pbpPath) as {
      game?: { actions?: RawHistoryAction[] };
    } | null;

    if (!boxRaw?.game?.homeTeam || !boxRaw.game.awayTeam) {
      boxMissing++;
      continue;
    }

    const home = boxRaw.game.homeTeam;
    const away = boxRaw.game.awayTeam;
    const homeTeamId = String(home.teamId);
    const awayTeamId = String(away.teamId);
    const sched = schedule.get(gameId);
    const homeScore = Number(home.score) || sched?.homeScore || 0;
    const awayScore = Number(away.score) || sched?.awayScore || 0;
    const winnerTeamId =
      homeScore > awayScore
        ? homeTeamId
        : awayScore > homeScore
          ? awayTeamId
          : null;
    const date =
      parseDateFromGameEt(String(boxRaw.game.gameEt ?? "")) ||
      sched?.gameDate ||
      "";

    const boxFp = existsSync(boxPath)
      ? sha256(readFileSync(boxPath)).slice(0, 16)
      : "";
    const pbpFp = existsSync(pbpPath)
      ? sha256(readFileSync(pbpPath)).slice(0, 16)
      : "";
    const sourceFingerprint = sha256(`${boxFp}:${pbpFp}`).slice(0, 24);

    let scoreTimelineAvailable = false;
    let flow: ReturnType<typeof computeGameFlowStats> | null = null;
    let timeline: ReturnType<typeof buildScoreTimeline> = [];
    let events: ReturnType<typeof normalizeHistoryEvents> = [];
    let periodCount = 4;

    if (pbpRaw?.game?.actions?.length) {
      events = normalizeHistoryEvents(pbpRaw.game.actions, {
        homeTeamId,
        awayTeamId,
        gameId,
      });
      periodCount = Math.max(4, ...events.map((e) => e.period));
      timeline = buildScoreTimeline(events, { homeTeamId, awayTeamId });
      if (validateTimelineFinalScore(timeline, homeScore, awayScore)) {
        scoreTimelineAvailable = true;
        scoreTimelineSupported++;
        flow = computeGameFlowStats(timeline, {
          homeTeamId,
          awayTeamId,
          winnerTeamId: winnerTeamId ?? homeTeamId,
        });
      } else {
        scoreTimelineMismatch++;
      }
    } else {
      pbpMissing++;
    }

    const drblAvailable =
      caps?.fields.drbl === "SUPPORTED" ? true : false;

    const summary = {
      historyVersion: HISTORY_VERSION,
      season,
      gameId,
      provider: "nba",
      seasonType: "Regular Season",
      date,
      homeTeamId,
      awayTeamId,
      homeTricode: home.teamTricode ?? null,
      awayTricode: away.teamTricode ?? null,
      homeScore,
      awayScore,
      winnerTeamId,
      periodCount,
      boxAvailable: true,
      pbpAvailable: Boolean(pbpRaw?.game?.actions?.length),
      scoreTimelineAvailable,
      shotCoordinatesAvailable: (() => {
        const cov = shotCoverage(loadRawArchiveShotEvents(gameId));
        if (cov.completeness === "UNAVAILABLE") return false;
        return cov.completeness;
      })(),
      drblAvailable,
      largestHomeLead: flow ? flow.largestHomeLead : null,
      largestAwayLead: flow ? flow.largestAwayLead : null,
      largestDeficitOvercomeByWinner: flow
        ? flow.largestDeficitOvercomeByWinner
        : null,
      leadChanges: flow ? flow.leadChanges : null,
      ties: flow ? flow.ties : null,
      largestStrictRunHome: flow
        ? runToPlain(flow.largestStrictRunHome)
        : null,
      largestStrictRunAway: flow
        ? runToPlain(flow.largestStrictRunAway)
        : null,
      sourceFingerprint,
      generatedAt: new Date().toISOString(),
      boxEndpoint: metaEndpoint(gameId, "boxscore"),
      pbpEndpoint: metaEndpoint(gameId, "playbyplay"),
    };

    const pgRows: Record<string, unknown>[] = [];
    for (const [side, team, oppId] of [
      ["home", home, awayTeamId],
      ["away", away, homeTeamId],
    ] as const) {
      for (const pl of team.players ?? []) {
        const st = pl.statistics ?? {};
        const played =
          pl.played === "1" || pl.played === 1 || Boolean(st.minutes);
        if (!played && !starterFlag(pl.starter)) {
          // still record DNP with zeros? Prefer only played or starter
          if (!String(st.minutes ?? "")) continue;
        }
        const playerId = String(pl.personId);
        const row = {
          historyVersion: HISTORY_VERSION,
          gameId,
          season,
          date,
          playerId,
          playerName:
            pl.name ||
            [pl.firstName, pl.familyName].filter(Boolean).join(" "),
          teamId: String(team.teamId),
          opponentId: oppId,
          homeAway: side,
          result:
            winnerTeamId == null
              ? "T"
              : winnerTeamId === String(team.teamId)
                ? "W"
                : "L",
          minutes: st.minutes ?? st.minutesCalculated ?? null,
          points: Number(st.points) || 0,
          rebounds: Number(st.reboundsTotal) || 0,
          assists: Number(st.assists) || 0,
          steals: Number(st.steals) || 0,
          blocks: Number(st.blocks) || 0,
          turnovers: Number(st.turnovers) || 0,
          fgm: Number(st.fieldGoalsMade) || 0,
          fga: Number(st.fieldGoalsAttempted) || 0,
          threePm: Number(st.threePointersMade) || 0,
          threePa: Number(st.threePointersAttempted) || 0,
          ftm: Number(st.freeThrowsMade) || 0,
          fta: Number(st.freeThrowsAttempted) || 0,
          starter: starterFlag(pl.starter),
        };
        pgRows.push(row);
        playerGames.push(row);
        if (!indexByPlayer.has(playerId)) indexByPlayer.set(playerId, []);
        indexByPlayer.get(playerId)!.push(gameId);
      }
    }

    const tgRows: Record<string, unknown>[] = [];
    for (const [side, team, opp, oppScore] of [
      ["home", home, awayTeamId, awayScore],
      ["away", away, homeTeamId, homeScore],
    ] as const) {
      const teamId = String(team.teamId);
      const row = {
        historyVersion: HISTORY_VERSION,
        gameId,
        season,
        date,
        teamId,
        opponentId: opp,
        homeAway: side,
        score: Number(team.score) || 0,
        opponentScore: oppScore,
        result:
          winnerTeamId == null
            ? "T"
            : winnerTeamId === teamId
              ? "W"
              : "L",
        q1: null,
        q2: null,
        q3: null,
        q4: null,
        ot: null,
        largestLead:
          flow == null
            ? null
            : side === "home"
              ? flow.largestHomeLead
              : flow.largestAwayLead,
        largestDeficit:
          flow == null
            ? null
            : side === "home"
              ? flow.largestAwayLead
              : flow.largestHomeLead,
        leadChanges: flow ? flow.leadChanges : null,
        ties: flow ? flow.ties : null,
        largestRun:
          flow == null
            ? null
            : runToPlain(
                side === "home"
                  ? flow.largestStrictRunHome
                  : flow.largestStrictRunAway
              ),
      };
      tgRows.push(row);
      teamGames.push(row);
      if (!indexByTeam.has(teamId)) indexByTeam.set(teamId, []);
      indexByTeam.get(teamId)!.push(gameId);
    }

    if (date) {
      if (!indexByDate.has(date)) indexByDate.set(date, []);
      indexByDate.get(date)!.push(gameId);
    }

    // Compact events for product (drop empty noise sparingly)
    const compactEvents = events.map((e) => ({
      eventIndex: e.eventIndex,
      period: e.period,
      clock: e.clock,
      teamId: e.teamId,
      playerId: e.playerId,
      playerName: e.playerName,
      eventType: e.eventType,
      description: e.description,
      points: e.points,
      homeScore: e.homeScore,
      awayScore: e.awayScore,
      sourceEventId: e.sourceEventId,
    }));

    const artifact = {
      historyVersion: HISTORY_VERSION,
      season,
      sourceFingerprint,
      generatedAt: new Date().toISOString(),
      summary,
      playerGames: pgRows,
      teamGames: tgRows,
      scoreTimeline: scoreTimelineAvailable ? timeline : null,
      gameFlow: flow
        ? {
            largestHomeLead: flow.largestHomeLead,
            largestAwayLead: flow.largestAwayLead,
            largestDeficitOvercomeByWinner:
              flow.largestDeficitOvercomeByWinner,
            leadChanges: flow.leadChanges,
            ties: flow.ties,
            largestStrictRunHome: runToPlain(flow.largestStrictRunHome),
            largestStrictRunAway: runToPlain(flow.largestStrictRunAway),
            // keep top runs only for size
            topRuns: flow.runs
              .slice()
              .sort((a, b) => b.points - a.points)
              .slice(0, 8)
              .map(runToPlain),
          }
        : null,
      events: compactEvents,
    };

    writeFileSync(gameOut, JSON.stringify(artifact));
    gameSummaries.push(summary);
    processed++;
    if (processed % 100 === 0) {
      console.error(`processed ${processed}/${ids.length}`);
    }
  }

  // Rebuild indexes from summaries (including resumed)
  for (const s of gameSummaries) {
    const gid = String(s.gameId);
    const hid = String(s.homeTeamId);
    const aid = String(s.awayTeamId);
    for (const tid of [hid, aid]) {
      if (!indexByTeam.has(tid)) indexByTeam.set(tid, []);
      if (!indexByTeam.get(tid)!.includes(gid))
        indexByTeam.get(tid)!.push(gid);
    }
    const d = String(s.date || "");
    if (d) {
      if (!indexByDate.has(d)) indexByDate.set(d, []);
      if (!indexByDate.get(d)!.includes(gid)) indexByDate.get(d)!.push(gid);
    }
  }
  for (const pg of playerGames) {
    const pid = String(pg.playerId);
    const gid = String(pg.gameId);
    if (!indexByPlayer.has(pid)) indexByPlayer.set(pid, []);
    if (!indexByPlayer.get(pid)!.includes(gid))
      indexByPlayer.get(pid)!.push(gid);
  }

  writeFileSync(
    path.join(outDir, "game-summaries.json"),
    JSON.stringify({
      historyVersion: HISTORY_VERSION,
      season,
      generatedAt: new Date().toISOString(),
      games: gameSummaries,
    })
  );
  writeFileSync(
    path.join(outDir, "player-games.json"),
    JSON.stringify({
      historyVersion: HISTORY_VERSION,
      season,
      rows: playerGames,
    })
  );
  writeFileSync(
    path.join(outDir, "team-games.json"),
    JSON.stringify({
      historyVersion: HISTORY_VERSION,
      season,
      rows: teamGames,
    })
  );
  writeFileSync(
    path.join(outDir, "index-by-team.json"),
    JSON.stringify(Object.fromEntries(indexByTeam))
  );
  writeFileSync(
    path.join(outDir, "index-by-player.json"),
    JSON.stringify(Object.fromEntries(indexByPlayer))
  );
  writeFileSync(
    path.join(outDir, "index-by-date.json"),
    JSON.stringify(Object.fromEntries(indexByDate))
  );

  const seasonManifest = {
    season,
    gamesExpected: expectedGames,
    gamesOnDisk: allIds.length,
    gamesProcessed: processed,
    gameSummaryRows: gameSummaries.length,
    playerGameRows: playerGames.length,
    teamGameRows: teamGames.length,
    scoreTimelineSupported,
    scoreTimelineMismatch,
    boxMissing,
    pbpMissing,
    historyVersion: HISTORY_VERSION,
    sourceFingerprint: sha256(
      gameSummaries.map((g) => g.sourceFingerprint).join("|")
    ).slice(0, 24),
    status:
      processed >= allIds.length
        ? "COMPLETE"
        : limit > 0
          ? "PARTIAL"
          : processed > 0
            ? "PARTIAL"
            : "FAILED",
    startedAt,
    completedAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(outDir, "season-manifest.json"),
    JSON.stringify(seasonManifest, null, 2) + "\n"
  );

  // Update root manifest
  const rootManifestPath = path.join(HISTORY_ROOT, "manifest.json");
  let root: {
    historyVersion: string;
    seasons: Record<string, unknown>;
  } = { historyVersion: HISTORY_VERSION, seasons: {} };
  if (existsSync(rootManifestPath)) {
    try {
      root = JSON.parse(readFileSync(rootManifestPath, "utf8"));
    } catch {
      /* */
    }
  }
  root.historyVersion = HISTORY_VERSION;
  root.seasons[season] = seasonManifest;
  writeFileSync(rootManifestPath, JSON.stringify(root, null, 2) + "\n");

  console.log(JSON.stringify(seasonManifest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
