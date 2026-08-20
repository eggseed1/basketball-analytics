import { performance } from "node:perf_hooks";
import {
  clearHistoryCareerCaches,
  getHistoryPlayerGames,
} from "../src/data/history/player-career";

clearHistoryCareerCaches();
const t0 = performance.now();
getHistoryPlayerGames("1717", "2005-06", { limit: 100 });
const t1 = performance.now();
getHistoryPlayerGames("1717", "2005-06", { limit: 100 });
const t2 = performance.now();
getHistoryPlayerGames("2202", "2005-06", { limit: 100 });
const t3 = performance.now();
console.log(
  JSON.stringify({
    firstMs: +(t1 - t0).toFixed(1),
    warmSamePlayerMs: +(t2 - t1).toFixed(1),
    otherPlayerSameSeasonMs: +(t3 - t2).toFixed(1),
  })
);
