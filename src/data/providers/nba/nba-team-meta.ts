/**
 * Official NBA Stats team ids (stats.nba.com).
 */
export const NBA_TEAM_META: Record<
  string,
  {
    abbreviation: string;
    fullName: string;
    city: string;
    nickname: string;
    conference: "East" | "West";
    division: string;
  }
> = {
  "1610612737": {
    abbreviation: "ATL",
    fullName: "Atlanta Hawks",
    city: "Atlanta",
    nickname: "Hawks",
    conference: "East",
    division: "Southeast",
  },
  "1610612738": {
    abbreviation: "BOS",
    fullName: "Boston Celtics",
    city: "Boston",
    nickname: "Celtics",
    conference: "East",
    division: "Atlantic",
  },
  "1610612751": {
    abbreviation: "BKN",
    fullName: "Brooklyn Nets",
    city: "Brooklyn",
    nickname: "Nets",
    conference: "East",
    division: "Atlantic",
  },
  "1610612766": {
    abbreviation: "CHA",
    fullName: "Charlotte Hornets",
    city: "Charlotte",
    nickname: "Hornets",
    conference: "East",
    division: "Southeast",
  },
  "1610612741": {
    abbreviation: "CHI",
    fullName: "Chicago Bulls",
    city: "Chicago",
    nickname: "Bulls",
    conference: "East",
    division: "Central",
  },
  "1610612739": {
    abbreviation: "CLE",
    fullName: "Cleveland Cavaliers",
    city: "Cleveland",
    nickname: "Cavaliers",
    conference: "East",
    division: "Central",
  },
  "1610612742": {
    abbreviation: "DAL",
    fullName: "Dallas Mavericks",
    city: "Dallas",
    nickname: "Mavericks",
    conference: "West",
    division: "Southwest",
  },
  "1610612743": {
    abbreviation: "DEN",
    fullName: "Denver Nuggets",
    city: "Denver",
    nickname: "Nuggets",
    conference: "West",
    division: "Northwest",
  },
  "1610612765": {
    abbreviation: "DET",
    fullName: "Detroit Pistons",
    city: "Detroit",
    nickname: "Pistons",
    conference: "East",
    division: "Central",
  },
  "1610612744": {
    abbreviation: "GSW",
    fullName: "Golden State Warriors",
    city: "Golden State",
    nickname: "Warriors",
    conference: "West",
    division: "Pacific",
  },
  "1610612745": {
    abbreviation: "HOU",
    fullName: "Houston Rockets",
    city: "Houston",
    nickname: "Rockets",
    conference: "West",
    division: "Southwest",
  },
  "1610612754": {
    abbreviation: "IND",
    fullName: "Indiana Pacers",
    city: "Indiana",
    nickname: "Pacers",
    conference: "East",
    division: "Central",
  },
  "1610612746": {
    abbreviation: "LAC",
    fullName: "LA Clippers",
    city: "LA Clippers",
    nickname: "Clippers",
    conference: "West",
    division: "Pacific",
  },
  "1610612747": {
    abbreviation: "LAL",
    fullName: "Los Angeles Lakers",
    city: "Los Angeles",
    nickname: "Lakers",
    conference: "West",
    division: "Pacific",
  },
  "1610612763": {
    abbreviation: "MEM",
    fullName: "Memphis Grizzlies",
    city: "Memphis",
    nickname: "Grizzlies",
    conference: "West",
    division: "Southwest",
  },
  "1610612748": {
    abbreviation: "MIA",
    fullName: "Miami Heat",
    city: "Miami",
    nickname: "Heat",
    conference: "East",
    division: "Southeast",
  },
  "1610612749": {
    abbreviation: "MIL",
    fullName: "Milwaukee Bucks",
    city: "Milwaukee",
    nickname: "Bucks",
    conference: "East",
    division: "Central",
  },
  "1610612750": {
    abbreviation: "MIN",
    fullName: "Minnesota Timberwolves",
    city: "Minnesota",
    nickname: "Timberwolves",
    conference: "West",
    division: "Northwest",
  },
  "1610612740": {
    abbreviation: "NOP",
    fullName: "New Orleans Pelicans",
    city: "New Orleans",
    nickname: "Pelicans",
    conference: "West",
    division: "Southwest",
  },
  "1610612752": {
    abbreviation: "NYK",
    fullName: "New York Knicks",
    city: "New York",
    nickname: "Knicks",
    conference: "East",
    division: "Atlantic",
  },
  "1610612760": {
    abbreviation: "OKC",
    fullName: "Oklahoma City Thunder",
    city: "Oklahoma City",
    nickname: "Thunder",
    conference: "West",
    division: "Northwest",
  },
  "1610612753": {
    abbreviation: "ORL",
    fullName: "Orlando Magic",
    city: "Orlando",
    nickname: "Magic",
    conference: "East",
    division: "Southeast",
  },
  "1610612755": {
    abbreviation: "PHI",
    fullName: "Philadelphia 76ers",
    city: "Philadelphia",
    nickname: "76ers",
    conference: "East",
    division: "Atlantic",
  },
  "1610612756": {
    abbreviation: "PHX",
    fullName: "Phoenix Suns",
    city: "Phoenix",
    nickname: "Suns",
    conference: "West",
    division: "Pacific",
  },
  "1610612757": {
    abbreviation: "POR",
    fullName: "Portland Trail Blazers",
    city: "Portland",
    nickname: "Trail Blazers",
    conference: "West",
    division: "Northwest",
  },
  "1610612758": {
    abbreviation: "SAC",
    fullName: "Sacramento Kings",
    city: "Sacramento",
    nickname: "Kings",
    conference: "West",
    division: "Pacific",
  },
  "1610612759": {
    abbreviation: "SAS",
    fullName: "San Antonio Spurs",
    city: "San Antonio",
    nickname: "Spurs",
    conference: "West",
    division: "Southwest",
  },
  "1610612761": {
    abbreviation: "TOR",
    fullName: "Toronto Raptors",
    city: "Toronto",
    nickname: "Raptors",
    conference: "East",
    division: "Atlantic",
  },
  "1610612762": {
    abbreviation: "UTA",
    fullName: "Utah Jazz",
    city: "Utah",
    nickname: "Jazz",
    conference: "West",
    division: "Northwest",
  },
  "1610612764": {
    abbreviation: "WAS",
    fullName: "Washington Wizards",
    city: "Washington",
    nickname: "Wizards",
    conference: "East",
    division: "Southeast",
  },
};

export function nbaTeamName(teamId: string, fallbackAbbr?: string): string {
  return (
    NBA_TEAM_META[teamId]?.fullName ||
    fallbackAbbr ||
    teamId
  );
}

/** Three-letter abbreviation (BOS, LAL). Falls back to abbr or trimmed id. */
export function nbaTeamAbbr(
  teamId: string,
  fallbackAbbr?: string
): string {
  return (
    NBA_TEAM_META[teamId]?.abbreviation ||
    fallbackAbbr ||
    (/^\d+$/.test(teamId) ? "—" : teamId.toUpperCase())
  );
}
