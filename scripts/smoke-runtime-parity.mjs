import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { requireHealthyPage } from "./lib/runtime-smoke-html.mjs";

const host = "127.0.0.1";
const port = 3221;
const origin = `http://${host}:${port}`;
const diagnosticsDir = "/tmp/runtime-parity";
mkdirSync(diagnosticsDir, { recursive: true });

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
  const body = await response.text();
  writeFileSync(`${diagnosticsDir}/${route.replace(/[^a-z0-9.-]/gi, "_")}.html`, body);
  return { status: response.status, body };
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
  return requireHealthyPage(route, result);
}

async function main() {
  await waitForServer();

  const teamRoute = "/teams/25?season=2025-26";
  const team = await get(teamRoute);
  const teamText = requireHealthy(teamRoute, team);
  if (!teamText.includes("Oklahoma City Thunder")) {
    throw new Error("team identity did not render");
  }
  if (teamText.includes("Season board unavailable for 2025-26")) {
    throw new Error("team season board is still unavailable in Vercel runtime");
  }
  for (const marker of ["Strengths and weaknesses", "Team profile", "Where they stand", "Against the league"]) {
    if (!teamText.includes(marker)) {
      throw new Error(`team analytical overview is missing: ${marker}`);
    }
  }

  const offenseRoute = `${teamRoute}&tab=offense`;
  const offense = await get(offenseRoute);
  const offenseText = requireHealthy(offenseRoute, offense);
  for (const marker of ["Team offense ranks", "Team defense ranks", "Roster scoring board"]) {
    if (!offenseText.includes(marker)) {
      throw new Error(`team offense/defense tab is missing: ${marker}`);
    }
  }

  const gameRoute = "/games/401811018?season=2025-26";
  const game = await get(gameRoute);
  const gameText = requireHealthy(gameRoute, game);
  for (const marker of [
    "Box score, Game Lab, and possession analysis will appear when detailed game data is available.",
    "Game unavailable",
    "Loading game from ESPN",
  ]) {
    if (gameText.includes(marker)) throw new Error(`Game Lab regressed to fallback: ${marker}`);
  }
  if (!gameText.includes("Game flow")) {
    throw new Error(`Game Lab flow is missing from completed game. Page text: ${gameText.slice(-2200)}`);
  }
  if (!gameText.includes("Possession")) {
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
