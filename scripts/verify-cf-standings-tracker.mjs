#!/usr/bin/env node
/**
 * Post-deploy Cloudflare verification: runtime policy (paid/full), standings
 * tracker, player/team pages, and baked play-by-play smoke.
 * Usage: node scripts/verify-cf-standings-tracker.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadVerifyGameId() {
  try {
    const index = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "src", "data", "runtime", "pbp-index.json"),
        "utf8"
      )
    );
    if (index?.verifyGameId && index?.games?.[index.verifyGameId]) {
      return String(index.verifyGameId);
    }
    const first = Object.keys(index?.games ?? {})[0];
    if (first) return first;
  } catch {
    // fall through
  }
  return "401766128";
}

const VERIFY_PBP_GAME_ID = loadVerifyGameId();
const BASE =
  process.argv[2] ||
  process.env.CF_BASE_URL ||
  "https://basketball-analytics.drbl-analytics.workers.dev";

async function fetchText(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "DRBL-cf-verify/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  return { url, status: res.status, text };
}

async function fetchJson(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "DRBL-cf-verify/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { url, status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const checks = [];

{
  const { status, json, url } = await fetchJson("/api/runtime-policy");
  const policy = json?.policy ?? {};
  checks.push({
    name: "runtime-policy HTTP 200",
    ok: status === 200,
    url,
    status,
  });
  checks.push({
    name: "runtime-policy ok (paid full product)",
    ok: json?.ok === true,
    url,
  });
  checks.push({
    name: "fullEdgeProduct true",
    ok: policy.fullEdgeProduct === true,
    url,
  });
  checks.push({
    name: "slimEdgeProduct false",
    ok: policy.slimEdgeProduct === false,
    url,
  });
  checks.push({
    name: "longUpstreamBudgets true",
    ok: policy.longUpstreamBudgets === true,
    url,
  });
}

{
  const { status, text, url } = await fetchText(
    "/standings?view=tracker&season=2024-25"
  );
  checks.push({ name: "tracker HTTP 200", ok: status === 200, url, status });
  checks.push({
    name: "tracker shows race copy",
    ok: /games above|\.500|race tracker/i.test(text),
    url,
  });
  checks.push({
    name: "tracker tab / quick pick present",
    ok:
      /Quick pick|aria-label="Standings views"|view=tracker/i.test(text) ||
      /Tracker/i.test(text),
    url,
  });
  checks.push({
    name: "not old table-only shell",
    ok: !/conference race - W\/L, games back, and scoring margin\./.test(text),
    url,
  });
  checks.push({
    name: "has team data or empty-season message",
    ok:
      /Quick pick|No completed regular-season|regular-season games/i.test(text) ||
      /OKC|BOS|\+?\d{1,2}/.test(text),
    url,
  });
}

{
  const { status, text, url } = await fetchText("/standings");
  checks.push({ name: "table HTTP 200", ok: status === 200, url, status });
  checks.push({
    name: "Open tracker CTA on table view",
    ok: /Open tracker|view=tracker/i.test(text),
    url,
  });
}

{
  // Nikola Jokic — charts / career islands should not be free-tier stubs.
  const { status, text, url } = await fetchText("/players/203999");
  checks.push({ name: "player page HTTP 200", ok: status === 200, url, status });
  checks.push({
    name: "player page not free-tier limited stub",
    ok: !/temporarily limited on this edge/i.test(text),
    url,
  });
}

const playerTabChecks = [
  {
    view: "overview",
    season: "2024-25",
    name: "overview has stats/percentile chrome",
    ok: (t) =>
      /Statistics|Season stats|Closest/i.test(t) &&
      (/Hustle/i.test(t) || /Deflections|Contested/i.test(t)),
  },
  {
    view: "sentiment",
    season: "2024-25",
    name: "sentiment has fan/media content",
    ok: (t) => /Sentiment/i.test(t) && /Fan|Media|trade/i.test(t),
  },
  {
    view: "games",
    season: "2024-25",
    name: "game logs have rows",
    ok: (t) =>
      /Game logs/i.test(t) &&
      !/Game logs are temporarily limited/i.test(t) &&
      /\d{4}-\d{2}-\d{2}/.test(t),
  },
  {
    view: "career",
    season: "2024-25",
    name: "career has resume/board",
    ok: (t) => /Resume|Career|Season stats/i.test(t),
  },
  {
    view: "splits",
    season: "2024-25",
    name: "splits not empty",
    ok: (t) =>
      /Splits/i.test(t) && !/No games available to split/i.test(t),
  },
  {
    view: "shooting",
    season: "2024-25",
    name: "shooting has court coverage",
    ok: (t) =>
      /Coordinate-covered FGA/i.test(t) ||
      (/id="shooting"/i.test(t) && /<circle/i.test(t)),
  },
  {
    view: "advanced",
    season: "2024-25",
    name: "advanced has metrics viz",
    ok: (t) => /Advanced/i.test(t) && /DRBL|USG%|PER|TS%/i.test(t),
  },
  {
    view: "highs",
    season: "2024-25",
    name: "game highs not empty",
    ok: (t) =>
      /Game highs/i.test(t) &&
      !/No game highs available yet/i.test(t) &&
      /Season-high timeline|PTS\s+\d+/i.test(t),
  },
];

for (const tab of playerTabChecks) {
  const { status, text, url } = await fetchText(
    `/players/203999?view=${tab.view}&season=${encodeURIComponent(tab.season)}`
  );
  checks.push({
    name: `player ${tab.name}`,
    ok: status === 200 && tab.ok(text),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText("/players/1966");
  const hasAccolades =
    /\/awards\/(mvp|all-nba|all-star|finals-mvp|roy)/i.test(text) ||
    (/MVP|All-NBA|All-Star/i.test(text) && /Trophy|accolade/i.test(text));
  checks.push({
    name: "raptor accolades chips present",
    ok: status === 200 && hasAccolades,
    url,
    status,
  });
}

const lebronHistoryChecks = [
  {
    view: "shooting",
    season: "2015-16",
    name: "historical shooting 2015-16 has court coverage",
    ok: (t) =>
      (/Shot map|Frequency|Efficiency|Coordinate-covered/i.test(t) &&
        /<circle/i.test(t)) &&
      !/No shot locations for this view/i.test(t),
  },
  {
    view: "shooting",
    season: "2009-10",
    name: "historical shooting 2009-10 has court coverage",
    ok: (t) =>
      (/Shot map|Frequency|Efficiency|Coordinate-covered/i.test(t) &&
        /<circle/i.test(t)) &&
      !/No shot locations for this view/i.test(t),
  },
  {
    view: "games",
    season: "2015-16",
    name: "historical games 2015-16 not empty",
    ok: (t) =>
      /Game logs/i.test(t) &&
      /\d{4}-\d{2}-\d{2}/.test(t) &&
      !/Game logs are temporarily limited/i.test(t),
  },
];

for (const tab of lebronHistoryChecks) {
  const { status, text, url } = await fetchText(
    `/players/1966?view=${tab.view}&season=${encodeURIComponent(tab.season)}`
  );
  checks.push({
    name: `raptor ${tab.name}`,
    ok: status === 200 && tab.ok(text),
    url,
    status,
  });
}

// Asset smoke: historical shot charts must be baked for CF (stats.nba blocked).
for (const [season, id] of [
  ["2015-16", "2544"],
  ["2009-10", "2544"],
  ["2003-04", "2544"],
]) {
  const { status, url } = await fetchText(
    `/runtime/player-shots/${season}/${id}.json`
  );
  checks.push({
    name: `shot asset ${season}`,
    ok: status === 200,
    url,
    status,
  });
}

for (const [season, id] of [
  ["2015-16", "1966"],
  ["2009-10", "1966"],
]) {
  const { status, url } = await fetchText(
    `/runtime/player-game-logs/${season}/${id}.json`
  );
  checks.push({
    name: `game-log asset ${season}`,
    ok: status === 200,
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText(
    "/explore/players?season=2024-25&view=impact"
  );
  checks.push({
    name: "players leaderboard impact HTTP 200",
    ok: status === 200,
    url,
    status,
  });
  checks.push({
    name: "players board shows DARKO columns",
    ok: /DARKO|ODPM|DDPM/i.test(text),
    url,
  });
  checks.push({
    name: "players board shows DRBL/WAR1 columns",
    ok: /DRBL\/100|WAR1/i.test(text),
    url,
  });
  checks.push({
    name: "players board has impact stat values",
    ok: /darkoDpm|hasDarko/i.test(text) && /[+-]?\d+\.\d/.test(text),
    url,
  });
}

const teamTabChecks = [
  {
    tab: "overview",
    name: "overview board",
    ok: (t) => /How good|Overview|Offense|Defense|scorecard/i.test(t),
  },
  {
    tab: "players",
    name: "players roster",
    ok: (t) => /Roster|Who drives|rotation|Highest-value/i.test(t),
  },
  {
    tab: "offense",
    name: "offense ranks",
    ok: (t) => /Offense/i.test(t) && /Roster scoring|Team offense|PPG/i.test(t),
  },
  {
    tab: "defense",
    name: "defense hustle",
    ok: (t) => /Hustle/i.test(t) && /Contested shots|Deflections/i.test(t),
  },
  {
    tab: "lineups",
    name: "lineups rotation",
    ok: (t) => /Lineups|Rotation|Top rotation/i.test(t),
  },
  {
    tab: "games",
    name: "games schedule",
    ok: (t) => /Games/i.test(t) && /Recent games|Upcoming|Game Lab/i.test(t),
  },
  {
    tab: "splits",
    name: "splits home away",
    ok: (t) => /Splits/i.test(t) && /Home|Away|Last 10/i.test(t),
  },
  {
    tab: "playoffs",
    name: "playoffs bracket",
    ok: (t) => /Playoffs/i.test(t) && /First Round|bracket|Seed/i.test(t),
  },
  {
    tab: "history",
    name: "history arc",
    ok: (t) => /Team Arc|Franchise|History|Arc/i.test(t),
  },
  {
    tab: "organization",
    name: "organization front office",
    ok: (t) =>
      /Front office|Sentiment|Transactions|Cap|Organization|Ask DRBL/i.test(t),
  },
  {
    tab: "stats",
    name: "all stats ledger",
    ok: (t) => /All Stats|Season Evidence|Efficiency|Overall/i.test(t),
  },
];

for (const check of teamTabChecks) {
  const { status, text, url } = await fetchText(
    `/teams/7?tab=${check.tab}&season=2024-25`
  );
  checks.push({
    name: `team ${check.name}`,
    ok: status === 200 && check.ok(text),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText("/explore/teams");
  checks.push({
    name: "explore teams HTTP 200",
    ok: status === 200,
    url,
    status,
  });
  checks.push({
    name: "horizontal bracket round labels",
    ok:
      /First Round/i.test(text) &&
      /Conf\. Semis/i.test(text) &&
      /Conf\. Finals/i.test(text) &&
      /Finals/i.test(text),
    url,
  });
  checks.push({
    name: "not stacked mini-grid bracket",
    ok: !/grid-cols-\[minmax\(0,1fr\)_5\.5rem_minmax\(0,1fr\)\]/.test(text),
    url,
  });
}

{
  const { status, json, url } = await fetchJson(
    `/api/games/${VERIFY_PBP_GAME_ID}/play-by-play`
  );
  checks.push({
    name: "pbp API HTTP 200",
    ok: status === 200,
    url,
    status,
  });
  checks.push({
    name: "pbp API has events",
    ok: Number(json?.eventCount ?? 0) > 50,
    url,
  });
  checks.push({
    name: "pbp API source is baked or upstream",
    ok: /espn|cdn|disk|stats|sample/.test(String(json?.source ?? "")),
    url,
  });
}

{
  const { status, text, url } = await fetchText(
    `/games/${VERIFY_PBP_GAME_ID}`
  );
  checks.push({
    name: "game page HTTP 200",
    ok: status === 200,
    url,
    status,
  });
  checks.push({
    name: "possession explorer not fetch-failed",
    ok: !/Play-by-play is unavailable for this game\./i.test(text),
    url,
  });
  checks.push({
    name: "possession explorer has derived data",
    ok:
      /Derived team possessions:/i.test(text) ||
      /Show plays for possession/i.test(text),
    url,
  });
}

let failed = 0;
for (const check of checks) {
  const mark = check.ok ? "PASS" : "FAIL";
  if (!check.ok) failed += 1;
  console.log(
    `[${mark}] ${check.name}${check.status != null ? ` (HTTP ${check.status})` : ""}`
  );
}

if (failed) {
  console.error(
    `\n${failed} Cloudflare verification check(s) failed against ${BASE}`
  );
  process.exit(1);
}

console.log(`\nAll Cloudflare checks passed against ${BASE}`);
