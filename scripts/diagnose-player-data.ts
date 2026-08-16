/**
 * Opt-in player / provider health diagnostic.
 * Run: npm run diagnose:player-data
 *      npm run diagnose:player-data -- --season=2024-25
 *      DATA_PROVIDER=local npm run diagnose:player-data
 *
 * Does not mutate data. May call live ESPN when DATA_PROVIDER=nba.
 */
import { resetDataProvider, getDataProvider } from "../src/data/providers";
import { getPlayer } from "../src/data/queries/players";
import { getPlayerSeasonBoardSnapshot } from "../src/data/queries/player-data-health";
import { formatPlayerBoardHealthReport } from "../src/data/diagnostics/player-board-health";
import { describeProvider } from "../src/data/diagnostics/provider-meta";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "../src/data/providers/historical/season-range";

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit?.slice(flag.length + 1);
}

async function main() {
  resetDataProvider();
  const provider = getDataProvider();
  const meta = describeProvider(provider.name);
  const season =
    argValue("--season") ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  const { rows, health } = await getPlayerSeasonBoardSnapshot({ season });

  let lebron = "skipped";
  let jokic = "skipped";
  if (provider.name === "nba" || rows.length > 0) {
    const [l, j] = await Promise.all([
      getPlayer("1966").catch(() => null),
      getPlayer("3112335").catch(() => null),
    ]);
    lebron = l?.fullName ? `found (${l.fullName})` : "not found";
    jokic = j?.fullName ? `found (${j.fullName})` : "not found";
  }

  console.log(
    formatPlayerBoardHealthReport(health, { lebron, jokic })
  );
  console.log(
    `Configured DATA_PROVIDER: ${process.env.DATA_PROVIDER ?? `(unset → ${process.env.VERCEL ? "nba on Vercel" : "local"})`}`
  );
  console.log(`Resolved provider: ${provider.name} — ${meta.description}`);

  // Career-season probe: distinguishes “player page shell OK, seasons empty”
  // (typical when DATA_PROVIDER=local) from live ESPN careers.
  const probes: Array<[string, string]> = [
    ["LeBron", "1966"],
    ["Jokic", "3112335"],
    ["Durant", "3202"],
    ["Cade", "4432166"],
    ["Wemby", "4433626"],
  ];
  const { getPlayerCareerSeasons } = await import(
    "../src/data/queries/players"
  );
  console.log("\nCareer season probe (ESPN athlete ids):");
  for (const [label, id] of probes) {
    const rows = await getPlayerCareerSeasons(id).catch(() => []);
    console.log(
      `  ${label} (${id}): ${rows.length} seasons` +
        (rows[0] ? ` · latest ${rows[0]!.season}` : "")
    );
  }

  const { assessProductionProviderGuard, assertLiveNbaProviderOrThrow } =
    await import("../src/data/diagnostics/production-provider-guard");
  const jokicRows = await getPlayerCareerSeasons("3112335").catch(() => []);
  const guard = assessProductionProviderGuard({
    providerName: provider.name,
    playerId: "3112335",
    careerRowCount: jokicRows.length,
  });
  console.log(
    `\nProduction guard: ${guard.status} · silentEmptyRisk=${guard.isSilentEmptyCareerRisk}`
  );
  if (guard.status !== "ok") {
    console.log(`  ${guard.message}`);
  }
  // Fail loudly in CI/ops when this process is marked as a Vercel-like deploy.
  if (process.env.VERCEL || process.env.DRBL_REQUIRE_LIVE_NBA === "1") {
    assertLiveNbaProviderOrThrow({ providerName: provider.name });
    if (guard.isSilentEmptyCareerRisk) {
      throw new Error(guard.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
