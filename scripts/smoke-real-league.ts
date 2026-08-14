import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";

async function main() {
  const season = process.argv[2] ?? "2024-25";
  const r = await createRealSeasonLeague({ userTeamId: "bos", season });
  const bos = r.league.players.filter((p) => p.teamId === "bos");
  console.log(
    JSON.stringify(
      {
        season: r.seasonCanonical,
        totalPlayers: r.league.players.length,
        bosRoster: bos.length,
        sample: bos.slice(0, 8).map((p) => ({
          name: p.name,
          impact: p.ratings.impact,
          darko: p.darko,
          pos: p.position,
        })),
        snapshotPlayers: r.snapshot.players.length,
        snapshotRosters: r.snapshot.rosters.length,
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
