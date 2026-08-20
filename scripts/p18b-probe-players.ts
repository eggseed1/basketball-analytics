import { LocalDataProvider } from "../src/data/providers/local-data-provider";
import { getFilteredPlayerSeasonsDetailed } from "../src/data/queries/players";

async function main() {
  const local = new LocalDataProvider();
  const localRows = await local.getPlayerSeasons("2014-15");
  console.log("local", localRows.length, [...new Set(localRows.map(r => r.season))]);
  const board = await getFilteredPlayerSeasonsDetailed({ season: "2014-15" });
  console.log("board", board.rows.length, board.error && String(board.error));
}
main();
