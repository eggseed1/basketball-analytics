import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const UA = "Mozilla/5.0 (compatible; basketball-analytics/p18b5)";

async function getJson(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const t = await r.text();
  try {
    return { status: r.status, j: JSON.parse(t) };
  } catch {
    return { status: r.status, j: null, preview: t.slice(0, 120) };
  }
}

async function img(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    bytes: buf.length,
    sha: createHash("sha256").update(buf).digest("hex"),
  };
}

async function main() {
  for (const [id, expect] of [
    ["1018", "Jason Richardson"],
    ["692", "Michael Redd"],
    ["592", "Steve Nash"],
  ] as const) {
    const urls = [
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}`,
      `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}`,
      `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/${id}?lang=en&region=us`,
    ];
    for (const u of urls) {
      const r = await getJson(u);
      const a = r.j?.athlete ?? r.j;
      console.log(
        JSON.stringify({
          expect,
          id,
          url: u.slice(30),
          status: r.status,
          name: a?.displayName ?? a?.fullName ?? a?.name,
          dob: a?.dateOfBirth ?? a?.birthDate ?? a?.displayDOB,
        })
      );
    }
    const head = await img(
      `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`
    );
    console.log(JSON.stringify({ id, expect, head: { status: head.status, bytes: head.bytes, sha: head.sha.slice(0, 16) } }));
  }

  // athletes index active=false
  const idx = await getJson(
    "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes?active=false&limit=5&page=1"
  );
  console.log(
    JSON.stringify({
      idxStatus: idx.status,
      count: idx.j?.count,
      pageCount: idx.j?.pageCount,
      sampleRefs: (idx.j?.items ?? []).slice(0, 3),
    })
  );

  mkdirSync("reports/p18b5", { recursive: true });
}

main();
