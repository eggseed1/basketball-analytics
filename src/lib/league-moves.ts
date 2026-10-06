/**
 * Front office, coaching, ownership and league headlines for the home sidebar.
 * Headlines are matched with strict patterns (a move verb plus a role, with an
 * NBA team as the subject) and shown as links. Nothing is stored.
 */

export type LeagueMoveKind = "coaching" | "front-office" | "ownership" | "league";

export type LeagueMoveHeadline = {
  title: string;
  url: string;
  publication: string;
  publishedMs: number | null;
  /** Feed covers only the NBA, so short nicknames like "Kings" are safe. */
  nbaOnly: boolean;
};

export type LeagueMove = {
  id: string;
  kind: LeagueMoveKind;
  title: string;
  url: string;
  publication: string;
  publishedMs: number;
  teamAbbr: string | null;
};

type TeamName = { abbr: string; nick: string; city?: string; full?: string };

const TEAMS: TeamName[] = [
  { abbr: "ATL", nick: "Hawks", city: "Atlanta" },
  { abbr: "BOS", nick: "Celtics", city: "Boston" },
  { abbr: "BKN", nick: "Nets", city: "Brooklyn" },
  { abbr: "CHA", nick: "Hornets", city: "Charlotte" },
  { abbr: "CHI", nick: "Bulls", city: "Chicago" },
  { abbr: "CLE", nick: "Cavaliers", city: "Cleveland" },
  { abbr: "CLE", nick: "Cavs" },
  { abbr: "DAL", nick: "Mavericks", city: "Dallas" },
  { abbr: "DAL", nick: "Mavs" },
  { abbr: "DEN", nick: "Nuggets", city: "Denver" },
  { abbr: "DET", nick: "Pistons", city: "Detroit" },
  { abbr: "GSW", nick: "Warriors", city: "Golden State" },
  { abbr: "HOU", nick: "Rockets", city: "Houston" },
  { abbr: "IND", nick: "Pacers", city: "Indiana" },
  { abbr: "LAC", nick: "Clippers" },
  { abbr: "LAL", nick: "Lakers" },
  { abbr: "MEM", nick: "Grizzlies", city: "Memphis" },
  { abbr: "MIA", nick: "Heat", full: "Miami Heat" },
  { abbr: "MIL", nick: "Bucks", city: "Milwaukee" },
  { abbr: "MIN", nick: "Timberwolves", city: "Minnesota" },
  { abbr: "MIN", nick: "Wolves" },
  { abbr: "NOP", nick: "Pelicans", city: "New Orleans" },
  { abbr: "NYK", nick: "Knicks", city: "New York" },
  { abbr: "OKC", nick: "Thunder", full: "Oklahoma City Thunder" },
  { abbr: "ORL", nick: "Magic", full: "Orlando Magic" },
  { abbr: "PHI", nick: "76ers", city: "Philadelphia" },
  { abbr: "PHI", nick: "Sixers" },
  { abbr: "PHX", nick: "Suns", full: "Phoenix Suns" },
  { abbr: "POR", nick: "Trail Blazers", city: "Portland" },
  { abbr: "POR", nick: "Blazers" },
  { abbr: "SAC", nick: "Kings", full: "Sacramento Kings" },
  { abbr: "SAS", nick: "Spurs", full: "San Antonio Spurs" },
  { abbr: "TOR", nick: "Raptors", city: "Toronto" },
  { abbr: "UTA", nick: "Jazz", full: "Utah Jazz" },
  { abbr: "WAS", nick: "Wizards", city: "Washington" },
];

