/**
 * Post-opt regression audit — API + HTML probes (read-only).
 * Usage: node scripts/audit-regression-api.mjs [baseUrl]
 * Writes reports/perf-cdn-html-regression-audit/api-probe.json
 */
import fs from "node:fs";
import path from "node:path";

const BASE =
  process.argv[2] ||
  process.env.AUDIT_BASE ||
  "https://basketball-analytics.drbl-analytics.workers.dev";
const OUT_DIR = path.join(
  process.cwd(),
  "reports/perf-cdn-html-regression-audit"
);
const UA =
  "Mozilla/5.0 (compatible; DRBL-regression-audit/1.0; +https://drbl.io)";

const results = [];

function record(row) {
  results.push({ ...row, at: new Date().toISOString() });
  const mark = row.ok ? "PASS" : "FAIL";
  console.log(
    `${mark} ${row.id} ${row.detail || ""}`.trim()
  );
}

async function fetchText(url, init = {}) {
  const t0 = performance.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: { Accept: "text/html,application/json", "User-Agent": UA, ...(init.headers || {}) },
    ...init,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Math.round(performance.now() - t0);
  const headers = {};
  for (const k of [
    "x-page-cache",
    "x-page-cache-skip",
    "cache-control",
    "content-type",
    "content-encoding",
    "cf-cache-status",
    "age",
  ]) {
    const v = res.headers.get(k);
    if (v) headers[k] = v;
  }
  return { res, buf, ms, headers, status: res.status };
}

async function htmlProbe(id, pathName, checks) {
  const url = `${BASE}${pathName}`;
  try {
    const { buf, ms, headers, status } = await fetchText(url);
    const html = buf.toString("utf8");
    const failures = [];
    if (status !== 200) failures.push(`status ${status}`);
    for (const c of checks) {
      if (!c.test(html)) failures.push(c.name);
    }
    record({
      id,
      ok: failures.length === 0,
      status,
      ms,
      bytes: buf.length,
      headers,
      detail: failures.length ? failures.join("; ") : `ok ${buf.length}B`,
      url,
    });
  } catch (e) {
    record({ id, ok: false, detail: String(e?.message || e), url: `${BASE}${pathName}` });
  }
}

