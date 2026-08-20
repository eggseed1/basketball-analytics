import {
  getHistoryCareerForPlayer,
  getHistorySeasonsForPlayer,
  getHistoryPlayerGames,
} from "../src/data/history/player-career";
import {
  getMasterPlayer,
  getUniverseSeasonsForPlayer,
} from "../src/data/history/player-universe";
import {
  getCompactPlayerGameLog,
  computePlayerGameHighs,
} from "../src/data/history/player-game-log";

for (const id of ["1966", "2544", "1717", "1642851", "977", "959"]) {
  const c = getHistoryCareerForPlayer(id);
  const s = getHistorySeasonsForPlayer(id);
  const u = getUniverseSeasonsForPlayer(id);
  const m = getMasterPlayer(id);
  const g1213 = getHistoryPlayerGames(id, "2012-13", { limit: 5000 });
  const g0506 = getHistoryPlayerGames(id, "2005-06", { limit: 5000 });
  const compact = getCompactPlayerGameLog({ playerId: id, season: "2005-06" });
  const highs = computePlayerGameHighs(id);
  console.log(
    JSON.stringify({
      id,
      name: c?.playerName ?? m?.displayName ?? null,
      histSeasons: s.length,
      uniSeasons: u.length,
      first: s[0]?.season ?? u[0]?.season,
      last: s.at(-1)?.season ?? u.at(-1)?.season,
      games1213: g1213.length,
      games0506: g0506.length,
      compact0506: compact.total,
      highs: highs.length,
    })
  );
}
