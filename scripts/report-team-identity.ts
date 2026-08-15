/**
 * Print canonical team ↔ ESPN ↔ BDL identity table.
 * Run: npm run report:team-identity
 */
import {
  listCanonicalTeams,
  listCrossProviderNumericCollisions,
  providerTeamKey,
} from "../src/data/identity/team-map";

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function main() {
  const teams = listCanonicalTeams();
  console.log("DRBL canonical team identity (canonical = ESPN team id)\n");
  console.log(
    `${pad("Canonical", 22)} ${pad("ESPN", 6)} ${pad("BDL", 6)} ${pad("Abbr", 5)} Valid`
  );
  console.log("-".repeat(50));
  for (const t of teams) {
    const espn = t.providerIds.espn ?? "—";
    const bdl = t.providerIds.bdl ?? "—";
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
  console.log(`\n${teams.length} teams · ${collisions.length} collisions`);
}

main();
