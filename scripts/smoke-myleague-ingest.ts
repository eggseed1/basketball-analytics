/**
 * Smoke salaries + year-accurate CBA.
 *
 *   npx tsx scripts/smoke-myleague-ingest.ts 2024-25
 */
import {
  createSiteRealNBADataProvider,
  canonicalToSeasonEnd,
  getCbaRules,
  ingestHistoricalSeasonSnapshot,
  listSalaryCapHistory,
} from "../src/gm/myleague";
import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";
import { salaryIndexSize } from "../src/data/providers/salaries/salary-store";

async function main() {
  const canonical = process.argv[2] ?? "2024-25";
  const seasonEnd = canonicalToSeasonEnd(canonical);
  const provider = createSiteRealNBADataProvider();
  const snap = await ingestHistoricalSeasonSnapshot(provider, seasonEnd);
  const cba = getCbaRules(seasonEnd);
  const league = await createRealSeasonLeague({
    userTeamId: "bos",
    season: canonical,
  });

  const bos = league.league.players
    .filter((p) => p.teamId === "bos")
    .sort(
      (a, b) =>
        (b.contract?.annualSalaryM ?? 0) - (a.contract?.annualSalaryM ?? 0)
    );

  console.log(
    JSON.stringify(
      {
        canonical,
        salaryIndexSize: salaryIndexSize(),
        cap: cba.salaryCapM,
        tax: cba.luxuryTaxM,
        apron1: cba.firstApronM,
        leagueCap: league.league.settings.salaryCapM,
        bosPayroll: Math.round(
          bos.reduce((s, p) => s + (p.contract?.annualSalaryM ?? 0), 0) * 10
        ) / 10,
        bosTop: bos.slice(0, 8).map((p) => ({
          name: p.name,
          salaryM: p.contract?.annualSalaryM,
        })),
        historySample: listSalaryCapHistory(2023, 2026),
        contractsInSnapshot: snap.contracts.length,
        news: league.league.news[0]?.body,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
