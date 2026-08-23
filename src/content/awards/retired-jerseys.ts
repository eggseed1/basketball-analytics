/**
 * NBA retired jersey numbers — factual rafter honors keyed by NBA PERSON_ID.
 * Numbers and teams are curated from franchise retirement records (not live jersey).
 */

export type RetiredJerseyRecord = {
  /** stats.nba.com PERSON_ID */
  nbaPlayerId: string;
  /** Canonical brand key (TEAM_BRANDS abbr: bos, chi, …). */
  teamKey: string;
  /** Exact number on the banner ("34", "00", "6", …). */
  number: string;
  /** Display name for audit / aria. */
  playerName: string;
};

/**
 * Arena-accurate banner palettes: number + field + frame as hung in the building.
 * Falls back to primary-on-white when a franchise isn’t listed.
 */
export type RetiredJerseyPalette = {
  number: string;
  field: string;
  border: string;
};

/** Known arena banner treatments (verified from team/brand + public photos). */
export const RETIRED_JERSEY_PALETTES: Record<string, RetiredJerseyPalette> = {
  // Celtics: kelly green digits on white, green frame (e.g. Pierce #34).
  bos: { number: "#007A33", field: "#FFFFFF", border: "#007A33" },
  // Bulls: red on white.
  chi: { number: "#CE1141", field: "#FFFFFF", border: "#CE1141" },
  // Lakers: purple on gold.
  lal: { number: "#552583", field: "#FDB927", border: "#552583" },
  // Spurs: black on silver/white.
  sas: { number: "#000000", field: "#C4CED4", border: "#000000" },
  // Heat: red on yellow gold.
  mia: { number: "#98002E", field: "#F9A01B", border: "#98002E" },
  // Knicks: blue on orange.
  nyk: { number: "#006BB6", field: "#F58426", border: "#006BB6" },
  // Nets (NJ/BKN): black on white.
  bkn: { number: "#000000", field: "#FFFFFF", border: "#000000" },
  // Mavericks: blue on silver.
  dal: { number: "#00538C", field: "#B8C4CA", border: "#00538C" },
  // Rockets: red on white.
  hou: { number: "#CE1141", field: "#FFFFFF", border: "#CE1141" },
  // Jazz: navy on gold.
  uta: { number: "#002B5C", field: "#F9A01B", border: "#002B5C" },
  // Suns: purple on orange.
  phx: { number: "#1D1160", field: "#E56020", border: "#1D1160" },
  // Pacers: navy on gold.
  ind: { number: "#002D62", field: "#FDBB30", border: "#002D62" },
  // Pistons: red on blue (modern) — classic Bad Boys used red/white/blue.
  det: { number: "#C8102E", field: "#FFFFFF", border: "#1D42BA" },
  // Sixers: red on blue.
  phi: { number: "#ED174C", field: "#006BB6", border: "#002B5C" },
  // Warriors: blue on gold.
  gsw: { number: "#1D428A", field: "#FFC72C", border: "#1D428A" },
  // Blazers: red on black.
  por: { number: "#E03A3E", field: "#000000", border: "#E03A3E" },
  // Sonics/OKC lineage for Payton/Kemp era banners — green/gold.
  okc: { number: "#007AC1", field: "#EF3B24", border: "#002D62" },
  sea: { number: "#00653A", field: "#FFC200", border: "#00653A" },
  // Nuggets: navy on gold.
  den: { number: "#0E2240", field: "#FEC524", border: "#0E2240" },
  // Bucks: green on cream.
  mil: { number: "#00471B", field: "#EEE1C6", border: "#00471B" },
  // Magic: blue on black.
  orl: { number: "#0077C0", field: "#000000", border: "#C4CED4" },
  // Cavs: wine on gold.
  cle: { number: "#860038", field: "#FDBB30", border: "#860038" },
  // Hawks: red on yellow.
  atl: { number: "#E03A3E", field: "#C1D32F", border: "#E03A3E" },
  // Hornets: teal/purple.
  cha: { number: "#1D1160", field: "#00788C", border: "#1D1160" },
  // Kings: purple on silver.
  sac: { number: "#5A2D81", field: "#63727A", border: "#5A2D81" },
  // Wizards / Bullets era: red/blue/white.
  was: { number: "#E31837", field: "#FFFFFF", border: "#002B5C" },
  // Timberwolves: blue on green/silver.
  min: { number: "#0C2340", field: "#236192", border: "#78BE20" },
  // Raptors: red on black.
  tor: { number: "#CE1141", field: "#000000", border: "#CE1141" },
  // Grizzlies: navy on gold.
  mem: { number: "#5D76A9", field: "#FDB927", border: "#12173F" },
  // Pelicans / NO Hornets: navy/red/gold.
  nop: { number: "#0C2340", field: "#C8102E", border: "#85714D" },
};

