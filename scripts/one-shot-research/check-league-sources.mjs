/**
 * ONE SHOT research authoring: fetch each candidate competition's official
 * URL and record HTTP status, final URL and page title. The output is raw
 * evidence; build-world-data.mjs decides what counts as verified.
 *
 *   node scripts/one-shot-research/check-league-sources.mjs
 */
import fs from "node:fs";

const candidates = JSON.parse(fs.readFileSync("scripts/one-shot-research/league-candidates.json", "utf8"));
const OUT = "scripts/one-shot-research/league-source-checks.json";

const decode = (s) =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

async function check(c) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(c.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) drbl.io one-shot research", accept: "text/html" },
    });
    const html = res.ok ? (await res.text()).slice(0, 400_000) : "";
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
    const ogSite = /property="og:site_name"\s+content="([^"]*)"/i.exec(html)?.[1];
    const ogTitle = /property="og:title"\s+content="([^"]*)"/i.exec(html)?.[1];
    const seasons = [...new Set(html.match(/20\d\d[-/–]\s?(?:20)?\d\d\b/g) ?? [])].slice(0, 6);
    return {
      id: c.id,
      url: c.url,
      finalUrl: res.url,
      status: res.status,
      title: title ? decode(title) : null,
      ogSiteName: ogSite ? decode(ogSite) : null,
      ogTitle: ogTitle ? decode(ogTitle) : null,
      seasonStrings: seasons,
    };
  } catch (err) {
    return { id: c.id, url: c.url, status: 0, error: String(err).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
let next = 0;
async function worker() {
  while (next < candidates.length) results.push(await check(candidates[next++]));
}
await Promise.all(Array.from({ length: 6 }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(OUT, JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), results }, null, 1) + "\n");
for (const r of results) console.log(`${String(r.status).padEnd(4)} ${r.id.padEnd(20)} ${r.title ?? r.ogTitle ?? r.error ?? ""}`.slice(0, 150));
