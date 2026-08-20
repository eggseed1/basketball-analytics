/**
 * P18B.4 — probe IDs + CDN assets + 2005-06 team presentation.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { historyUniverseToPlayerSeasons } from "../src/data/history/player-universe";
import { getMasterPlayerRegistry } from "../src/data/history/player-universe";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import { resolveTeamBrand } from "../src/lib/nba-brand";

const UA = "basketball-analytics/p18b4";

async function head(url: string) {
  const r = await fetch(url, {
    method: "HEAD",
    headers: { "User-Agent": UA },
  });
  return {
    status: r.status,
    ct: r.headers.get("content-type"),
    cl: Number(r.headers.get("content-length") ?? 0) || null,
  };
}

async function main() {
  const master = getMasterPlayerRegistry();
  const names = [
    "Jason Richardson",
    "Michael Redd",
    "Steve Nash",
    "Dirk Nowitzki",
    "Ray Allen",
    "Vince Carter",
  ];
  const hits = names.map((name) => {
    const m = master.filter(
      (p) => p.displayName.toLowerCase() === name.toLowerCase()
    );
    return { name, hits: m.map((p) => ({ id: p.playerId, span: `${p.firstSeason}→${p.lastSeason}` })) };
  });
  console.log(JSON.stringify(hits, null, 2));

  const ids = [
    ["2202", "Jason Richardson"],
    ["2072", "Michael Redd"],
    ["959", "Steve Nash"],
    ["1717", "Dirk"],
  ] as const;
  for (const [id, label] of ids) {
    const nba = await head(
      `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`
    );
    const espn = await head(
      `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`
    );
    console.log(JSON.stringify({ label, id, nba, espn }));
  }

  // Probe alternate NBA headshot paths (historical / player context)
  const nashAlts = [
    "https://cdn.nba.com/headshots/nba/latest/260x190/959.png",
    "https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/959.png",
  ];
  for (const u of nashAlts) {
    console.log(JSON.stringify({ url: u, ...(await head(u)) }));
  }

  const season = "2005-06";
  const rows = historyUniverseToPlayerSeasons(season);
  console.log("2005-06 universe", rows.length);
  const samples = ["Ray Allen", "Vince Carter", "Jason Richardson", "Michael Redd"];
  for (const name of samples) {
    const row = rows.find((r) => r.playerName === name);
    if (!row) {
      console.log(JSON.stringify({ name, found: false }));
      continue;
    }
    const modern = resolveTeamBrand(row.teamId);
    const hist = resolveHistoricalTeamBrand(row.teamId, season, "era");
    console.log(
      JSON.stringify({
        name,
        playerId: row.playerId,
        teamId: row.teamId,
        teamName: row.teamName,
        teamAbbr: row.teamAbbreviation,
        modernAbbr: modern?.abbr,
        histAbbr: hist?.abbreviation,
        histName: hist?.displayName,
        histSource: hist?.source,
      })
    );
  }

  mkdirSync("reports/p18b4", { recursive: true });
  writeFileSync(
    join("reports/p18b4", "_probe.json"),
    JSON.stringify({ hits, seasonRows: rows.length }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
