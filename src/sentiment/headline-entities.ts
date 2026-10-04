/**
 * Resolve player and team mentions in a headline to ESPN ids.
 *
 * Full names always match. A surname alone matches only when exactly one
 * rostered player carries it and it is not an ordinary English word, so
 * "Green" or "Young" never resolve on their own. Team nicknames resolve to
 * ESPN team ids.
 */

export type HeadlineRosterPlayer = {
  playerId: string;
  name: string;
  teamId?: string;
};

export type HeadlineEntities = {
  playerIds: string[];
  teamIds: string[];
};

export const ESPN_TEAM_NICKNAMES: Record<string, string[]> = {
  "1": ["Hawks"],
  "2": ["Celtics"],
  "3": ["Pelicans", "Pels"],
  "4": ["Bulls"],
  "5": ["Cavaliers", "Cavs"],
  "6": ["Mavericks", "Mavs"],
  "7": ["Nuggets"],
  "8": ["Pistons"],
  "9": ["Warriors", "Dubs"],
  "10": ["Rockets"],
  "11": ["Pacers"],
  "12": ["Clippers"],
  "13": ["Lakers"],
  "14": ["Heat"],
  "15": ["Bucks"],
  "16": ["Timberwolves", "Wolves"],
  "17": ["Nets"],
  "18": ["Knicks"],
  "19": ["Magic"],
  "20": ["76ers", "Sixers"],
  "21": ["Suns"],
  "22": ["Trail Blazers", "Blazers"],
  "23": ["Kings"],
  "24": ["Spurs"],
  "25": ["Thunder"],
  "26": ["Jazz"],
  "27": ["Wizards"],
  "28": ["Raptors"],
  "29": ["Grizzlies"],
  "30": ["Hornets"],
};

/**
 * Widely used single-token handles, matched case-sensitively. First names
 * belong here only when fans use them alone and one player owns them.
 */
const PLAYER_NICKNAMES: Record<string, string> = {
  SGA: "Shai Gilgeous-Alexander",
  Shai: "Shai Gilgeous-Alexander",
  Giannis: "Giannis Antetokounmpo",
  LeBron: "LeBron James",
  Wemby: "Victor Wembanyama",
  Wembanyama: "Victor Wembanyama",
  Jokic: "Nikola Jokic",
  Luka: "Luka Doncic",
  "Ant-Man": "Anthony Edwards",
  KAT: "Karl-Anthony Towns",
  Embiid: "Joel Embiid",
  Kawhi: "Kawhi Leonard",
  Steph: "Stephen Curry",
  KD: "Kevin Durant",
  Kyrie: "Kyrie Irving",
  Jayson: "Jayson Tatum",
  Cade: "Cade Cunningham",
  Trae: "Trae Young",
  Paolo: "Paolo Banchero",
  Lauri: "Lauri Markkanen",
};

/** Surnames that are also everyday words or place names in headlines. */
const AMBIGUOUS_SURNAMES = new Set(
  [
    "allen", "banks", "barnes", "bates", "black", "blue", "bridges", "brooks",
    "brown", "butler", "carter", "christmas", "cook", "craig", "daniels",
    "davis", "duke", "ellis", "evans", "fields", "ford", "fox", "gates",
    "george", "gordon", "grant", "green", "hardy", "harris", "hart", "hayes",
    "hill", "holiday", "house", "howard", "hunter", "jackson", "james",
    "johnson", "jones", "king", "knight", "lewis", "little", "love", "mann",
    "martin", "miles", "miller", "mitchell", "moody", "moore", "morris",
    "murray", "nance", "paul", "payne", "porter", "powell", "price", "reed",
    "richards", "roberts", "robinson", "rose", "sharpe", "simons", "smart",
    "smith", "strong", "sweet", "taylor", "thomas", "thompson", "turner",
    "wade", "walker", "wall", "washington", "watson", "wells", "white",
    "williams", "wilson", "wright", "young", "waters", "castle", "champion",
    "early", "jordan", "hood", "gay", "noel", "noble", "lively", "coffey",
    "cash", "sims", "okongwu",
  ].map((s) => s.toLowerCase())
);

const NAME_SUFFIX = /\s+(jr\.?|sr\.?|ii|iii|iv)$/i;

export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'");
}

