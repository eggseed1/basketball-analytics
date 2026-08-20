/**
 * Find real NBA headshot URLs for retired players (Redd / Richardson).
 */
import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0 (compatible; basketball-analytics/p18b4)";

async function get(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.nba.com/" } });
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    ct: r.headers.get("content-type"),
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex").slice(0, 16),
    url,
  };
}

async function main() {
  const ids = ["2202", "2072", "959", "1717", "2544", "201939"];
  const patterns = (id: string) => [
    `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`,
    `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`,
    `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.jpg`,
    `https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/${id}.png`,
    `https://cdn.nba.com/headshots/nba/latest/${id}.png`,
  ];

  const out: unknown[] = [];
  for (const id of ids) {
    for (const url of patterns(id)) {
      const r = await get(url);
      out.push({ id, ...r });
      console.log(JSON.stringify({ id, bytes: r.bytes, status: r.status, sha: r.sha256, url: url.slice(30) }));
    }
  }

  // ESPN alternate IDs via common search - Richardson might have different ESPN id
  // Try fetching NBA player page HTML for headshot URL? 
  for (const slug of [
    ["jason-richardson", "2202"],
    ["michael-redd", "2072"],
    ["steve-nash", "959"],
  ] as const) {
    const page = `https://www.nba.com/player/${slug[1]}/${slug[0]}`;
    const r = await fetch(page, { headers: { "User-Agent": UA } });
    const html = await r.text();
    const matches = [...html.matchAll(/https?:\/\/[^"'\\s]+headshots[^"'\\s]+/gi)].map((m) => m[0]);
    const uniq = [...new Set(matches)].slice(0, 8);
    console.log(JSON.stringify({ page, status: r.status, headshotUrls: uniq }));
    out.push({ page, status: r.status, headshotUrls: uniq });
  }

  mkdirSync("reports/p18b4", { recursive: true });
  writeFileSync(join("reports/p18b4", "_headshot_urls.json"), JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
