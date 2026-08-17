/** Conference standings row (live NBA). */
export type StandingRow = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  conference: "East" | "West";
  rank: number;
  wins: number;
  losses: number;
  winPct: number;
  gamesBehind: number;
  /** Average point differential. */
  differential: number;
  ppg: number;
  oppPpg: number;
  streak: string;
  homeRecord: string;
  roadRecord: string;
  lastTen: string;
  playoffSeed: number | null;
};

export type ConferenceStandings = {
  conference: "East" | "West";
  rows: StandingRow[];
};

export type LeagueStandings = {
  season: string;
  conferences: ConferenceStandings[];
};
