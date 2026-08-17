import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "../src/data/providers/nba/stats-nba-client";

async function main() {
  for (const gid of ["0029600012", "0022300061"]) {
    const res = await statsNbaFetch(
      "boxscoretraditionalv2",
      {
        GameID: gid,
        StartPeriod: 0,
        EndPeriod: 14,
        StartRange: 0,
        EndRange: 0,
        RangeType: 0,
      },
      { ttlMs: 0, staleMs: 0 }
    );
    const starters = resultSetToObjects(
      getResultSet(res, "TeamStarterBenchStats")!
    );
    console.log(
      gid,
      starters.map((r) => ({
        team: r.TEAM_ABBREVIATION,
        type: r.STARTERS_BENCH,
        pts: r.PTS,
      }))
    );
    const players = resultSetToObjects(getResultSet(res, "PlayerStats")!);
    const emptyPos = players.filter((p) => !p.START_POSITION).length;
    const withPos = players.filter((p) => !!p.START_POSITION).length;
    console.log(gid, { emptyPos, withPos, n: players.length });
  }
}

main();