/** Nicknames shared with other leagues; general feeds need the full name. */
const AMBIGUOUS = new Set(["Heat", "Thunder", "Magic", "Suns", "Kings", "Spurs", "Jazz", "Nets", "Hawks"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const COACH_ROLE =
  /\b(head coach|interim coach|assistant coach|associate head coach|coach(?:ing staff)?)\b/i;
const OFFICE_ROLE =
  /\b(GM|general manager|president(?: of basketball operations)?|basketball (?:operations|ops)|front office|executive|vice president|VP of [a-z ]+|director of (?:player personnel|scouting|basketball operations)|scouting director)\b/;
const TEAM_ACTS =
  /^(?:reportedly |officially |will |set to |plan to |plans to |expected to |to )?(hire|hires|hired|name|names|tab|tabs|tap|taps|promote|promotes|promoted|fire|fires|fired|dismiss|dismisses|dismissed|part ways|parts ways|extend|extends|extended|sign|signs|agree|agrees|interview|interviews|interviewed|finalize|finalizes|add|adds|land|lands|elevate|elevates)\b/i;
const NAMED_TO =
  /\b(named|hired as|hired by|to become|promoted to|tabbed as|elevated to|steps down as|stepping down as|resigns as|out as|fired as|dismissed as|agrees to (?:an? )?(?:contract )?extension)\b/i;
const OWNERSHIP =
  /\b(sale (?:of|to)|sells?|sold|buys?|bought|purchases?|purchased|(?:minority|majority|controlling) (?:stake|interest)|ownership group|new owner)\b/i;
const NOISE =
  /^["'‘“]|\?\s*$|\b(video|mock|rumou?rs?|conspiracy|odds|power rankings?|grades?|takeaways|podcast|quiz|over\/unders?|predictions?)\b|\b(former|ex-)\b/i;

function teamPatterns(nbaOnly: boolean) {
  return TEAMS.map((t) => {
    const names = [t.full, t.city && `${t.city} ${t.nick}`, t.city, !AMBIGUOUS.has(t.nick) || nbaOnly ? t.nick : null]
      .filter((n): n is string => Boolean(n))
      .map(esc);
    return { abbr: t.abbr, re: new RegExp(`\\b(?:${names.join("|")})\\b`) };
  });
}

/** Team named at the start of the headline, with the rest of the headline after it. */
function teamSubject(title: string, nbaOnly: boolean): { abbr: string; rest: string } | null {
  for (const t of TEAMS) {
    const names = [t.full, t.city && `${t.city} ${t.nick}`, !AMBIGUOUS.has(t.nick) || nbaOnly ? t.nick : null, t.city]
      .filter((n): n is string => Boolean(n));
    for (const name of names) {
      const m = title.match(new RegExp(`^(?:The )?${esc(name)}(?:['’]s?)?\\s+(.*)$`));
      if (!m) continue;
      const rest = m[1]!;
      // City alone must be followed by the verb, so "Houston Dash fire coach" stays out.
      if (name === t.city && /^[A-Z]/.test(rest)) continue;
      return { abbr: t.abbr, rest };
    }
  }
  return null;
}

function teamMentioned(title: string, nbaOnly: boolean): string | null {
  for (const p of teamPatterns(nbaOnly)) if (p.re.test(title)) return p.abbr;
  return null;
}

export type LeagueMoveClass = { kind: LeagueMoveKind; teamAbbr: string | null; topic: string };

/** Classify one headline, or null when it is not a move or league event. */
export function classifyLeagueMove(title: string, nbaOnly: boolean): LeagueMoveClass | null {
  const t = title.replace(/\s+/g, " ").trim();
  if (NOISE.test(t)) return null;
  const role = COACH_ROLE.test(t) ? "coaching" : OFFICE_ROLE.test(t) ? "front-office" : null;
  const subject = teamSubject(t, nbaOnly);
  const team = subject?.abbr ?? teamMentioned(t, nbaOnly);

  if (role && team) {
    if (subject && TEAM_ACTS.test(subject.rest)) return { kind: role, teamAbbr: team, topic: `${team}:${role}` };
    if (NAMED_TO.test(t)) return { kind: role, teamAbbr: team, topic: `${team}:${role}` };
  }

  const expansion = /\bexpansion\b/i.test(t);
  if (team && !expansion && OWNERSHIP.test(t)) {
    return { kind: "ownership", teamAbbr: team, topic: `${team}:ownership` };
  }

  const discipline = /\b(fined|suspended)\s+(?:\$|\d|for\b|without\b|indefinitely\b|by the NBA\b|one\b|two\b|three\b|five\b|ten\b)/i.test(t);
  if (discipline && (subject || /\bNBA\b/.test(t))) {
    const who = t.split(/\s+(?:fined|suspended)\b/i)[0]!.toLowerCase();
    return { kind: "league", teamAbbr: team, topic: `discipline:${who}` };
  }

  const league = /\bNBA\b|\bAdam Silver\b|\bBoard of Governors\b/.test(t);
  if (!league) return null;
  if (/\bNBA Europe\b|\bEuroLeague\b/i.test(t)) return { kind: "league", teamAbbr: null, topic: "nba-europe" };
  if (expansion) return { kind: "league", teamAbbr: null, topic: "expansion" };
  const gov = t.match(
    /\b(Board of Governors|competition committee|rule changes?|collective bargaining|CBA|media rights|draft lottery|lottery reform|tampering|in-season tournament|NBA Cup|All-Star (?:format|Game format))\b/i
  );
  if (gov && /\b(approve[sd]?|vote[sd]?|announce[sd]?|adopt(?:s|ed)?|change[sd]?|propose[sd]?|reform|investigat\w+|penal\w+|format)\b/i.test(t)) {
    return { kind: "league", teamAbbr: null, topic: `governance:${gov[1]!.toLowerCase()}` };
  }
  return null;
}

export const LEAGUE_MOVE_MAX_AGE_DAYS = 30;
const MAX_LEAGUE = 3;

/**
 * Newest headline per story, newest first. Team moves dedupe on team and role,
 * league stories on topic, so ten outlets on one expansion update show once.
 */
export function pickLeagueMoves(
  items: LeagueMoveHeadline[],
  now: number,
  limit = 6
): LeagueMove[] {
  const cutoff = now - LEAGUE_MOVE_MAX_AGE_DAYS * 86_400_000;
  const best = new Map<string, LeagueMove>();
  for (const item of items) {
    if (item.publishedMs == null || item.publishedMs < cutoff || item.publishedMs > now + 3_600_000) continue;
    const c = classifyLeagueMove(item.title, item.nbaOnly);
    if (!c) continue;
    const prev = best.get(c.topic);
    if (prev && prev.publishedMs >= item.publishedMs) continue;
    best.set(c.topic, {
      id: `${c.topic}:${item.publishedMs}`,
      kind: c.kind,
      title: item.title.replace(/\s+/g, " ").trim(),
      url: item.url,
      publication: item.publication,
      publishedMs: item.publishedMs,
      teamAbbr: c.teamAbbr,
    });
  }
  const sorted = [...best.values()].sort((a, b) => b.publishedMs - a.publishedMs);
  const out: LeagueMove[] = [];
  let league = 0;
  for (const move of sorted) {
    if (move.kind === "league" && league >= MAX_LEAGUE) continue;
    if (move.kind === "league") league++;
    out.push(move);
    if (out.length >= limit) break;
  }
  return out;
}
