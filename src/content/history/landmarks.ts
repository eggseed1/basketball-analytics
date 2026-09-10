/**
 * Curated Time Machine landmarks — discovery entry points from existing caches.
 * Not a live scrape; seasons chosen for product coverage + narrative weight.
 */

export type HistoryLandmark = {
  id: string;
  season: string;
  title: string;
  blurb: string;
  /** Primary Time Machine entry. */
  historyHref: string;
  /** Optional season board / explore deep link. */
  boardHref?: string;
  boardLabel?: string;
};

export const HISTORY_LANDMARKS: HistoryLandmark[] = [
  {
    id: "jordan-bulls-96",
    season: "1995-96",
    title: "72-win Bulls",
    blurb: "Jordan’s peak Chicago machine — landmark regular-season dominance.",
    historyHref: "/history?season=1995-96&theme=historical",
    boardHref: "/explore/players?season=1995-96&sort=ppg&dir=desc",
    boardLabel: "1995-96 scoring board",
  },
  {
    id: "lakers-threepeat-02",
    season: "2001-02",
    title: "Lakers three-peat era",
    blurb: "Shaq–Kobe dynasty window — browse season identity and boards.",
    historyHref: "/history?season=2001-02&theme=historical",
    boardHref: "/explore/players?season=2001-02&sort=ppg&dir=desc",
    boardLabel: "2001-02 scoring board",
  },
  {
    id: "spurs-fundamentals-03",
    season: "2002-03",
    title: "Duncan Spurs",
    blurb: "Fundamental championship basketball at the start of the modern Spurs run.",
    historyHref: "/history?season=2002-03&theme=historical",
  },
  {
    id: "heatles-13",
    season: "2012-13",
    title: "Heatles peak",
    blurb: "LeBron–Wade–Bosh Miami — modern superteam inflection.",
    historyHref: "/history?season=2012-13&theme=historical",
    boardHref: "/explore/players?season=2012-13&sort=darkoDpm&dir=desc",
    boardLabel: "2012-13 DARKO board",
  },
  {
    id: "warriors-73-16",
    season: "2015-16",
    title: "73-win Warriors",
    blurb: "Record regular season before the Finals rematch — efficiency + gravity era.",
    historyHref: "/history?season=2015-16&theme=historical",
    boardHref: "/explore/players?season=2015-16&sort=trueShootingPct&dir=desc",
    boardLabel: "2015-16 TS% board",
  },
  {
    id: "raptor-finale-22",
    season: "2021-22",
    title: "Last RAPTOR season",
    blurb: "FiveThirtyEight RAPTOR ends here — use this season for RAPTOR leaderboards.",
    historyHref: "/history?season=2021-22&theme=historical",
    boardHref: "/explore/players?season=2021-22&sort=raptor&dir=desc",
    boardLabel: "2021-22 RAPTOR board",
  },
];
