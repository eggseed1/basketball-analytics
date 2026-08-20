import {
  statsNbaFetch,
  getResultSet,
  resultSetToObjects,
} from "../src/data/providers/nba/stats-nba-client";
import { createHash } from "crypto";

async function headInfo(url: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://www.nba.com/",
    },
  });
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    bytes: buf.length,
    sha: createHash("sha256").update(buf).digest("hex").slice(0, 16),
  };
}

async function main() {
  for (const id of ["2202", "2072", "959", "1717"]) {
    const info = await statsNbaFetch(
      "commonplayerinfo",
      { PlayerID: id },
      { ttlMs: 0, retries: 1 }
    );
    const rows = resultSetToObjects(getResultSet(info)!);
    console.log(JSON.stringify({ id, info: rows[0] }, null, 2));
    await new Promise((r) => setTimeout(r, 500));
  }

  // ESPN NBA athlete endpoints by known historical ids
  // Try site API players for 2005 season leaders
  const espnSeason = 2006; // ESPN end year for 2005-06
  const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${espnSeason}/athletes?limit=50&active=true`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  console.log("espn athletes", r.status);
  const j = await r.json();
  console.log(JSON.stringify({ count: j.count, sample: j.items?.slice(0, 3) }).slice(0, 500));

  // Direct ESPN athlete pages by guessing common IDs near era
  // Richardson was often 2399 or similar on ESPN historically - probe a few known
  const guesses: Array<[string, string]> = [
    ["Jason Richardson", "2399"],
    ["Jason Richardson", "1007"],
    ["Jason Richardson", "996"],
    ["Michael Redd", "1017"],
    ["Michael Redd", "997"],
    ["Michael Redd", "847"],
    ["Steve Nash", "170"],
    ["Steve Nash", "616"],
    ["Steve Nash", "959"],
  ];
  for (const [name, eid] of guesses) {
    const img = `https://a.espncdn.com/i/headshots/nba/players/full/${eid}.png`;
    const h = await headInfo(img);
    const meta = await fetch(
      `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${eid}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    let display = "";
    if (meta.ok) {
      const mj = await meta.json();
      display = mj?.athlete?.displayName ?? mj?.displayName ?? "";
    }
    console.log(JSON.stringify({ name, eid, display, img: h, metaStatus: meta.status }));
  }
}

const UA = "Mozilla/5.0";
main();
