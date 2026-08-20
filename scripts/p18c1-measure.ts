/**
 * PERF_BASE_URL=http://127.0.0.1:3001 npx tsx scripts/p18c1-measure.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3001";
const OUT = path.join(process.cwd(), "reports", "p18c1");

const ROUTES = [
  { key: "current_knueppel", path: "/players/1642851" },
  { key: "dirk_2005", path: "/players/1717?season=2005-06&from=history" },
  {
    key: "dirk_games",
    path: "/players/1717?season=2005-06&view=games&from=history",
  },
  {
    key: "dirk_career",
    path: "/players/1717?season=2005-06&view=career&from=history",
  },
  { key: "lebron", path: "/players/1966?season=2012-13" },
  { key: "nash", path: "/players/959?season=2005-06&from=history" },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const r of ROUTES) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}${r.path}`, {
        headers: { Accept: "text/html" },
      });
      const html = await res.text();
      rows.push({
        key: r.key,
        path: r.path,
        status: res.status,
        htmlBytes: Buffer.byteLength(html, "utf8"),
        ms: Date.now() - t0,
        gameLinks: (html.match(/href="\/games\//g) ?? []).length,
      });
    } catch (e) {
      rows.push({
        key: r.key,
        path: r.path,
        status: 0,
        htmlBytes: -1,
        ms: -1,
        gameLinks: 0,
        error: String(e),
      });
    }
  }
  writeFileSync(
    path.join(OUT, "25_player_page_performance.csv"),
    [
      "key,path,htmlBytes,gameLinks,ms,status",
      ...rows.map(
        (r) =>
          `${r.key},${r.path},${r.htmlBytes},${r.gameLinks},${r.ms},${r.status}`
      ),
    ].join("\n")
  );
  writeFileSync(
    path.join(OUT, "_route_html_measure.json"),
    JSON.stringify(
      {
        rows,
        over600: rows.filter((r) => r.htmlBytes > 600_000),
        over1mb: rows.filter((r) => r.htmlBytes >= 1_000_000),
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(rows, null, 2));
}

main();