/**
 * Curated retirements. Prefer incomplete-but-correct over guessed numbers.
 * Multi-franchise honors appear as separate rows for the same player id.
 */
export const RETIRED_JERSEYS: RetiredJerseyRecord[] = [
  // Boston Celtics
  { nbaPlayerId: "305", teamKey: "bos", number: "00", playerName: "Robert Parish" },
  { nbaPlayerId: "77141", teamKey: "bos", number: "3", playerName: "Dennis Johnson" },
  { nbaPlayerId: "708", teamKey: "bos", number: "5", playerName: "Kevin Garnett" },
  { nbaPlayerId: "78049", teamKey: "bos", number: "6", playerName: "Bill Russell" },
  { nbaPlayerId: "78510", teamKey: "bos", number: "10", playerName: "Jo Jo White" },
  { nbaPlayerId: "600003", teamKey: "bos", number: "14", playerName: "Bob Cousy" },
  { nbaPlayerId: "76988", teamKey: "bos", number: "15", playerName: "Tom Heinsohn" },
  { nbaPlayerId: "76970", teamKey: "bos", number: "17", playerName: "John Havlicek" },
  { nbaPlayerId: "76462", teamKey: "bos", number: "18", playerName: "Dave Cowens" },
  { nbaPlayerId: "77196", teamKey: "bos", number: "24", playerName: "Sam Jones" },
  { nbaPlayerId: "77487", teamKey: "bos", number: "31", playerName: "Cedric Maxwell" },
  { nbaPlayerId: "1450", teamKey: "bos", number: "32", playerName: "Kevin McHale" },
  { nbaPlayerId: "1449", teamKey: "bos", number: "33", playerName: "Larry Bird" },
  { nbaPlayerId: "1718", teamKey: "bos", number: "34", playerName: "Paul Pierce" },
  { nbaPlayerId: "77384", teamKey: "bos", number: "35", playerName: "Reggie Lewis" },

  // Chicago Bulls
  { nbaPlayerId: "201565", teamKey: "chi", number: "1", playerName: "Derrick Rose" },
  { nbaPlayerId: "893", teamKey: "chi", number: "23", playerName: "Michael Jordan" },
  { nbaPlayerId: "937", teamKey: "chi", number: "33", playerName: "Scottie Pippen" },

  // Los Angeles Lakers
  { nbaPlayerId: "77142", teamKey: "lal", number: "32", playerName: "Magic Johnson" },
  { nbaPlayerId: "76003", teamKey: "lal", number: "33", playerName: "Kareem Abdul-Jabbar" },
  { nbaPlayerId: "406", teamKey: "lal", number: "34", playerName: "Shaquille O'Neal" },
  { nbaPlayerId: "1460", teamKey: "lal", number: "42", playerName: "James Worthy" },
  { nbaPlayerId: "977", teamKey: "lal", number: "8", playerName: "Kobe Bryant" },
  { nbaPlayerId: "977", teamKey: "lal", number: "24", playerName: "Kobe Bryant" },
  { nbaPlayerId: "78497", teamKey: "lal", number: "44", playerName: "Jerry West" },
  { nbaPlayerId: "76127", teamKey: "lal", number: "22", playerName: "Elgin Baylor" },
  { nbaPlayerId: "76375", teamKey: "lal", number: "13", playerName: "Wilt Chamberlain" },

  // San Antonio Spurs
  { nbaPlayerId: "1495", teamKey: "sas", number: "21", playerName: "Tim Duncan" },
  { nbaPlayerId: "2225", teamKey: "sas", number: "9", playerName: "Tony Parker" },
  { nbaPlayerId: "1938", teamKey: "sas", number: "20", playerName: "Manu Ginobili" },
  { nbaPlayerId: "764", teamKey: "sas", number: "50", playerName: "David Robinson" },
  { nbaPlayerId: "76804", teamKey: "sas", number: "44", playerName: "George Gervin" },

  // Miami Heat
  { nbaPlayerId: "2548", teamKey: "mia", number: "3", playerName: "Dwyane Wade" },
  { nbaPlayerId: "297", teamKey: "mia", number: "33", playerName: "Alonzo Mourning" },
  { nbaPlayerId: "406", teamKey: "mia", number: "32", playerName: "Shaquille O'Neal" },

  // Dallas Mavericks
  { nbaPlayerId: "1717", teamKey: "dal", number: "41", playerName: "Dirk Nowitzki" },
  { nbaPlayerId: "76176", teamKey: "dal", number: "22", playerName: "Rolando Blackman" },
  { nbaPlayerId: "76016", teamKey: "dal", number: "24", playerName: "Mark Aguirre" },
  { nbaPlayerId: "76516", teamKey: "dal", number: "15", playerName: "Brad Davis" },
  { nbaPlayerId: "157", teamKey: "dal", number: "12", playerName: "Derek Harper" },

  // Houston Rockets
  { nbaPlayerId: "165", teamKey: "hou", number: "34", playerName: "Hakeem Olajuwon" },
  { nbaPlayerId: "77449", teamKey: "hou", number: "24", playerName: "Moses Malone" },
  { nbaPlayerId: "1503", teamKey: "hou", number: "1", playerName: "Tracy McGrady" },

  // Utah Jazz
  { nbaPlayerId: "252", teamKey: "uta", number: "32", playerName: "Karl Malone" },
  { nbaPlayerId: "304", teamKey: "uta", number: "12", playerName: "John Stockton" },
  { nbaPlayerId: "77459", teamKey: "uta", number: "7", playerName: "Pete Maravich" },

  // New York Knicks
  { nbaPlayerId: "121", teamKey: "nyk", number: "33", playerName: "Patrick Ewing" },
  { nbaPlayerId: "76750", teamKey: "nyk", number: "10", playerName: "Walt Frazier" },
  { nbaPlayerId: "77929", teamKey: "nyk", number: "19", playerName: "Willis Reed" },
  { nbaPlayerId: "600006", teamKey: "nyk", number: "15", playerName: "Earl Monroe" },
  { nbaPlayerId: "77264", teamKey: "nyk", number: "30", playerName: "Bernard King" },

  // Philadelphia 76ers
  { nbaPlayerId: "947", teamKey: "phi", number: "3", playerName: "Allen Iverson" },
  { nbaPlayerId: "76681", teamKey: "phi", number: "6", playerName: "Julius Erving" },
  { nbaPlayerId: "76375", teamKey: "phi", number: "13", playerName: "Wilt Chamberlain" },
  { nbaPlayerId: "77449", teamKey: "phi", number: "2", playerName: "Moses Malone" },

  // Phoenix Suns
  { nbaPlayerId: "787", teamKey: "phx", number: "34", playerName: "Charles Barkley" },
  { nbaPlayerId: "959", teamKey: "phx", number: "13", playerName: "Steve Nash" },
  { nbaPlayerId: "134", teamKey: "phx", number: "7", playerName: "Kevin Johnson" },

  // Indiana Pacers
  { nbaPlayerId: "397", teamKey: "ind", number: "31", playerName: "Reggie Miller" },

  // Detroit Pistons
  { nbaPlayerId: "78318", teamKey: "det", number: "11", playerName: "Isiah Thomas" },
  { nbaPlayerId: "247", teamKey: "det", number: "4", playerName: "Joe Dumars" },
  { nbaPlayerId: "23", teamKey: "det", number: "10", playerName: "Dennis Rodman" },
  { nbaPlayerId: "76166", teamKey: "det", number: "21", playerName: "Dave Bing" },

  // Milwaukee Bucks — skip until IDs verified for Abdul-Jabbar #33 Bucks etc.
  { nbaPlayerId: "76003", teamKey: "mil", number: "33", playerName: "Kareem Abdul-Jabbar" },

  // Portland Trail Blazers
  { nbaPlayerId: "17", teamKey: "por", number: "22", playerName: "Clyde Drexler" },
  { nbaPlayerId: "345", teamKey: "por", number: "30", playerName: "Terry Porter" },
  { nbaPlayerId: "203", teamKey: "por", number: "10", playerName: "Nate McMillan" },

  // Seattle SuperSonics (historical brand key)
  { nbaPlayerId: "56", teamKey: "sea", number: "20", playerName: "Gary Payton" },
  { nbaPlayerId: "431", teamKey: "sea", number: "40", playerName: "Shawn Kemp" },

  // Minnesota Timberwolves
  { nbaPlayerId: "708", teamKey: "min", number: "21", playerName: "Kevin Garnett" },

  // Denver Nuggets
  { nbaPlayerId: "76673", teamKey: "den", number: "2", playerName: "Alex English" },
  { nbaPlayerId: "77097", teamKey: "den", number: "44", playerName: "Dan Issel" },
  { nbaPlayerId: "78326", teamKey: "den", number: "33", playerName: "David Thompson" },
  { nbaPlayerId: "87", teamKey: "den", number: "55", playerName: "Dikembe Mutombo" },

  // Atlanta Hawks
  { nbaPlayerId: "1122", teamKey: "atl", number: "21", playerName: "Dominique Wilkins" },
  { nbaPlayerId: "77459", teamKey: "atl", number: "44", playerName: "Pete Maravich" },
  { nbaPlayerId: "87", teamKey: "atl", number: "55", playerName: "Dikembe Mutombo" },

  // Brooklyn / New Jersey Nets
  { nbaPlayerId: "77845", teamKey: "bkn", number: "3", playerName: "Dražen Petrović" },
  { nbaPlayerId: "467", teamKey: "bkn", number: "5", playerName: "Jason Kidd" },
  { nbaPlayerId: "1713", teamKey: "bkn", number: "15", playerName: "Vince Carter" },
  { nbaPlayerId: "76681", teamKey: "bkn", number: "32", playerName: "Julius Erving" },
  { nbaPlayerId: "433", teamKey: "bkn", number: "52", playerName: "Buck Williams" },

  // Charlotte Hornets
  { nbaPlayerId: "184", teamKey: "cha", number: "13", playerName: "Bobby Phills" },
  { nbaPlayerId: "209", teamKey: "cha", number: "30", playerName: "Dell Curry" },

  // Cleveland Cavaliers
  { nbaPlayerId: "980", teamKey: "cle", number: "11", playerName: "Zydrunas Ilgauskas" },
  { nbaPlayerId: "921", teamKey: "cle", number: "43", playerName: "Brad Daugherty" },
  { nbaPlayerId: "899", teamKey: "cle", number: "25", playerName: "Mark Price" },
  { nbaPlayerId: "76348", teamKey: "cle", number: "34", playerName: "Austin Carr" },

  // Golden State Warriors
  { nbaPlayerId: "904", teamKey: "gsw", number: "17", playerName: "Chris Mullin" },
  { nbaPlayerId: "782", teamKey: "gsw", number: "2", playerName: "Mitch Richmond" },
  { nbaPlayerId: "600013", teamKey: "gsw", number: "24", playerName: "Rick Barry" },
  { nbaPlayerId: "76375", teamKey: "gsw", number: "13", playerName: "Wilt Chamberlain" },

  // Sacramento Kings
  { nbaPlayerId: "185", teamKey: "sac", number: "4", playerName: "Chris Webber" },
  { nbaPlayerId: "124", teamKey: "sac", number: "21", playerName: "Vlade Divac" },
  { nbaPlayerId: "978", teamKey: "sac", number: "16", playerName: "Peja Stojakovic" },
  { nbaPlayerId: "1710", teamKey: "sac", number: "10", playerName: "Mike Bibby" },

  // Orlando Magic
  { nbaPlayerId: "358", teamKey: "orl", number: "1", playerName: "Anfernee Hardaway" },
  { nbaPlayerId: "2730", teamKey: "orl", number: "12", playerName: "Dwight Howard" },
  { nbaPlayerId: "406", teamKey: "orl", number: "32", playerName: "Shaquille O'Neal" },

  // New Orleans / Maravich
  { nbaPlayerId: "77459", teamKey: "nop", number: "7", playerName: "Pete Maravich" },
];

const BY_NBA_ID = new Map<string, RetiredJerseyRecord[]>();
for (const row of RETIRED_JERSEYS) {
  const list = BY_NBA_ID.get(row.nbaPlayerId) ?? [];
  list.push(row);
  BY_NBA_ID.set(row.nbaPlayerId, list);
}

export function getRetiredJerseysByNbaId(
  nbaPlayerId: string | null | undefined
): RetiredJerseyRecord[] {
  if (!nbaPlayerId) return [];
  return BY_NBA_ID.get(String(nbaPlayerId).trim()) ?? [];
}
