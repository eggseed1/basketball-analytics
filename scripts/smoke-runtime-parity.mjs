import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const host = "127.0.0.1";
const port = 3221;
const origin = `http://${host}:${port}`;

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", host, "-p", String(port)],
  {
    env: { ...process.env, DATA_PROVIDER: "nba", VERCEL: "1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  }
);
server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);

async function get(route, timeoutMs = 40_000) {
  const response = await fetch(`${origin}${route}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "text/html", "User-Agent": "drbl-runtime-parity/1.0" },
  });
  return { status: response.status, body: await response.text() };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error("production server did not become ready");
}

function requireHealthy(route, result) {
  if (result.status !== 200) throw new Error(`${route} returned ${result.status}`);
  for (const marker of ["Internal Server Error", "Application interrupted", "This page could not finish loading"]) {
    if (result.body.includes(marker)) throw new Error(`${route} rendered ${marker}`);
  }
}

async function main() {
  await waitForServer();

  const teamRoute = "/teams/25?season=2025-26";
  const team = await get(teamRoute);
  requireHealthy(teamRoute, team);
  if (!team.body.includes("Oklahoma City Thunder")) {
    throw new Error("team identity did not render");
  }
  if (team.body.includes("Season board unavailable for 2025-26")) {
    throw new Error("team season board is still unavailable in Vercel runtime");
  }
  for (const marker of ["Strengths and weaknesses", "Offense profile", "Defense profile", "Four factors"]) {
    if (!team.body.includes(marker)) {
      throw new Error(`team analytical overview is missing: ${marker}`);
    }
  }

  const gameRoute = "/games/401811018?season=2025-26";
  const game = await get(gameRoute);
  requireHealthy(gameRoute, game);
  for (const marker of [
    "Box score, Game Lab, and possession analysis will appear when detailed game data is available.",
    "Game unavailable",
    "Loading game from ESPN",
  ]) {
    if (game.body.includes(marker)) throw new Error(`Game Lab regressed to fallback: ${marker}`);
  }
  if (!game.body.includes("Game flow")) {
    throw new Error("Game Lab flow is missing from completed game");
  }
  if (!game.body.includes("Possession")) {
    throw new Error("Possession surface is missing from completed game");
  }

  console.log("runtime parity smoke: ok");
}

try {
  await main();
} finally {
  if (server.exitCode == null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(2_000)]);
  }
  if (server.exitCode == null) server.kill("SIGKILL");
}
