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
    "/standings/tracker?season=2024-25"
  );
  checks.push({ name: "tracker HTTP 200", ok: status === 200, url, status });
  checks.push({
    name: "tracker shows race copy",
    ok: /games above|\.500|race tracker/i.test(text),
    url,
  });
  checks.push({
    name: "tracker add team control present",
    ok: /Add team|regular-season games/i.test(text) || /Tracker/i.test(text),
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
      /Add team|No completed regular-season|regular-season games/i.test(text) ||
      /OKC|BOS|\+?\d{1,2}/.test(text),
    url,
  });
}

{
  const { status, text, url } = await fetchText("/standings");
  checks.push({ name: "table HTTP 200", ok: status === 200, url, status });
  checks.push({
    name: "table view is standings-only",
    ok:
      /Standings/i.test(text) &&
      !/Open tracker|Team boards|Add team/i.test(text),
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
  const { status, text, url } = await fetchText(
    "/players/203999?view=overview&season=2024-25"
  );
  checks.push({
    name: "percentile expand control present",
    ok:
      status === 200 &&
      /Expand full percentile rankings/i.test(text) &&
      /percentile ranking/i.test(text),
    url,
    status,
  });
  checks.push({
    name: "percentile full-screen dialog shell",
    ok:
      status === 200 &&
      /Close full percentiles/i.test(text) &&
      /Percentile overview/i.test(text) &&
      /Career chart (&amp;|&) similar players/i.test(text),
    url,
    status,
  });
  checks.push({
    name: "player identity vitals on overview",
    ok:
      status === 200 &&
      /6(?:'|&#x27;|&#39;)\d+(?:\"|&quot;)/.test(text) &&
      /\d+\s*lb/i.test(text) &&
      (/Born \d{4}-\d{2}-\d{2}/.test(text) || /Age:\s*\d+/.test(text)) &&
      (/Pk\s+\d+/i.test(text) || /Undrafted/i.test(text)),
    url,
    status,
  });
}

{
  const { status, json, url } = await fetchJson(
    "/api/players/203999/percentiles?season=2024-25&mode=full"
  );
  const metrics = Array.isArray(json?.metrics) ? json.metrics : [];
  const withSeries = metrics.filter((m) => Array.isArray(m?.series) && m.series.length > 1);
  const withComps = metrics.filter(
    (m) => Array.isArray(m?.leagueComps) && m.leagueComps.length > 0
  );
  checks.push({
    name: "percentile full API HTTP 200",
    ok: status === 200,
    url,
    status,
  });
  checks.push({
    name: "percentile full API career series",
    ok: withSeries.length >= 10,
    url,
  });
  checks.push({
    name: "percentile full API league comps",
    ok: withComps.length >= 10,
    url,
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

{
  // Legend NBA ids remap to bref:{slug} on CF; awards + jerseys stay keyed by PERSON_ID.
  const { status, text, url } = await fetchText("/players/1718");
  const hasAccolades =
    /\/awards\/(mvp|all-nba|all-star|finals-mvp)/i.test(text) ||
    (/All-NBA|All-Star|Finals/i.test(text) && /Trophy|accolade/i.test(text));
  const hasRetired =
    /retir/i.test(text) &&
    (/#?\s*34\b/.test(text) || /Jersey/i.test(text));
  checks.push({
    name: "pierce accolades chips present",
    ok: status === 200 && hasAccolades,
    url,
    status,
  });
  checks.push({
    name: "pierce retired jersey present",
    ok: status === 200 && hasRetired,
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

{
  const { status, json, url } = await fetchJson(
    "/api/explore/players/board?season=2024-25&draftClass=2018&minimumMinutes=500"
  );
  const total = Number(json?.totalCount ?? 0);
  checks.push({
    name: "draftClass=2018 returns rows",
    ok: status === 200 && total > 0,
    url,
    status,
    detail: `totalCount=${total}`,
  });
}

{
  const { status, json, url } = await fetchJson(
    "/api/explore/players/board?season=2022-23&minimumMinutes=500&pageSize=250"
  );
  const rows = Array.isArray(json?.rows)
    ? json.rows
    : Array.isArray(json?.players)
      ? json.players
      : Array.isArray(json)
        ? json
        : [];
  const names = rows
    .map((r) => String(r?.playerName ?? r?.name ?? "").toLowerCase().trim())
    .filter(Boolean);
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  const dups = [...counts.entries()].filter(([, c]) => c > 1);
  const kyrie = rows.filter((r) =>
    /kyrie irving/i.test(String(r?.playerName ?? r?.name ?? ""))
  );
  checks.push({
    name: "2022-23 board has no duplicate player names",
    ok: status === 200 && rows.length > 50 && dups.length === 0,
    url,
    status,
    detail:
      dups.length === 0
        ? `rows=${rows.length}`
        : `dups=${dups
            .slice(0, 5)
            .map(([n, c]) => `${n}×${c}`)
            .join(", ")}`,
  });
  checks.push({
    name: "2022-23 Kyrie appears once with combined GP",
    ok:
      status === 200 &&
      kyrie.length === 1 &&
      Number(kyrie[0]?.gamesPlayed ?? kyrie[0]?.gp ?? 0) >= 55,
    url,
    status,
    detail: kyrie
      .map(
        (r) =>
          `${r.teamAbbreviation ?? r.teamAbbr ?? r.team ?? "?"}:${r.gamesPlayed ?? r.gp ?? "?"}`
      )
      .join("|") || "missing",
  });
}

{
  const { status, text, url } = await fetchText(
    "/explore/players/visualizations?season=2024-25&metric=points"
  );
  checks.push({
    name: "player race tracker HTTP 200",
    ok: status === 200,
    url,
    status,
  });
  checks.push({
    name: "player race tracker has curves",
    ok:
      status === 200 &&
      !/No baked game logs/i.test(text) &&
      (/Visualizations|Race tracker|Points|PTS/i.test(text) &&
        (/<svg|recharts|PlayerRace|currentValue/i.test(text) ||
          /\d{4}-\d{2}/.test(text))),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText(
    "/explore/players/visualizations?season=2024-25&metric=rebounds"
  );
  const hasCurve =
    /currentValue\\\":[1-9]|\"currentValue\":[1-9]/i.test(text) ||
    /Zubac|Sabonis|Towns|Joki/i.test(text);
  checks.push({
    name: "player race rebounds has non-zero curves",
    ok:
      status === 200 &&
      !/No baked game logs for top rebounds/i.test(text) &&
      hasCurve,
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText(
    "/explore/players/visualizations?season=2024-25&metric=war1"
  );
  checks.push({
    name: "player race WAR1 metric loads",
    ok:
      status === 200 &&
      (/WAR1/i.test(text) || /war1/i.test(text)) &&
      !/No bundled leaders for WAR1/i.test(text),
    url,
    status,
  });
  checks.push({
    name: "player race metric dropdown is comprehensive",
    ok:
      status === 200 &&
      /Impact|Advanced|Rebounding/i.test(text) &&
      (/option value=\\\"war1\\\"|value=\"war1\"/i.test(text) ||
        /WAR1 \(WAR1\)/i.test(text)),
    url,
    status,
  });
  checks.push({
    name: "player race pin search control present",
    ok: status === 200 && /Pin any player/i.test(text),
    url,
    status,
  });
  checks.push({
    name: "player race field size control present",
    ok:
      status === 200 &&
      (/Top 40|player-race-top|topN\\\":40|\"topN\":40/i.test(text) ||
        (text.match(/displayName\\\":\\\"/g) || []).length >= 30),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText(
    "/explore/players/visualizations?season=2024-25&metric=drbl100"
  );
  const hasDrbl =
    status === 200 &&
    (/DRBL\/100|DRBL/i.test(text) || /drbl100/i.test(text)) &&
    !/No bundled leaders/i.test(text);
  // Rate metrics must not advertise minute-paced cumulative curves.
  const falselyCumulative =
    /pace the season total across games by minutes/i.test(text);
  checks.push({
    name: "player race DRBL/100 is rate level not cumulative pace",
    ok: hasDrbl && !falselyCumulative && /rate level|season rate/i.test(text),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText("/awards/all-nba");
  checks.push({
    name: "all-nba history has team tiers",
    ok: status === 200 && /1st Team|2nd Team|3rd Team/i.test(text),
    url,
    status,
  });
  checks.push({
    name: "all-nba history uses real names",
    ok:
      status === 200 &&
      /Tim Duncan|Kobe Bryant|Michael Jordan|LeBron James/i.test(text) &&
      !/Player 1495|Player 977|Player 23\b/i.test(text),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText(
    "/api/players/search?q=Kobe&scope=all"
  );
  let kobeFirst = false;
  try {
    const body = JSON.parse(text);
    const results = Array.isArray(body?.results) ? body.results : [];
    kobeFirst =
      results.length > 0 &&
      /kobe bryant/i.test(String(results[0]?.name ?? ""));
  } catch {
    kobeFirst = false;
  }
  checks.push({
    name: "player search ranks Kobe Bryant first",
    ok: status === 200 && kobeFirst,
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText(
    "/api/players/search?q=Kareem&scope=all"
  );
  let hasKareem = false;
  try {
    const body = JSON.parse(text);
    const results = Array.isArray(body?.results) ? body.results : [];
    hasKareem = results.some((r) =>
      /kareem abdul/i.test(String(r?.name ?? ""))
    );
  } catch {
    hasKareem = false;
  }
  checks.push({
    name: "player search finds Kareem Abdul-Jabbar",
    ok: status === 200 && hasKareem,
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText("/players/977");
  checks.push({
    name: "legend Kobe page resolves",
    ok:
      status === 200 &&
      /Kobe|Bryant/i.test(text) &&
      (/hof-page-frame|hof-outline|Career|Seasons/i.test(text) ||
        /bryanko01/i.test(text)),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText("/players/76003");
  checks.push({
    name: "classic Kareem page resolves",
    ok:
      status === 200 &&
      /Kareem|Abdul-Jabbar|Abdul Jabbar/i.test(text) &&
      /cdn\.nba\.com\/headshots/i.test(text) &&
      (/hof-page-frame|hof-outline/i.test(text) ||
        /"honor":"hof"|honor:\\"hof\\"|honor\":\"hof\"/i.test(text)),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText("/players/77142");
  checks.push({
    name: "classic Magic page resolves",
    ok:
      status === 200 &&
      /Magic Johnson/i.test(text) &&
      /cdn\.nba\.com\/headshots/i.test(text),
    url,
    status,
  });
}

{
  const { status, text, url } = await fetchText("/players/893");
  checks.push({
    name: "HOF player page golden frame",
    ok:
      status === 200 &&
      (/hof-page-frame|hof-outline/i.test(text) ||
        /"honor":"hof"|honor:\\"hof\\"|honor\":\"hof\"/i.test(text)),
    url,
    status,
  });
  checks.push({
    name: "HOF player page has portrait",
    ok:
      status === 200 &&
      (/cdn\.nba\.com\/headshots|espncdn\.com\/i\/headshots/i.test(text) ||
        /893\.png/i.test(text) ||
        /portraitUrl\":\"https:/i.test(text)),
    url,
    status,
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
  const { status, text, url } = await fetchText(
    "/teams/2?tab=players&season=2021-22"
  );
  const playerLinks = (text.match(/href="\/players\/[^"]+"/g) || []).length;
  checks.push({
    name: "past-season team roster has players (2021-22 BOS)",
    ok: status === 200 && playerLinks >= 8 && /Who drives|Roster/i.test(text),
    url,
    status,
    detail: `playerLinks=${playerLinks}`,
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
    name: "explore teams is board-only (no bracket)",
    ok:
      (/Teams/i.test(text) || /point differential/i.test(text)) &&
      /point differential/i.test(text) &&
      !/First Round/i.test(text) &&
      !/Conf\. Semis/i.test(text),
    url,
  });
}

{
  const { status, text, url } = await fetchText("/explore/bracket");
  checks.push({
    name: "bracket HTTP 200",
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
