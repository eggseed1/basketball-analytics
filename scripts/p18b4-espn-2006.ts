/**
 * Build ESPN athlete id map for 2005-06 via ESPN core API (ID-keyed season roster).
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0";

async function main() {
  const season = 2006;
  const pageSize = 100;
  let page = 1;
  const refs: string[] = [];
  while (true) {
    const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/athletes?limit=${pageSize}&page=${page}`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    const j = (await r.json()) as {
      items?: Array<{ $ref?: string }>;
      pageCount?: number;
      count?: number;
    };
    for (const it of j.items ?? []) {
      if (it.$ref) refs.push(it.$ref);
    }
    console.log(JSON.stringify({ page, got: j.items?.length, count: j.count, pageCount: j.pageCount }));
    if (!j.pageCount || page >= j.pageCount) break;
    page++;
    await new Promise((r) => setTimeout(r, 200));
  }

  const want = new Set([
    "jason richardson",
    "michael redd",
    "steve nash",
    "dirk nowitzki",
    "ray allen",
    "vince carter",
  ]);
  const found: Record<string, unknown>[] = [];
  // Fetch athlete details in batches — only scan until we find targets (and sample)
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!.replace("http://", "https://");
    const r = await fetch(ref, { headers: { "User-Agent": UA } });
    if (!r.ok) continue;
    const a = (await r.json()) as {
      id?: string | number;
      displayName?: string;
      fullName?: string;
      headshot?: { href?: string };
    };
    const name = (a.displayName ?? a.fullName ?? "").toLowerCase();
    if (want.has(name) || i < 5) {
      found.push({
        espnId: String(a.id),
        displayName: a.displayName,
        headshot: a.headshot?.href,
      });
      console.log(JSON.stringify(found[found.length - 1]));
    }
    if (found.filter((f) => want.has(String(f.displayName).toLowerCase())).length >= want.size) {
      break;
    }
    if (i % 50 === 0) console.log("progress", i, "/", refs.length);
    await new Promise((r) => setTimeout(r, 80));
  }

  mkdirSync("reports/p18b4", { recursive: true });
  writeFileSync(join("reports/p18b4", "_espn_2006_hits.json"), JSON.stringify({ refs: refs.length, found }, null, 2));
}

main();
