/**
 * P18C route HTML size smoke (production server).
 * PERF_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/p18c-measure-routes.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "reports", "p18c");

const ROUTES = [
  { key: "team_current", path: "/teams/13" },
  { key: "team_historical_2005", path: "/teams/25?season=2005-06&from=history" },
  { key: "team_early", path: "/teams/25?season=1996-97&from=history" },
  { key: "franchise_okc", path: "/franchises/okc" },
  { key: "matchup_large", path: "/teams/13/vs/24" },
  { key: "matchup_small", path: "/teams/1/vs/2" },
  { key: "history_2005_06", path: "/history/2005-06" },
  {
    key: "game_fixture",
    path: "/games/0020500001?from=history&season=2005-06",
  },
];

async function measure(routePath: string) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${routePath}`, {
    headers: { Accept: "text/html" },
  });
  const html = await res.text();
  const ms = Date.now() - t0;
  const gameLinks = (html.match(/href="\/games\//g) ?? []).length;
  return {
    status: res.status,
    htmlBytes: Buffer.byteLength(html, "utf8"),
    gameLinks,
    ms,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const r of ROUTES) {
    try {
      const m = await measure(r.path);
      rows.push({ key: r.key, path: r.path, ...m });
      console.log(
        `${r.key}: ${m.htmlBytes} bytes · ${m.gameLinks} game links · ${m.ms}ms · ${m.status}`
      );
    } catch (e) {
      rows.push({
        key: r.key,
        path: r.path,
        status: 0,
        htmlBytes: -1,
        gameLinks: 0,
        ms: -1,
        error: String(e),
      });
      console.error(r.key, e);
    }
  }

  const over600 = rows.filter((r) => r.htmlBytes > 600_000);
  const over1mb = rows.filter((r) => r.htmlBytes >= 1_000_000);

  writeFileSync(
    path.join(OUT, "20_team_page_performance.csv"),
    [
      "key,path,htmlBytes,gameLinks,ms,status",
      ...rows
        .filter((r) => r.key.startsWith("team_"))
        .map(
          (r) =>
            `${r.key},${r.path},${r.htmlBytes},${r.gameLinks},${r.ms},${r.status}`
        ),
    ].join("\n")
  );
  writeFileSync(
    path.join(OUT, "21_franchise_page_performance.csv"),
    [
      "key,path,htmlBytes,gameLinks,ms,status",
      ...rows
        .filter((r) => r.key.startsWith("franchise_"))
        .map(
          (r) =>
            `${r.key},${r.path},${r.htmlBytes},${r.gameLinks},${r.ms},${r.status}`
        ),
    ].join("\n")
  );
  writeFileSync(
    path.join(OUT, "22_matchup_page_performance.csv"),
    [
      "key,path,htmlBytes,gameLinks,ms,status",
      ...rows
        .filter((r) => r.key.startsWith("matchup_"))
        .map(
          (r) =>
            `${r.key},${r.path},${r.htmlBytes},${r.gameLinks},${r.ms},${r.status}`
        ),
    ].join("\n")
  );

  writeFileSync(
    path.join(OUT, "_route_html_measure.json"),
    JSON.stringify(
      {
        base: BASE,
        rows,
        over600kb: over600.map((r) => ({
          key: r.key,
          htmlBytes: r.htmlBytes,
        })),
        over1mb: over1mb.map((r) => ({ key: r.key, htmlBytes: r.htmlBytes })),
        history2005: rows.find((r) => r.key === "history_2005_06"),
        gameFixture: rows.find((r) => r.key === "game_fixture"),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
