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

async function fetchWithTimeout(path, timeoutMs) {
  const started = Date.now();
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "basketball-analytics-build-smoke/1.0",
    },
  });
  const body = await response.text();
  return {
    status: response.status,
    body,
    elapsedMs: Date.now() - started,
  };
}

async function waitForServer() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) {
      throw new Error(`Next server exited early with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(`${origin}/`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status < 500) return;
    } catch {
      // Keep polling until the production server is listening.
    }
    await delay(250);
  }
  throw new Error("Next production server did not become ready in 25 seconds");
}

const failureMarkers = [
  "Player page interrupted",
  "Application interrupted",
  "This page could not finish loading",
  "Internal Server Error",
];

function assertHealthyHtml(path, result) {
  if (result.status !== 200) {
    throw new Error(`${path} returned HTTP ${result.status}`);
  }
  const marker = failureMarkers.find((value) => result.body.includes(value));
  if (marker) {
    throw new Error(`${path} rendered failure boundary: ${marker}`);
  }
}

function assertPlayerResponse(path, result) {
  assertHealthyHtml(path, result);
  if (!result.body.includes("Shai Gilgeous-Alexander")) {
    throw new Error(`${path} returned 200 but did not render the verified player identity`);
  }
  if (path === "/players/4278073" && !result.body.includes("Upcoming games")) {
    throw new Error(`${path} rendered without the upcoming-games surface`);
  }

  console.log(
    `[route-smoke] ${path} -> ${result.status} in ${result.elapsedMs}ms (${result.body.length} bytes)`
  );
}

function firstGameHref(html) {
  const decoded = html.replaceAll("&amp;", "&");
  const match = decoded.match(/href=["'](\/games\/[^"'#?\s]+(?:\?[^"'#\s]*)?)["']/i);
  return match?.[1] ?? null;
}

function assertResolvedGame(path, result) {
  assertHealthyHtml(path, result);
  if (result.body.includes("Game unavailable")) {
    throw new Error(`${path} rendered Game unavailable`);
  }
  console.log(
    `[route-smoke] ${path} -> ${result.status} in ${result.elapsedMs}ms (${result.body.length} bytes)`
  );
}

async function main() {
  await waitForServer();

  const playerRoutes = [
    "/players/4278073",
    "/players/4278073?season=2024-25&view=overview",
  ];

  let playerLanding = null;
  for (const path of playerRoutes) {
    const result = await fetchWithTimeout(path, 25_000);
    assertPlayerResponse(path, result);
    if (path === "/players/4278073") playerLanding = result;
  }

  const scores = await fetchWithTimeout("/scores", 25_000);
  assertHealthyHtml("/scores", scores);
  if (scores.body.includes("No upcoming games on the ESPN scoreboard yet.")) {
    throw new Error("/scores returned 200 but the upcoming schedule is empty");
  }
  const scoresGameHref = firstGameHref(scores.body);
  if (!scoresGameHref) {
    throw new Error("/scores returned 200 but did not contain any game destination");
  }
  console.log(
    `[route-smoke] /scores -> ${scores.status} in ${scores.elapsedMs}ms (${scores.body.length} bytes)`
  );

  // Player schedule should also produce a real destination for an active player.
  const playerGameHref = firstGameHref(playerLanding?.body ?? "");
  if (!playerGameHref) {
    throw new Error("/players/4278073 rendered Upcoming games without a game destination");
  }

  // Verify a current schedule destination and the exact historical ESPN-id
  // regression reported from production. The latter proves the independent
  // cdn.espn.com fallback works when site.api.espn.com is unavailable.
  for (const path of [
    playerGameHref,
    scoresGameHref,
    "/games/401811018?season=2025-26",
  ]) {
    const game = await fetchWithTimeout(path, 25_000);
    assertResolvedGame(path, game);
  }
}

try {
  await main();
} catch (error) {
  console.error("[route-smoke] failed", error);
  console.error("--- captured Next server output ---");
  console.error(logs.join(""));
  process.exitCode = 1;
} finally {
  if (server.exitCode == null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(2_000),
    ]);
  }
  if (server.exitCode == null) server.kill("SIGKILL");
}