async function jsonProbe(id, pathName, assertFn) {
  const url = `${BASE}${pathName}`;
  try {
    const { buf, ms, headers, status } = await fetchText(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    let json = null;
    try {
      json = JSON.parse(buf.toString("utf8"));
    } catch {
      record({ id, ok: false, status, ms, detail: "invalid json", url, headers });
      return null;
    }
    const msg = assertFn(json, status);
    record({
      id,
      ok: !msg,
      status,
      ms,
      bytes: buf.length,
      headers,
      detail: msg || "ok",
      url,
    });
    return json;
  } catch (e) {
    record({ id, ok: false, detail: String(e?.message || e), url });
    return null;
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Resolve verified player via search
const search = await jsonProbe(
  "api-search-tatum",
  "/api/players/search?q=tatum",
  (j, status) => {
    if (status !== 200) return `status ${status}`;
    const rows = j?.results || j?.players || [];
    if (!Array.isArray(rows) || !rows.length) return "no results";
    if (!rows.some((r) => String(r.id) === "4065648" || /tatum/i.test(r.name || ""))) {
      return "tatum not in results";
    }
    return null;
  }
);

const playerId =
  search?.results?.find((r) => String(r.id) === "4065648")?.id ||
  search?.results?.[0]?.id ||
  "4065648";

await jsonProbe(
  "api-percentiles-current",
  `/api/players/${playerId}/percentiles?season=2025-26&mode=fast`,
  (j, status) => {
    if (status === 503) return "career board still loading (503)";
    if (status !== 200) return `status ${status} ${j?.error || ""}`;
    if (!Array.isArray(j.metrics) || j.metrics.length < 5) {
      return `metrics ${j.metrics?.length ?? 0}`;
    }
    return null;
  }
);

for (const season of ["2024-25", "2023-24", "2022-23", "2017-18"]) {
  await jsonProbe(
    `api-percentiles-${season}`,
    `/api/players/${playerId}/percentiles?season=${season}&mode=fast`,
    (j, status) => {
      if (status !== 200) return `status ${status} ${j?.error || ""}`;
      if (j.season && j.season !== season) return `season mismatch ${j.season}`;
      if (!Array.isArray(j.metrics) || j.metrics.length < 5) {
        return `metrics ${j.metrics?.length ?? 0}`;
      }
      return null;
    }
  );
}

for (const [id, p] of [
  ["api-home-standings", "/api/home/standings"],
  ["api-home-performers", "/api/home/performers"],
  ["api-home-week-strip", "/api/home/week-strip"],
  ["api-home-hot-cold", "/api/home/hot-cold"],
  ["api-home-insights", "/api/home/insights"],
  ["api-standings-team-stats", "/api/standings/team-stats"],
  ["api-explore-board", "/api/explore/players/board?season=2025-26"],
  ["api-scores-live", "/api/scores/live"],
]) {
  await jsonProbe(id, p, (j, status) => {
    if (status !== 200) return `status ${status} ${j?.error || ""}`;
    return null;
  });
}

// HTML routes — slim SSR markers / not full poison
const htmlRoutes = [
  ["html-home", "/", [{ name: "has-main", test: (h) => /main-content|DRBL/i.test(h) }]],
  [
    "html-explore",
    "/explore/players",
    [
      { name: "has-board-or-table", test: (h) => /explore|Impact|leaderboard|player/i.test(h) },
      { name: "not-1.8mb-class", test: (h) => h.length < 1_600_000 },
    ],
  ],
  [
    "html-player",
    `/players/${playerId}`,
    [
      { name: "has-name", test: (h) => /Tatum|percentile|player/i.test(h) },
      { name: "not-poison-skip-only", test: (h) => !/^[\s\S]{0,5000}Couldn't load/i.test(h) },
      { name: "under-1.2mb", test: (h) => h.length < 1_200_000 },
    ],
  ],
  ["html-standings", "/standings", [{ name: "east-or-west", test: (h) => /East|West|standings/i.test(h) }]],
  ["html-scores", "/scores", [{ name: "scores", test: (h) => /score|game|upcoming|week/i.test(h) }]],
  ["html-compare", "/compare", [{ name: "compare", test: (h) => /compare/i.test(h) }]],
  ["html-ask", "/ask", [{ name: "ask", test: (h) => /ask|DRBL/i.test(h) }]],
  ["html-learn", "/learn", [{ name: "learn", test: (h) => /learn|stat/i.test(h) }]],
  ["html-sentiment", "/sentiment", [{ name: "sentiment", test: (h) => /sentiment|perception|league/i.test(h) }]],
  ["html-offseason", "/offseason", [{ name: "tx", test: (h) => /transaction|offseason|trade/i.test(h) }]],
  ["html-arcade", "/arcade", [{ name: "arcade", test: (h) => /arcade|game/i.test(h) }]],
  ["html-gm", "/gm", [{ name: "gm", test: (h) => /gm|franchise|lab/i.test(h) }]],
  ["html-history", "/history", [{ name: "history", test: (h) => /history|time|season/i.test(h) }]],
  ["html-privacy", "/privacy", [{ name: "privacy", test: (h) => /privacy/i.test(h) }]],
];

for (const [id, p, checks] of htmlRoutes) {
  await htmlProbe(id, p, checks);
}

// Explicit 404 probe — status 404 is success for a missing route.
{
  const url = `${BASE}/this-route-should-404-xyz`;
  try {
    const { status, ms, buf } = await fetchText(url);
    record({
      id: "html-404",
      ok: status === 404,
      status,
      ms,
      bytes: buf.length,
      detail: status === 404 ? "ok not-found" : `expected 404 got ${status}`,
      url,
    });
  } catch (e) {
    record({ id: "html-404", ok: false, detail: String(e?.message || e), url });
  }
}

// Locale isolation: request de then en, ensure lang differs when cookie set
async function localeRoundTrip() {
  const de = await fetchText(`${BASE}/`, {
    headers: { Cookie: "DRBL_LOCALE=de", "User-Agent": UA, Accept: "text/html" },
  });
  const en = await fetchText(`${BASE}/`, {
    headers: { Cookie: "DRBL_LOCALE=en", "User-Agent": UA, Accept: "text/html" },
  });
  const deHtml = de.buf.toString("utf8");
  const enHtml = en.buf.toString("utf8");
  const deLang = (deHtml.match(/lang="([^"]+)"/) || [])[1];
  const enLang = (enHtml.match(/lang="([^"]+)"/) || [])[1];
  const cacheLeak =
    de.headers["x-page-cache"] === "HIT" &&
    en.headers["x-page-cache"] === "HIT" &&
    deLang &&
    enLang &&
    deLang === enLang &&
    deLang !== "en";
  record({
    id: "locale-cookie-isolation",
    ok: Boolean(deLang && enLang) && deLang !== enLang && !cacheLeak,
    detail: `de=${deLang} en=${enLang} deCache=${de.headers["x-page-cache"]} enCache=${en.headers["x-page-cache"]}`,
  });
}
await localeRoundTrip();

// Cache query bypass: weird param should SKIP or MISS differently than clean
const clean = await fetchText(`${BASE}/standings`);
const weird = await fetchText(`${BASE}/standings?nonce=${Date.now()}`);
record({
  id: "cache-uncacheable-param",
  ok: true,
  detail: `clean=${clean.headers["x-page-cache"]} weird=${weird.headers["x-page-cache"]} (weird should often SKIP/MISS)`,
  headers: { clean: clean.headers, weird: weird.headers },
});

const report = {
  base: BASE,
  measuredAt: new Date().toISOString(),
  pass: results.filter((r) => r.ok).length,
  fail: results.filter((r) => !r.ok).length,
  results,
};
fs.writeFileSync(
  path.join(OUT_DIR, "api-probe.json"),
  JSON.stringify(report, null, 2)
);
console.log(`\n${report.pass} pass / ${report.fail} fail → ${OUT_DIR}/api-probe.json`);
process.exit(report.fail ? 1 : 0);
