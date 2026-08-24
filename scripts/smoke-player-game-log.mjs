import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const host = "127.0.0.1";
const port = 3218;
const origin = `http://${host}:${port}`;
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
    stdio: "inherit",
  }
);

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`Next exited early (${server.exitCode})`);
    try {
      const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Next production server did not become ready");
}

async function get(route, accept = "text/html") {
  const response = await fetch(`${origin}${route}`, {
    signal: AbortSignal.timeout(35_000),
    headers: { Accept: accept },
  });
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`${route} returned ${response.status}: ${body.slice(0, 300)}`);
  }
  return body;
}

async function main() {
  await waitForServer();

  const apiRoute = "/api/players/4278073/games?season=2025-26";
  const payload = JSON.parse(await get(apiRoute, "application/json"));
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const regular = rows.filter((row) => (row.seasonType ?? "regular") === "regular");

  if (regular.length < 40) {
    throw new Error(`game log is still empty/incomplete: ${regular.length} regular-season rows`);
  }
  if (!regular.some((row) => Number(row.points) >= 30)) {
    throw new Error("game log has rows but scoring data is not factual");
  }
  if (!regular.some((row) => Number(row.fieldGoalsAttempted) >= 10)) {
    throw new Error("game log shooting data is missing");
  }
  const dated = regular.filter((row) => /^202[56]-\d{2}-\d{2}$/.test(String(row.gameDate ?? "")));
  if (dated.length < 40) {
    throw new Error(`game log dates are malformed: ${dated.length}/${regular.length}`);
  }
  const home = regular.filter((row) => row.isHome === true).length;
  const away = regular.filter((row) => row.isHome === false).length;
  if (home < 10 || away < 10) {
    throw new Error(`home/away parsing is broken: ${home} home, ${away} away`);
  }
  if (!regular.every((row) => String(row.opponentTeamId ?? "").trim())) {
    throw new Error("one or more game-log rows lost opponent identity");
  }

  const explicit = await get("/players/4278073?season=2025-26&view=games");
  if (!explicit.includes("Game logs")) throw new Error("Games tab did not render");
  if (explicit.includes("No regular-season games match these filters for 2025-26")) {
    throw new Error("2025-26 Games tab still renders empty");
  }

  const offseason = await get("/players/4278073?season=2026-27&view=games");
  if (!offseason.includes("2025-26")) {
    throw new Error("2026-27 offseason Games tab did not fall back to 2025-26");
  }
  if (offseason.includes("No regular-season games match these filters for 2025-26")) {
    throw new Error("offseason Games tab selected prior season but rendered no rows");
  }

  console.log(
    `[game-log-smoke] PASS: ${regular.length} regular rows; ${home} home / ${away} away`
  );
}

try {
  await main();
} finally {
  if (server.exitCode == null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(2000),
    ]);
  }
  if (server.exitCode == null) server.kill("SIGKILL");
}
