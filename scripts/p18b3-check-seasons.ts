import { listCanonicalSeasons } from "../src/data/providers/historical/season-range";
import { getAvailableSeasons } from "../src/data/queries/players";

async function main() {
  const listed = listCanonicalSeasons();
  const seasons = await getAvailableSeasons();
  console.log(
    JSON.stringify({
      listFirst: listed[0],
      listLast: listed[listed.length - 1],
      availFirst: seasons[0],
      availLast: seasons[seasons.length - 1],
      has1946: seasons.includes("1946-47"),
      has1950: seasons.includes("1950-51"),
      count: seasons.length,
    })
  );
}

main();
