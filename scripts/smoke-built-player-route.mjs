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

const FAILURE_MARKERS = [
  "Player page interrupted",
  "Application interrupted",
  "This page could not finish loading",
  "Internal Server Error",
];

function assertNoFailureBoundary(path, result) {
  if (result.status !== 200) {
    throw new Error(`${path} returned HTTP ${result.status}`);
  }
  const marker = FAILURE_MARKERS.find((value) => result.body.includes(value));
  if (marker) {
    throw new Error(`${path} rendered failure boundary: ${marker}`);
  }
}

function assertPlayerResponse(path, result) {
  assertNoFailureBoundary(path, result);
  if (!result.body.includes("Shai Gilgeous-Alexander")) {
    throw new Error(`${path} returned 200 but did not render the verified player identity`);
  }

  console.log(
    `[player-route-smoke] ${path} -> ${result.status} in ${result.elapsedMs}ms (${result.body.length} bytes)`
  );
}

function assertGameResponse(path, result) {
  assertNoFailureBoundary(path, result);
  if (
    result.body.includes("Game data unavailable") ||
    result.body.includes("could not be loaded")
  ) {
    throw new Error(`${path} rendered the game-unavailable state`);
  }
  console.log(
    `[game-route-smoke] ${path} -> ${result.status} in ${result.elapsedMs}ms (${result.body.length} bytes)`
  );
}

function assertUpcomingResponse(path, result) {
  if (result.status !== 200) {
    throw new Error(`${path} returned HTTP ${result.status}`);
  }
  let json;
  try {
    json = JSON.parse(result.body);
  } catch {
    throw new Error(`${path} did not return JSON`);
  }
  const count = Number(json.count ?? 0);
  if (!Array.isArray(json.data) || count < 1 || json.data.length < 1) {
    throw new Error(`${path} returned an empty upcoming schedule`);
  }
  console.log(
    `[upcoming-smoke] ${path} -> ${result.status} with ${count} games in ${result.elapsedMs}ms`
  );
}

async function main() {
  await waitForServer();

  const playerRoutes = [
    "/players/4278073",
    "/players/4278073?season=2024-25&view=overview",
  ];

  for (const path of playerRoutes) {
    const result = await fetchWithTimeout(path, 25_000);
    assertPlayerResponse(path, result);
  }

  const gamePath = "/games/401584893";
  assertGameResponse(gamePath, await fetchWithTimeout(gamePath, 25_000));

  const upcomingPath = "/api/scores/upcoming?season=2026-27&limit=5";
  assertUpcomingResponse(
    upcomingPath,
    await fetchWithTimeout(upcomingPath, 25_000, "application/json")
  );
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
