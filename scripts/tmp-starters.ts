import { getResultSet, resultSetToObjects, statsNbaFetch } from "./src/data/providers/nba/stats-nba-client";
async function main() {
  const res = await statsNbaFetch("boxscoretraditionalv2", { GameID:"0029600012", StartPeriod:0, EndPeriod:14, StartRange:0, EndRange:0, RangeType:0 }, { ttlMs:0, staleMs:0 });
  const players = resultSetToObjects(getResultSet(res, "PlayerStats")!);
  for (const team of [1610612747, 1610612756]) {
    const rows = players.filter(p => Number(p.TEAM_ID)===team && p.START_POSITION);
    console.log(team, rows.map(p => ({id:p.PLAYER_ID, name:p.PLAYER_NAME, pos:p.START_POSITION, min:p.MIN})));
  }
}
main();
