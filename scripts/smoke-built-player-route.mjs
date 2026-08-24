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

function assertPlayerResponse(path, result) {
  const failureMarkers = [
    "Player page interrupted",
    "Application interrupted",
    "This page could not finish loading",
    "Internal Server Error",
  ];
  const marker = failureMarkers.find((value) => result.body.includes(value));

  if (result.status !== 200) {
    throw new Error(`${path} returned HTTP ${result.status}`);
  }
  if (marker) {
    throw new Error(`${path} rendered failure boundary: ${marker}`);
  }
  if (!result.body.includes("Shai Gilgeous-Alexander")) {
    throw new Error(`${path} returned 200 but did not render the verified player identity`);
  }

  console.log(
    `[player-route-smoke] ${path} -> ${result.status} in ${result.elapsedMs}ms (${result.body.length} bytes)`
  );
}

async function main() {
  await waitForServer();

  const routes = [
    "/players/4278073",
    "/players/4278073?season=2024-25&view=overview",
  ];

  for (const path of routes) {
    const result = await fetchWithTimeout(path, 25_000);
    assertPlayerResponse(path, result);
  }
}

try {
  await main();
} catch (error) {
  console.error("[player-route-smoke] failed", error);
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
