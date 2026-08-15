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
  console.log(`Configured DATA_PROVIDER: ${process.env.DATA_PROVIDER ?? "(unset → local)"}`);
  console.log(`Resolved provider: ${provider.name} — ${meta.description}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
