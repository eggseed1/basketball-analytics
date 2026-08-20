/**
 * Print canonical team ↔ ESPN ↔ BDL identity table + alias coverage
 * + historical game identity health (cache sample when present).
 * Run: npm run report:team-identity
 */
import {
  listCanonicalTeams,
  listCrossProviderNumericCollisions,
  providerTeamKey,
  resolveCanonicalTeam,
} from "../src/data/identity/team-map";
import { TEAM_BRANDS } from "../src/lib/nba-brand";
import { listCachedSeasons, readGamesCache } from "../src/data/providers/historical/games-cache";
import type { Game } from "../src/data/types";

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

type GameIdentityBucket = {
  canonicalized: number;
  unresolved: number;
  withAbbr: number;
  withProviderId: number;
  ambiguous: number;
};

function classifyHistoricalGames(
  games: Game[],
  expectedProvider: "espn" | "bdl"
): GameIdentityBucket {
  const out: GameIdentityBucket = {
    canonicalized: 0,
    unresolved: 0,
    withAbbr: 0,
    withProviderId: 0,
    ambiguous: 0,
  };
  for (const g of games) {
    const sides: Array<"home" | "away"> = ["home", "away"];
    for (const side of sides) {
      const canonicalId = side === "home" ? g.homeTeamId : g.awayTeamId;
      const providerId =
        side === "home" ? g.homeProviderTeamId : g.awayProviderTeamId;
      const abbr = side === "home" ? g.homeTeamAbbr : g.awayTeamAbbr;
      if (abbr?.trim()) out.withAbbr += 1;
      if (providerId?.trim()) out.withProviderId += 1;

      const byCanon = resolveCanonicalTeam(canonicalId);
      const provider = g.teamIdProvider ?? expectedProvider;
      const byProvider = providerId
        ? resolveCanonicalTeam(`${provider}:${providerId}`)
        : null;

      if (byCanon.status === "resolved") {
        out.canonicalized += 1;
        if (
          byProvider?.status === "resolved" &&
          byProvider.team.canonicalTeamId !== byCanon.team.canonicalTeamId
        ) {
          out.ambiguous += 1;
        }
      } else {
        out.unresolved += 1;
      }
    }
  }
  // Counts are per side; report as team-side observations.
  return out;
}

async function reportHistoricalCaches() {
  console.log("\nHistorical game identity (disk cache sample):\n");
  const seasons = await listCachedSeasons();
  if (!seasons.length) {
    console.log("  (no data/cache/games/*.json - skip live historical counts)");
    return;
  }
  for (const row of seasons.slice(0, 5)) {
    const cached = await readGamesCache(row.season);
    if (!cached) continue;
    const provider =
      cached.source === "balldontlie" ? ("bdl" as const) : ("espn" as const);
    const stats = classifyHistoricalGames(cached.games, provider);
    const sides = cached.games.length * 2;
    console.log(`### ${cached.source} · ${row.season} (${cached.games.length} games, ${sides} sides)`);
    console.log(`  canonicalized: ${stats.canonicalized}`);
    console.log(`  unresolved:    ${stats.unresolved}`);
    console.log(`  with abbr:     ${stats.withAbbr}`);
    console.log(`  with provider: ${stats.withProviderId}`);
    console.log(`  ambiguous:     ${stats.ambiguous}`);
  }
}

async function main() {
  const teams = listCanonicalTeams();
  console.log("DRBL canonical team identity (canonical = ESPN team id)\n");
  console.log(
    `${pad("Canonical", 22)} ${pad("ESPN", 6)} ${pad("BDL", 6)} ${pad("Abbr", 5)} Valid`
  );
  console.log("-".repeat(50));
  for (const t of teams) {
    const espn = t.providerIds.espn ?? "-";
    const bdl = t.providerIds.bdl ?? "-";
    const valid = t.providerIds.espn && t.providerIds.bdl ? "✓" : "✗";
    console.log(
      `${pad(t.displayName, 22)} ${pad(espn, 6)} ${pad(bdl, 6)} ${pad(t.abbr, 5)} ${valid}`
    );
  }

  console.log("\nNumeric ID collisions (same number, different franchises):\n");
  const collisions = listCrossProviderNumericCollisions();
  if (!collisions.length) {
    console.log("(none)");
  } else {
    for (const c of collisions) {
      console.log(
        `  ${c.providerTeamId}: ${providerTeamKey("espn", c.providerTeamId)} = ${c.espn?.abbr} (${c.espn?.displayName})` +
          `  ≠  ${providerTeamKey("bdl", c.providerTeamId)} = ${c.bdl?.abbr} (${c.bdl?.displayName})`
      );
    }
  }

  console.log("\nAlias resolution smoke (abbr / brand / namespaced):\n");
  const samples = [
    "BOS",
    "bos",
    "2",
    "espn:2",
    "bdl:25",
    "25",
    "okc",
    "Oklahoma City",
    "not-a-team",
  ];
  for (const s of samples) {
    const r = resolveCanonicalTeam(s);
    if (r.status === "resolved") {
      console.log(
        `  ${pad(JSON.stringify(s), 20)} → ${r.team.abbr} (canonical ${r.team.canonicalTeamId})`
      );
    } else {
      console.log(`  ${pad(JSON.stringify(s), 20)} → UNRESOLVED (${r.reason})`);
    }
  }

  const missingBrand: string[] = [];
  for (const brand of Object.values(TEAM_BRANDS)) {
    const r = resolveCanonicalTeam(brand.espnTeamId);
    if (r.status !== "resolved") missingBrand.push(brand.abbr);
  }
  console.log(
    `\n${teams.length} teams · ${collisions.length} collisions · brand gaps: ${missingBrand.length ? missingBrand.join(",") : "none"}`
  );

  await reportHistoricalCaches();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
