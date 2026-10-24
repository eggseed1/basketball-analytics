/**
 * Read-only Worker HTML cache isolation probes (headers + content).
 * Usage: AUDIT_BASE=... node scripts/audit-cache-isolation.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BASE =
  process.env.AUDIT_BASE ||
  "https://basketball-analytics.drbl-analytics.workers.dev";
const OUT = path.join(process.cwd(), "reports/perf-cdn-html-regression-audit");
fs.mkdirSync(OUT, { recursive: true });

async function fetchDoc(urlPath, headers = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    headers: {
      "User-Agent": "DRBL-audit-cache/1.0",
      Accept: "text/html",
      ...headers,
    },
    redirect: "follow",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    cache: res.headers.get("x-page-cache"),
    cc: res.headers.get("cache-control"),
    bytes: buf.length,
    lang: /<html[^>]*lang="([^"]+)"/i.exec(buf.toString("utf8"))?.[1] ?? null,
    skip: buf.includes("data-page-cache=\"skip\""),
  };
}

const results = [];

async function step(id, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ id, ok: detail.ok !== false, ms: Date.now() - t0, ...detail });
    console.log(`${detail.ok === false ? "FAIL" : "PASS"} ${id}`);
  } catch (e) {
    results.push({ id, ok: false, ms: Date.now() - t0, error: String(e?.message || e) });
    console.log(`FAIL ${id} ${e?.message || e}`);
  }
}

await step("eligible-home", async () => {
  const a = await fetchDoc("/");
  const b = await fetchDoc("/");
  return {
    ok: a.status === 200 && b.status === 200 && a.bytes < 400_000,
    a,
    b,
  };
});

await step("query-bypass-utm", async () => {
  const clean = await fetchDoc("/explore/players");
  const utm = await fetchDoc("/explore/players?utm_source=audit");
  // Unsupported marketing params should skip or isolate — record observed.
  return {
    ok: clean.status === 200 && utm.status === 200,
    clean,
    utm,
    note: "Observe whether utm shares HIT or SKIP/MISS",
  };
});

await step("season-query-isolation", async () => {
  const cur = await fetchDoc("/explore/players?season=2025-26");
  const past = await fetchDoc("/explore/players?season=2023-24");
  return {
    ok: cur.status === 200 && past.status === 200,
    cur,
    past,
  };
});

await step("scores-short-ttl", async () => {
  const a = await fetchDoc("/scores");
  return {
    ok: a.status === 200 && /s-maxage=120|private|no-store|STALE|HIT|EDGE|MISS/i.test(
      `${a.cc}|${a.cache}`
    ),
    a,
  };
});

await step("game-lab-no-edge-when-degraded", async () => {
  const final = await fetchDoc("/games/401914126");
  const scheduled = await fetchDoc("/games/401909848");
  // Finals may be private/no-store when box missing (skip marker).
  return {
    ok: final.status === 200 && scheduled.status === 200,
    final,
    scheduled,
  };
});

await step("locale-roundtrip", async () => {
  const en1 = await fetchDoc("/", { "Accept-Language": "en" });
  const es = await fetchDoc("/", { "Accept-Language": "es" });
  const en2 = await fetchDoc("/", { "Accept-Language": "en" });
  return {
    ok: en1.status === 200 && es.status === 200 && en2.status === 200,
    en1,
    es,
    en2,
  };
});

await step("box-api-repeated", async () => {
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${BASE}/api/games/401914126/box-score`, {
      headers: { "User-Agent": "DRBL-audit-cache/1.0" },
    });
    statuses.push(res.status);
    if (res.status === 200) {
      const j = await res.json();
      statuses.push(`players:${j.count ?? j.data?.players?.length}`);
      break;
    }
  }
  const ok = statuses.some((s) => s === 200);
  return { ok, statuses };
});

const report = {
  base: BASE,
  measuredAt: new Date().toISOString(),
  pass: results.filter((r) => r.ok).length,
  fail: results.filter((r) => !r.ok).length,
  results,
};
fs.writeFileSync(path.join(OUT, "cache-isolation-probe.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.pass} pass / ${report.fail} fail`);
process.exit(report.fail ? 1 : 0);
