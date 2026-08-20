/**
 * Rendered tab HTML audit for P18C.1.3 — evaluates visible product content.
 * PERF_BASE_URL=http://127.0.0.1:3003 npx tsx scripts/p18c13-rendered-audit.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3003";
const OUT = path.join(process.cwd(), "reports", "p18c13");

const FIXTURES = [
  { playerId: "2544", season: "2012-13", label: "LeBron" },
  { playerId: "1717", season: "2005-06", label: "Dirk" },
  { playerId: "977", season: "2005-06", label: "Kobe" },
  { playerId: "1642851", season: null, label: "Knueppel" },
  { playerId: "959", season: "2005-06", label: "Nash" },
  { playerId: "2072", season: "2005-06", label: "Redd" },
];

const VIEWS = [
  "overview",
  "career",
  "games",
  "splits",
  "shooting",
  "advanced",
  "highs",
] as const;

function classify(html: string, view: string): {
  classification: string;
  visibleDataPoints: number;
  tableRows: number;
  charts: number;
  emptyState: string;
} {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const tableRows = (html.match(/<tr[\s>]/gi) ?? []).length;
  const charts =
    (html.match(/role="img"|viewBox=|PlayerSpark|season avg|percentile|Distribution|Baseline deltas|Shot diet|Career arc|timeline/gi) ??
      []).length;
  const tabular = (html.match(/tabular-nums/g) ?? []).length;
  const minis = (html.match(/text-\[1[456]px\] font-bold/g) ?? []).length;
  const visibleDataPoints = tabular + minis + Math.max(0, tableRows - 1);

  const emptyPhrases = [
    "unavailable",
    "No game log",
    "No attempt data",
    "coming soon",
    "not available",
    "Shooting breakdown unavailable",
    "No player-game rows",
    "No games available",
  ];
  const emptyHits = emptyPhrases.filter((p) =>
    text.toLowerCase().includes(p.toLowerCase())
  ).length;

  let classification = "USEFUL_BUT_INCOMPLETE";
  if (view === "overview" && visibleDataPoints > 40) classification = "COMPLETE";
  if (view === "career" && tableRows > 10 && charts > 0) classification = "COMPLETE";
  if (view === "career" && tableRows > 10 && charts === 0)
    classification = "USEFUL_BUT_INCOMPLETE";
  if (view === "games" && tableRows > 20 && charts > 0) classification = "COMPLETE";
  if (view === "games" && tableRows > 20 && charts === 0)
    classification = "USEFUL_BUT_INCOMPLETE";
  if (view === "splits" && tableRows > 10 && charts > 0) classification = "COMPLETE";
  if (view === "splits" && tableRows > 5 && charts === 0) classification = "SPARSE";
  if (view === "shooting" && visibleDataPoints > 20 && charts > 0)
    classification = "COMPLETE";
  if (view === "shooting" && charts === 0 && visibleDataPoints < 30)
    classification = "SPARSE";
  if (view === "advanced" && visibleDataPoints > 15 && charts > 0)
    classification = "COMPLETE";
  if (view === "advanced" && visibleDataPoints < 15) classification = "SPARSE";
  if (view === "highs" && (tableRows > 5 || (charts > 0 && visibleDataPoints >= 18)))
    classification = "COMPLETE";
  if (view === "highs" && visibleDataPoints < 12 && tableRows < 2)
    classification = "SPARSE";
  if (visibleDataPoints < 5) classification = "EMPTY";
  if (emptyHits > 2 && visibleDataPoints < 10) classification = "EMPTY";

  return {
    classification,
    visibleDataPoints,
    tableRows,
    charts,
    emptyState: emptyHits > 0 ? "partial" : "none",
  };
}

async function fetchView(
  playerId: string,
  season: string | null,
  view: string
) {
  const q = new URLSearchParams();
  if (season) q.set("season", season);
  if (view !== "overview") q.set("view", view);
  const url = `${BASE}/players/${playerId}?${q.toString()}`;
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  const html = await res.text();
  return { status: res.status, html, bytes: Buffer.byteLength(html), url };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows: Array<Record<string, string | number>> = [];
  for (const f of FIXTURES) {
    for (const view of VIEWS) {
      try {
        const r = await fetchView(f.playerId, f.season, view);
        const c = classify(r.html, view);
        rows.push({
          playerId: f.playerId,
          label: f.label,
          season: f.season ?? "default",
          view,
          capabilityExpected: "yes",
          classification: c.classification,
          visibleDataPoints: c.visibleDataPoints,
          tableRows: c.tableRows,
          charts: c.charts,
          emptyState: c.emptyState,
          htmlBytes: r.bytes,
          status: r.status,
          rootCause: c.classification === "SPARSE" || c.classification === "EMPTY"
            ? "thin_tab_ui"
            : "",
        });
        console.log(
          `${f.label} ${view}: ${c.classification} pts=${c.visibleDataPoints} rows=${c.tableRows} charts=${c.charts} ${r.bytes}b`
        );
      } catch (e) {
        rows.push({
          playerId: f.playerId,
          label: f.label,
          season: f.season ?? "default",
          view,
          capabilityExpected: "yes",
          classification: "BROKEN",
          visibleDataPoints: 0,
          tableRows: 0,
          charts: 0,
          emptyState: "error",
          htmlBytes: 0,
          status: 0,
          rootCause: String(e),
        });
      }
    }
  }

  const keys = Object.keys(rows[0] ?? {});
  const csv = [
    keys.join(","),
    ...rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(",")),
  ].join("\n");
  writeFileSync(path.join(OUT, "02_rendered_tab_audit.csv"), csv);
  writeFileSync(
    path.join(OUT, "_rendered_audit.json"),
    JSON.stringify({ base: BASE, rows }, null, 2)
  );
  const empty = rows.filter((r) => r.classification === "EMPTY").length;
  const sparse = rows.filter((r) => r.classification === "SPARSE").length;
  console.log(JSON.stringify({ empty, sparse, total: rows.length }, null, 2));
}

main();
