import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const p = JSON.parse(
  readFileSync(
    "data/drbl/player-media/drbl-player-media-v1/portrait-lookup.json",
    "utf8"
  )
);
const a = JSON.parse(
  readFileSync(
    "data/drbl/player-media/drbl-player-media-v1/nba-asset-audit.json",
    "utf8"
  )
);
const aliases = JSON.parse(
  readFileSync("data/impact/player-id-aliases.json", "utf8")
);

const approvedConf = new Set([
  "EXACT_PROVIDER_MAPPING",
  "VERIFIED_MULTI_FIELD",
  "HIGH_CONFIDENCE_MULTI_FIELD",
]);

const byNba = new Map<string, any>();
for (const al of aliases.aliases) {
  if (al.productionApproved === false) continue;
  const ok =
    al.productionApproved === true ||
    approvedConf.has(String(al.confidence ?? ""));
  if (!ok) continue;
  byNba.set(String(al.nbaPlayerId), al);
}

const promoted = new Set(Object.keys(p.portraits));
const missing = a.rows.filter(
  (r: any) => !promoted.has(r.canonicalPlayerId)
);

const hits: any[] = [];
for (const r of missing) {
  const al = byNba.get(String(r.canonicalPlayerId));
  if (al) {
    hits.push({
      nba: r.canonicalPlayerId,
      espn: al.espnPlayerId,
      name: r.displayName || al.playerName,
      first: r.firstSeason,
      last: r.lastSeason,
    });
  }
}

console.log(
  JSON.stringify(
    {
      missing: missing.length,
      withEspnAlias: hits.length,
      sample: hits.slice(0, 20),
      targets: ["2202", "2072", "959", "1717"].map((id) => ({
        id,
        alias: byNba.get(id) ?? null,
        promoted: promoted.has(id),
      })),
    },
    null,
    2
  )
);

mkdirSync("reports/p18b5", { recursive: true });
writeFileSync(
  join("reports/p18b5", "_espn_alias_hits.json"),
  JSON.stringify({ hits, count: hits.length }, null, 2)
);
