/**
 * Reporter and outlet attribution for movement claims.
 *
 * Credibility values are an editorial table on the evidence-score scale
 * (source credibility tops out near 32). They rank how directly a source
 * usually reports NBA movement; they are not accuracy measurements.
 */

export type ReporterMention = { name: string; outlet?: string };

export type MovementSourceTier = { label: string; credibility: number };

/** Insiders whose scoops other outlets routinely cite. */
const NATIONAL_INSIDERS: Record<string, string> = {
  "Shams Charania": "ESPN",
  "Brian Windhorst": "ESPN",
  "Bobby Marks": "ESPN",
  "Marc Stein": "The Stein Line",
  "Jake Fischer": "The Stein Line",
  "Chris Haynes": "NBA on Prime",
  "Michael Scotto": "HoopsHype",
  "Sam Amick": "The Athletic",
  "Adrian Wojnarowski": "ESPN",
};

/** Named national writers and team beats frequently quoted in wire items. */
const BEAT_REPORTERS: Record<string, string> = {
  "Tim Bontemps": "ESPN",
  "Ramona Shelburne": "ESPN",
  "Dave McMenamin": "ESPN",
  "Anthony Slater": "ESPN",
  "Joe Vardon": "The Athletic",
  "Matt Slater": "The Athletic",
  "Fred Katz": "The Athletic",
  "Jovan Buha": "The Athletic",
  "Eric Nehm": "The Athletic",
  "Law Murray": "The Athletic",
  "Kelly Iko": "The Athletic",
  "Jared Weiss": "The Athletic",
  "Hunter Patterson": "The Athletic",
  "Ian Begley": "SNY",
  "Stefan Bondy": "New York Post",
  "Keith Smith": "Spotrac",
  "Kevin O'Connor": "Yahoo Sports",
  "Jason Lloyd": "The Athletic",
  "Chris Mannix": "Sports Illustrated",
  "Brett Siegel": "ClutchPoints",
  "Evan Sidery": "Forbes",
  "Omari Sankofa II": "Detroit Free Press",
  "Ira Winderman": "South Florida Sun Sentinel",
  "Barry Jackson": "Miami Herald",
  "Brad Townsend": "Dallas Morning News",
  "Mike Vorkunov": "The Athletic",
  "Josh Robbins": "The Athletic",
};

const KNOWN_OUTLETS = [
  "ESPN",
  "The Athletic",
  "The Stein Line",
  "HoopsHype",
  "Yahoo Sports",
  "Bleacher Report",
  "NBA on Prime",
  "NBA.com",
  "The Ringer",
  "SNY",
  "New York Post",
  "Newsday",
  "Boston Globe",
  "MassLive",
  "Spotrac",
  "ClutchPoints",
  "Forbes",
  "Sports Illustrated",
  "The Oklahoman",
  "Detroit Free Press",
  "Detroit News",
  "Miami Herald",
  "South Florida Sun Sentinel",
  "Los Angeles Times",
  "Dallas Morning News",
  "San Francisco Chronicle",
  "Philadelphia Inquirer",
  "Denver Post",
  "Chicago Tribune",
  "Chicago Sun-Times",
  "Arizona Republic",
  "Salt Lake Tribune",
  "Deseret News",
  "The Oregonian",
  "Sacramento Bee",
  "Star Tribune",
  "Houston Chronicle",
  "Toronto Star",
  "TSN",
  "Sportsnet",
  "IndyStar",
  "Indianapolis Star",
  "Commercial Appeal",
  "Charlotte Observer",
  "Orlando Sentinel",
  "Atlanta Journal-Constitution",
  "Milwaukee Journal Sentinel",
  "Washington Post",
  "CBS Sports",
];

const NAME = String.raw`[A-Z][a-zA-Z'’.-]+(?:\s[A-Z][a-zA-Z'’.-]+){1,2}`;
const OUTLET = String.raw`(?:the\s+)?([A-Z][\w.&'’-]*(?:\s[A-Z][\w.&'’-]*){0,3})`;

const ATTRIBUTION = new RegExp(
  String.raw`(?:according to|per|told|reports?|reported|reporting by|via)\s+(${NAME})(?:\s+and\s+(${NAME}))?\s+(?:of|from|with)\s+${OUTLET}`,
  "g"
);

const POSSESSIVE = new RegExp(
  String.raw`(${KNOWN_OUTLETS.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})['’]s\s+(${NAME})`,
  "g"
);

function canonicalOutlet(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/^the\s+/i, "").trim().toLowerCase();
  return KNOWN_OUTLETS.find((outlet) => {
    const known = outlet.replace(/^the\s+/i, "").toLowerCase();
    return cleaned === known || cleaned.startsWith(`${known} `);
  });
}

function knownReporterOutlet(name: string): string | undefined {
  return NATIONAL_INSIDERS[name] ?? BEAT_REPORTERS[name];
}

/** Named reporters credited in a headline or summary. */
export function extractReporters(text: string): ReporterMention[] {
  const found = new Map<string, ReporterMention>();
  const add = (name: string, outlet?: string) => {
    const clean = name.replace(/['’]s$/, "").trim();
    const known = knownReporterOutlet(clean);
    const resolvedOutlet = canonicalOutlet(outlet) ?? known;
    if (!known && !canonicalOutlet(outlet)) return;
    if (!found.has(clean)) found.set(clean, { name: clean, outlet: resolvedOutlet });
  };

  for (const match of text.matchAll(ATTRIBUTION)) {
    add(match[1]!, match[3]);
    if (match[2]) add(match[2], match[3]);
  }
  for (const match of text.matchAll(POSSESSIVE)) {
    add(match[2]!, match[1]);
  }
  for (const name of [...Object.keys(NATIONAL_INSIDERS), ...Object.keys(BEAT_REPORTERS)]) {
    if (text.includes(name)) add(name);
  }
  return [...found.values()];
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function reporterSourceId(reporter: ReporterMention): string {
  return `reporter:${slug(reporter.name)}`;
}

export function outletSourceId(outlet: string): string {
  return `outlet:${slug(outlet)}`;
}

export const ESPN_TRANSACTIONS_SOURCE_ID = "ledger:espn-transactions";

export function reporterTier(reporter: ReporterMention): MovementSourceTier {
  const label = reporter.outlet ? `${reporter.name} (${reporter.outlet})` : reporter.name;
  if (NATIONAL_INSIDERS[reporter.name]) return { label, credibility: 30 };
  if (BEAT_REPORTERS[reporter.name]) return { label, credibility: 22 };
  return { label, credibility: 18 };
}

/** Outlet credibility when no reporter is named in the item. */
export function outletTier(outlet: string, kind: "own_sources" | "relayed"): MovementSourceTier {
  if (kind === "own_sources") {
    const national = outlet === "ESPN" || outlet === "The Athletic";
    return { label: outlet, credibility: national ? 24 : 16 };
  }
  return { label: outlet, credibility: outlet === "RealGM" ? 8 : 12 };
}

export const ESPN_TRANSACTIONS_TIER: MovementSourceTier = {
  label: "ESPN transaction log",
  credibility: 32,
};
