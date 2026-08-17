import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "../src/data/providers/nba/stats-nba-client";

async function main() {
  const res = await statsNbaFetch(
    "boxscoretraditionalv2",
    {
      GameID: "0029600012",
      StartPeriod: 0,
      EndPeriod: 14,
      StartRange: 0,
      EndRange: 0,
      RangeType: 0,
    },
    { ttlMs: 0, staleMs: 0 }
  );
  const players = resultSetToObjects(getResultSet(res, "PlayerStats")!);
  console.log(
    players
      .filter((p) => p.START_POSITION)
      .map((p) => ({
        id: p.PLAYER_ID,
        name: p.PLAYER_NAME,
        pos: p.START_POSITION,
        min: p.MIN,
        pts: p.PTS,
      }))
  );
  const teams = resultSetToObjects(getResultSet(res, "TeamStats")!);
  console.log("teams", teams.map((t) => ({ id: t.TEAM_ID, pts: t.PTS, abbr: t.TEAM_ABBREVIATION })));
}

main();
