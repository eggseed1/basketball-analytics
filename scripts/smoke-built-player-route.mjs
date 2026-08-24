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

async function fetchWithTimeout(path, timeoutMs, accept = "text/html,application/xhtml+xml") {
  const started = Date.now();
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: accept,
      "User-Agent": "basketball-analytics-build-smoke/1.0",
    },
  });
  const body = await response.text();
  return { status: response.status, body, elapsedMs: Date.now() - started };
}

async function waitForServer() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) {
      throw new Error(`Next server exited early with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Next production server did not become ready in 25 seconds");
}

const FAILURE_MARKERS = [
  "Player page interrupted",
  "Application interrupted",
  "This page could not finish loading",
  "Internal Server Error",
];

function assertNoFailureBoundary(path, result) {
  if (result.status !== 200) throw new Error(`${path} returned HTTP ${result.status}`);
  const marker = FAILURE_MARKERS.find((value) => result.body.includes(value));
  if (marker) throw new Error(`${path} rendered failure boundary: ${marker}`);
}

function assertPlayerResponse(path, result) {
  assertNoFailureBoundary(path, result);
  if (!result.body.includes("Shai Gilgeous-Alexander")) {
    throw new Error(`${path} did not render the verified player identity`);
  }
  if (!result.body.includes("Upcoming games")) {
    throw new Error(`${path} did not render the upcoming-games island`);
  }
  console.log(`[player-route-smoke] ${path} -> 200 in ${result.elapsedMs}ms`);
}

function assertGameResponse(path, result) {
  assertNoFailureBoundary(path, result);
  if (result.body.includes("Game data unavailable")) {
    throw new Error(`${path} rendered the game-unavailable state`);
  }
  console.log(`[game-route-smoke] ${path} -> 200 in ${result.elapsedMs}ms`);
}

async function main() {
  await waitForServer();

  for (const path of [
    "/players/4278073",
    "/players/4278073?season=2024-25&view=overview",
  ]) {
    assertPlayerResponse(path, await fetchWithTimeout(path, 25_000));
  }

  const gamePath = "/games/401584893";
  assertGameResponse(gamePath, await fetchWithTimeout(gamePath, 25_000));

  const upcomingPath = "/api/scores/upcoming?season=2026-27&limit=5";
  const upcoming = await fetchWithTimeout(upcomingPath, 25_000, "application/json");
  if (upcoming.status !== 200) {
    throw new Error(`${upcomingPath} returned HTTP ${upcoming.status}`);
  }
}

try {
  await main();
} catch (error) {
  console.error("[production-route-smoke] failed", error);
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
