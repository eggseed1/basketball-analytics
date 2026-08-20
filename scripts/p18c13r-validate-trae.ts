import {
  clearHistoryCareerCaches,
  getHistorySeasonsForPlayer,
} from "../src/data/history/player-career";
import {
  presentAdditive,
  toPlayerSeasonTotals,
  validateTotalsSanity,
} from "../src/data/history/player-season-totals";

clearHistoryCareerCaches();
const seasons = getHistorySeasonsForPlayer("1629027");
for (const s of seasons) {
  const t = toPlayerSeasonTotals(s);
  console.log(
    s.season,
    "storedMin",
    s.minutes,
    "canonMin",
    t.minutesTotal,
    "pts36",
    presentAdditive(t.pts, "per36", t.gp, t.minutesTotal),
    "fgm36",
    presentAdditive(t.fgm, "per36", t.gp, t.minutesTotal),
    "flags",
    validateTotalsSanity(t).join("|") || "ok",
    "source",
    t.source
  );
}
