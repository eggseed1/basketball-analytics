/**
 * Bake ESPN current roster → playerId map for Cloudflare Workers.
 * Keeps search + player identity aligned with sentiment after offseason moves.
 *
 *   node scripts/build-runtime-current-roster.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "current-roster-snapshot.json"
);
const SENTIMENT = path.join(
  ROOT,
  "src",
  "data",
  "runtime",
  "sentiment-snapshot.json"
);

const SITE_API = "https://site.api.espn.com";
const TEAM_IDS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
];

function currentSeason() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function fetchTeamRoster(teamId) {
  const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "BasketballAnalytics/0.1",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const season = currentSeason();
  /** @type {Record<string, { teamId: string, teamAbbr: string, teamName: string }>} */
  const byPlayerId = {};
  let teamsOk = 0;

  for (const teamId of TEAM_IDS) {
    try {
      const payload = await fetchTeamRoster(teamId);
      const abbr = String(payload.team?.abbreviation ?? "").toUpperCase();
      const name = String(payload.team?.displayName ?? "");
      const tid = String(payload.team?.id ?? teamId);
      for (const athlete of payload.athletes ?? []) {
        const id = String(athlete.id ?? "").trim();
        if (!id) continue;
        byPlayerId[id] = {
          teamId: tid,
          teamAbbr: abbr || tid,
          teamName: name,
        };
      }
      teamsOk += 1;
      console.log(`[current-roster] ${abbr || teamId} → ${(payload.athletes ?? []).length}`);
    } catch (error) {
      console.warn(
        `[current-roster] team ${teamId} skipped: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  // Sentiment profiles already track post-trade teamKey — fill gaps / confirm.
  try {
    const sentiment = JSON.parse(await fs.readFile(SENTIMENT, "utf8"));
    const profiles = sentiment?.profiles ?? sentiment?.players ?? [];
    for (const profile of profiles) {
      const teamKey = String(profile.teamKey ?? "").trim();
      if (!teamKey) continue;
      const ids = [
        ...(Array.isArray(profile.playerIds) ? profile.playerIds : []),
        profile.playerId,
      ]
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
      for (const id of ids) {
        if (byPlayerId[id]) continue;
        byPlayerId[id] = {
          teamId: teamKey,
          teamAbbr: teamKey,
          teamName: "",
        };
      }
    }
  } catch {
    /* optional */
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    season,
    source: "espn-site-roster",
    playerCount: Object.keys(byPlayerId).length,
    players: byPlayerId,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload));
  const gz = gzipSync(Buffer.from(JSON.stringify(payload))).length;
  console.log(
    `[current-roster] wrote ${OUT} players=${payload.playerCount} teamsOk=${teamsOk} gzip~${gz}`
  );
}

main().catch((error) => {
  console.error("[current-roster] failed", error);
  process.exit(1);
});
