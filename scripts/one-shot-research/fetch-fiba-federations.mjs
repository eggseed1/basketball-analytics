/**
 * ONE SHOT research authoring: FIBA national federation directory.
 *
 * Reads https://about.fiba.basketball/en/national-federations and each member
 * page, and writes federation name, FIBA code, FIBA region and official website
 * to scripts/one-shot-research/fiba-federations.json. Run by hand when refreshing the
 * research snapshot; gameplay never calls the network.
 *
 *   node scripts/one-shot-research/fetch-fiba-federations.mjs
 */
import fs from "node:fs";

const BASE = "https://about.fiba.basketball";
const OUT = "scripts/one-shot-research/fiba-federations.json";
const UA = { "user-agent": "Mozilla/5.0 (drbl.io one-shot research)" };

const decode = (s) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .trim();

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.text();
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

const list = await get(`${BASE}/en/national-federations`);
const members = [];
const seen = new Set();
for (const m of list.matchAll(
  /href="\/en\/national-federations\/(\d+)-([a-z0-9-]+)".*?japnsh1f">([^<]+)<\/p>.*?japnsh13">([A-Z]{3})<\/div>/gs
)) {
  if (seen.has(m[1])) continue;
  seen.add(m[1]);
  members.push({ fibaFederationId: Number(m[1]), slug: m[2], fibaName: decode(m[3]), fibaCode: m[4] });
}
console.log(`${members.length} members in directory`);

const out = [];
let next = 0;
async function worker() {
  while (next < members.length) {
    const member = members[next++];
    const url = `${BASE}/en/national-federations/${member.fibaFederationId}-${member.slug}`;
    try {
      const html = await get(url);
      const name = /japnsh7">\(<!-- -->[A-Z]{3}<!-- -->\)<\/div><\/div><div class="[^"]*japnsh4">([^<]+)</.exec(html)?.[1];
      const region = /href="\/en\/regions\/([a-z-]+)"/.exec(html)?.[1] ?? null;
      const website = /href="(https?:\/\/[^"]+)"><span[^>]*>(?:(?!<\/a>).)*?Official Website/s.exec(html)?.[1] ?? null;
      out.push({
        ...member,
        federationName: name ? decode(name) : null,
        fibaRegion: region,
        officialWebsite: website,
        sourceUrl: url,
      });
    } catch (err) {
      out.push({ ...member, federationName: null, fibaRegion: null, officialWebsite: null, sourceUrl: url, error: String(err) });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
out.sort((a, b) => a.fibaCode.localeCompare(b.fibaCode));
fs.mkdirSync("scripts/one-shot-research", { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ source: `${BASE}/en/national-federations`, checkedAt: new Date().toISOString().slice(0, 10), members: out }, null, 1) + "\n"
);
console.log(`wrote ${out.length} federations, ${out.filter((m) => !m.federationName).length} without a parsed name`);
