/**
 * P18PERF.0 — production-equivalent route benchmark (TTFB / transfer / headers).
 *
 * Usage (server already on PORT, default 3000):
 *   npx tsx scripts/p18perf0-benchmark.ts baseline
 *   npx tsx scripts/p18perf0-benchmark.ts after
 *
 * Does not use next dev. Prefer: npm run build && npm run start
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const PHASE = (process.argv[2] ?? "baseline") as "baseline" | "after";
const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "reports", "p18perf0");

type RouteSpec = {
  key: string;
  path: string;
  notes?: string;
};

const ROUTES: RouteSpec[] = [
  { key: "home", path: "/" },
  { key: "players_current", path: "/explore/players" },
  { key: "players_2005_06", path: "/explore/players?season=2005-06" },
  { key: "players_2014", path: "/explore/players?season=2014-15" },
  { key: "player_knueppel", path: "/players/1642851" },
  { key: "player_matkovic", path: "/players/1631255" },
  { key: "player_hinson", path: "/players/1642396" },
  { key: "player_gardner", path: "/players/1642066" },
  { key: "player_dirk", path: "/players/1717" },
  { key: "player_richardson", path: "/players/2202" },
  { key: "player_redd", path: "/players/2072" },
  { key: "player_nash", path: "/players/959" },
  { key: "history_home", path: "/history" },
  { key: "history_2005_06", path: "/history/2005-06" },
  {
    key: "game_historical",
    path: "/games/0020500001?from=history&season=2005-06",
  },
  { key: "game_recent_shell", path: "/games/0020500001" },
  { key: "compare", path: "/compare" },
  { key: "learn", path: "/learn" },
];

type Sample = {
  route: string;
  path: string;
  mode: "cold" | "warm";
  status: number;
  ttfbMs: number;
  totalMs: number;
  htmlBytes: number;
  transferBytes: number;
  serverTiming: string;
  cacheControl: string;
  contentType: string;
};

async function hit(route: RouteSpec, mode: "cold" | "warm"): Promise<Sample> {
  const url = `${BASE}${route.path}`;
  const t0 = performance.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: { Accept: "text/html", "Cache-Control": "no-cache" },
  });
  const ttfbMs = performance.now() - t0;
  const buf = Buffer.from(await res.arrayBuffer());
  const totalMs = performance.now() - t0;
  return {
    route: route.key,
    path: route.path,
    mode,
    status: res.status,
    ttfbMs: Math.round(ttfbMs * 10) / 10,
    totalMs: Math.round(totalMs * 10) / 10,
    htmlBytes: buf.byteLength,
    transferBytes: buf.byteLength,
    serverTiming: res.headers.get("server-timing") ?? "",
    cacheControl: res.headers.get("cache-control") ?? "",
    contentType: res.headers.get("content-type") ?? "",
  };
}

function toCsv(rows: Sample[]): string {
  const cols = [
    "route",
    "path",
    "mode",
    "status",
    "ttfbMs",
    "totalMs",
    "htmlBytes",
    "transferBytes",
    "serverTiming",
    "cacheControl",
  ] as const;
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          const v = String(r[c] ?? "");
          return v.includes(",") || v.includes('"')
            ? `"${v.replace(/"/g, '""')}"`
            : v;
        })
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const health = await fetch(`${BASE}/`).catch(() => null);
  if (!health) {
    console.error(`Server not reachable at ${BASE}. Start with: npm run start`);
    process.exit(1);
  }

  const samples: Sample[] = [];

  // Cold: first hit per route (process may already be warm from health check —
  // still mark first matrix pass as cold for the suite).
  for (const route of ROUTES) {
    samples.push(await hit(route, "cold"));
    console.log(
      `[cold] ${route.key} ${samples.at(-1)!.status} ttfb=${samples.at(-1)!.ttfbMs}ms bytes=${samples.at(-1)!.htmlBytes}`
    );
  }
  // Warm: immediate repeat
  for (const route of ROUTES) {
    samples.push(await hit(route, "warm"));
    console.log(
      `[warm] ${route.key} ${samples.at(-1)!.status} ttfb=${samples.at(-1)!.ttfbMs}ms bytes=${samples.at(-1)!.htmlBytes}`
    );
  }

  const suffix = PHASE === "after" ? "after" : "baseline";
  const csvName =
    PHASE === "after" ? "17_route_after.csv" : "02_route_baseline.csv";
  const payloadName =
    PHASE === "after" ? "20_payload_after.csv" : "05_payload_baseline.csv";
  writeFileSync(path.join(OUT, csvName), toCsv(samples));

  const payloadLines = [
    "route,mode,htmlBytes,transferBytes,status",
    ...samples.map(
      (s) =>
        `${s.route},${s.mode},${s.status === 0 ? 0 : s.htmlBytes},${s.transferBytes},${s.status}`
    ),
  ];
  writeFileSync(path.join(OUT, payloadName), payloadLines.join("\n") + "\n");

  const warm = samples.filter((s) => s.mode === "warm");
  const slowest = [...warm].sort((a, b) => b.ttfbMs - a.ttfbMs)[0];
  const digest = createHash("sha256")
    .update(JSON.stringify(samples))
    .digest("hex")
    .slice(0, 16);

  writeFileSync(
    path.join(OUT, `route_${suffix}_summary.json`),
    JSON.stringify(
      {
        phase: PHASE,
        baseUrl: BASE,
        routeCount: ROUTES.length,
        slowestWarm: slowest,
        samples,
        digest,
      },
      null,
      2
    )
  );

  console.log(`Wrote reports/p18perf0/${csvName}`);
  console.log(
    `Slowest warm: ${slowest?.route} ttfb=${slowest?.ttfbMs}ms html=${slowest?.htmlBytes}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
