import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import { getMasterPlayerRegistry } from "../src/data/history/player-universe";
import { getHistoricalGameSummaries } from "../src/data/history/product";

const sea = resolveHistoricalTeamBrand("25", "2005-06", "era");
const njn = resolveHistoricalTeamBrand("17", "2005-06", "era");
console.log("franchise_25_2005", sea?.abbreviation);
console.log("franchise_17_2005", njn?.abbreviation);
console.log("canonical", getMasterPlayerRegistry().length);
console.log("games_2005", getHistoricalGameSummaries("2005-06").length);
