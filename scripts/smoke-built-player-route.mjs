import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const host = "127.0.0.1";
const port = 3217;
const origin = `http://${host}:${port}`;
const logs = [];

function record(chunk) {
  const text = String(chunk);
  logs.push(text);
  process.stdout.write(text);
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", host, "-p", String(port)],
  {
    env: {
      ...process.env,
      DATA_PROVIDER: "nba",
      VERCEL: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);
server.stdout.on("data", record);
server.stderr.on("data", record);

async function fetchWithTimeout(route, timeoutMs = 30_000) {
  const started = Date.now();
  const response = await fetch(`${origin}${route}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "basketball-analytics-production-parity/2.0",
    },
  });
  const body = await response.text();
  return { status: response.status, body, elapsedMs: Date.now() - started };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`Next server exited early (${server.exitCode})`);
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Next production server did not become ready in 30 seconds");
}

const globalFailureMarkers = [
  "Player page interrupted",
  "Application interrupted",
  "This page could not finish loading",
  "Internal Server Error",
];

function assertHealthy(route, result) {
  if (result.status !== 200) throw new Error(`${route} returned HTTP ${result.status}`);
  const marker = globalFailureMarkers.find((value) => result.body.includes(value));
  if (marker) throw new Error(`${route} rendered failure boundary: ${marker}`);
  console.log(`[parity-smoke] ${route} -> 200 in ${result.elapsedMs}ms (${result.body.length} bytes)`);
}

function firstGameHref(html) {
  const decoded = html.replaceAll("&amp;", "&");
  const match = decoded.match(/href=["'](\/games\/[^"'#?\s]+(?:\?[^"'#\s]*)?)["']/i);
  return match?.[1] ?? null;
}

function assertDeepGame(route, result) {
  assertHealthy(route, result);
  const forbidden = [
    "Game unavailable",
    "Loading game from ESPN",
    "ESPN browser fallback",
    "Box score, Game Lab, and possession analysis will appear when detailed game data is available.",
    "Detailed Game Lab analysis is not available for this game yet.",
  ];
  const marker = forbidden.find((value) => result.body.includes(value));
  if (marker) throw new Error(`${route} lost deep game functionality: ${marker}`);
  if (!result.body.includes("Game flow")) {
    throw new Error(`${route} resolved but did not render Game Lab flow`);
  }
}

async function main() {
  await waitForServer();

  // Broad route-family health: a provider regression must not take down sibling
  // destinations just because Vercel is the host.
  for (const route of [
    "/",
    "/players",
    "/teams",
    "/compare",
    "/transactions",
    "/sentiment",
    "/movement",
    "/history",
    "/franchises",
    "/explore/players?season=2025-26",
    "/explore/teams?season=2025-26",
    "/explore/games?season=2025-26",
    "/teams/25?season=2025-26",
    "/teams/25/payroll",
    "/teams/25/draft-assets",
  ]) {
    assertHealthy(route, await fetchWithTimeout(route));
  }

  const player = await fetchWithTimeout("/players/4278073", 35_000);
  assertHealthy("/players/4278073", player);
  if (!player.body.includes("Shai Gilgeous-Alexander")) {
    throw new Error("player route did not render verified identity");
  }
  if (!player.body.includes("Upcoming games")) {
    throw new Error("player route did not render upcoming-games surface");
  }
  const playerGameHref = firstGameHref(player.body);
  if (!playerGameHref) throw new Error("player upcoming-games surface has no destination");
  if (!/\/games\/00\d{8}/.test(playerGameHref)) {
    throw new Error(`player schedule is not using canonical NBA GameIDs: ${playerGameHref}`);
  }

  for (const route of [
    "/players/4278073?season=2025-26&view=overview",
    "/players/4278073?season=2025-26&view=career",
    "/players/4278073?season=2025-26&view=games",
    "/players/4278073?season=2025-26&view=advanced",
  ]) {
    const result = await fetchWithTimeout(route, 35_000);
    assertHealthy(route, result);
    if (!result.body.includes("Shai Gilgeous-Alexander")) {
      throw new Error(`${route} lost player identity`);
    }
  }

  const scores = await fetchWithTimeout("/scores");
  assertHealthy("/scores", scores);
  for (const marker of [
    "Loading NBA schedule",
    "Live scores temporarily unavailable",
    "Schedule data is temporarily unavailable",
    "No upcoming games on the ESPN scoreboard yet.",
  ]) {
    if (scores.body.includes(marker)) throw new Error(`/scores rendered fallback marker: ${marker}`);
  }
  const scoresGameHref = firstGameHref(scores.body);
  if (!scoresGameHref) throw new Error("/scores contains no game destination");
  if (!/\/games\/00\d{8}/.test(scoresGameHref)) {
    throw new Error(`/scores is not using canonical NBA GameIDs: ${scoresGameHref}`);
  }

  const history = await fetchWithTimeout("/history/2025-26", 30_000);
  assertHealthy("/history/2025-26", history);
  if (history.body.includes("Season not precomputed yet")) {
    throw new Error("2025-26 history still depends on an ignored local artifact");
  }
  if (!history.body.includes("2025-26 NBA Season") || !firstGameHref(history.body)) {
    throw new Error("2025-26 history did not render deployed season/game discovery");
  }

  // Exact production regression plus its canonical NBA-ID destination. The
  // legacy ESPN link must translate to the same deep box/PBP pipeline.
  assertDeepGame(
    "/games/401811018?season=2025-26",
    await fetchWithTimeout("/games/401811018?season=2025-26", 35_000)
  );
  assertDeepGame(
    "/games/0022501163?season=2025-26",
    await fetchWithTimeout("/games/0022501163?season=2025-26", 35_000)
  );

  // Future games have no box/PBP by definition, but the matchup itself must be
  // a real server-rendered destination, not an unavailable/browser-fallback page.
  for (const route of [playerGameHref, scoresGameHref]) {
    const game = await fetchWithTimeout(route, 30_000);
    assertHealthy(route, game);
    for (const marker of ["Game unavailable", "Loading game from ESPN", "ESPN browser fallback"]) {
      if (game.body.includes(marker)) throw new Error(`${route} rendered fallback marker: ${marker}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error("[parity-smoke] failed", error);
  console.error("--- captured Next server output ---");
  console.error(logs.join(""));
  process.exitCode = 1;
} finally {
  if (server.exitCode == null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(2_000)]);
  }
  if (server.exitCode == null) server.kill("SIGKILL");
}