function normalizeForMatch(value: string): string {
  return foldName(value)
    .toLowerCase()
    .replace(/[^a-z0-9'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordPattern(phrase: string, flags = ""): RegExp {
  return new RegExp(`(?<![A-Za-z0-9'])${escapeRegExp(phrase)}(?![A-Za-z0-9])`, flags);
}

/** Team nicknames that also appear inside people's names. */
const TEAM_NAME_EXCLUSIONS: Record<string, RegExp> = {
  Magic: /(?<![A-Za-z0-9'])Magic(?![A-Za-z0-9])(?!\s+Johnson)/,
  Heat: /(?<![A-Za-z0-9'])Heat(?![A-Za-z0-9])(?!\s+[Cc]heck)/,
};

export type HeadlineEntityResolver = (text: string) => HeadlineEntities;

type NamePattern = { pattern: RegExp; playerId: string; hyphenated?: boolean };

export function createHeadlineEntityResolver(
  roster: HeadlineRosterPlayer[],
  options: { fullNamesOnly?: boolean } = {}
): HeadlineEntityResolver {
  const fullNames: { pattern: RegExp; playerId: string }[] = [];
  const surnameCounts = new Map<string, number>();
  const surnameOwner = new Map<string, HeadlineRosterPlayer>();
  const byFoldedName = new Map<string, string>();

  for (const player of roster) {
    const folded = normalizeForMatch(player.name.replace(NAME_SUFFIX, ""));
    if (!folded) continue;
    byFoldedName.set(folded, player.playerId);
    fullNames.push({ pattern: wordPattern(folded), playerId: player.playerId });
    const parts = folded.split(" ");
    const surname = parts[parts.length - 1]!;
    surnameCounts.set(surname, (surnameCounts.get(surname) ?? 0) + 1);
    surnameOwner.set(surname, player);
  }

  const surnames: NamePattern[] = [];
  for (const [surname, count] of surnameCounts) {
    if (count !== 1 || surname.length < 5 || AMBIGUOUS_SURNAMES.has(surname)) continue;
    const owner = surnameOwner.get(surname)!;
    const display = foldName(owner.name.replace(NAME_SUFFIX, "")).split(" ").pop()!;
    surnames.push({
      pattern: wordPattern(display),
      playerId: owner.playerId,
      hyphenated: display.includes("-"),
    });
  }

  // "Alexander" alone must not match inside "Gilgeous-Alexander", while
  // "Anthony Davis-for-Jalen Duren" still names Davis.
  const hyphenated = [
    ...new Set(
      roster.flatMap((player) =>
        foldName(player.name).split(/\s+/).filter((token) => token.includes("-"))
      )
    ),
  ];
  const hyphenatedNames = hyphenated.length
    ? new RegExp(
        `(?<![A-Za-z0-9'])(?:${hyphenated.map(escapeRegExp).join("|")})(?![A-Za-z0-9])`,
        "gi"
      )
    : null;

  const nicknames: NamePattern[] = [];
  for (const [handle, fullName] of Object.entries(PLAYER_NICKNAMES)) {
    const playerId = byFoldedName.get(normalizeForMatch(fullName));
    if (playerId) nicknames.push({ pattern: wordPattern(handle), playerId });
  }

  const teams: { pattern: RegExp; teamId: string }[] = [];
  for (const [teamId, names] of Object.entries(ESPN_TEAM_NICKNAMES)) {
    for (const name of names) {
      teams.push({ pattern: TEAM_NAME_EXCLUSIONS[name] ?? wordPattern(name), teamId });
    }
  }

  return (text: string) => {
    const folded = foldName(text);
    const lower = normalizeForMatch(text);
    const playerIds = new Set<string>();
    for (const entry of fullNames) {
      if (entry.pattern.test(lower)) playerIds.add(entry.playerId);
    }
    if (!options.fullNamesOnly) {
      const masked = hyphenatedNames ? folded.replace(hyphenatedNames, " ") : folded;
      for (const entry of [...surnames, ...nicknames]) {
        if (entry.pattern.test(entry.hyphenated ? folded : masked)) playerIds.add(entry.playerId);
      }
    }
    const teamIds = new Set<string>();
    for (const entry of teams) {
      if (entry.pattern.test(folded)) teamIds.add(entry.teamId);
    }
    return { playerIds: [...playerIds], teamIds: [...teamIds] };
  };
}
