/**
 * Official NBA watch destinations by season era and viewer country.
 *
 * Per-game networks still come from ESPN broadcasts. This module maps those
 * labels to legal URLs and adds regional partners (Canada, UK, etc.) when the
 * viewer is outside the US national package.
 *
 * Season era flips automatically from the game's season string once 2025-26
 * media rights begin (Disney / NBCU / Amazon through 2035-36).
 */

import { currentNbaStartYear, startYearFromCanonicalSeason } from "@/data/providers/historical/season-range";

export type StreamingSeasonEra = "pre-2025" | "2025-media";

export type StreamingPartner = {
  id: string;
  name: string;
  watchUrl: string;
  /** How this partner fits for the region. */
  role: "national" | "regional" | "league_pass" | "guide";
  note?: string;
};

export type StreamingRegion = {
  /** ISO 3166-1 alpha-2 codes this package covers. */
  countries: readonly string[];
  label: string;
  partners: readonly StreamingPartner[];
  leaguePassAvailable: boolean;
  leaguePassNote: string;
};

/** NBA.com guide pages that the league updates for each season. */
export const NBA_WATCH_HUB = "https://www.nba.com/watch";
export const NBA_LEAGUE_PASS = "https://www.nba.com/watch/league-pass";
export const NBA_HOW_TO_WATCH_2025 =
  "https://www.nba.com/news/how-to-watch-games-2025-26-season";
export const NBA_LEAGUE_PASS_GLOBAL =
  "https://support.watch.nba.com/hc/en-us/articles/115000586473-Global-NBA-League-Pass-Availability";

/** Countries where League Pass is not sold (NBA Help Center). */
export const LEAGUE_PASS_BLOCKED = new Set([
  "BY", // Belarus
  "CN", // China
  "CU", // Cuba
  "IR", // Iran
  "KP", // North Korea
  "RU", // Russia
  "SY", // Syria
  "UA", // Ukraine (incl. contested regions per NBA list)
]);

export function streamingEraForSeason(season?: string | null): StreamingSeasonEra {
  let start = currentNbaStartYear();
  if (season) {
    try {
      start = startYearFromCanonicalSeason(season);
    } catch {
      const match = /^(\d{4})/.exec(season);
      if (match) start = Number(match[1]);
    }
  }
  return start >= 2025 ? "2025-media" : "pre-2025";
}

/** Normalize ESPN / schedule labels for URL lookup. */
export function normalizeBroadcastLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical network family for dedupe.
 * "NBC", "Peacock", and "NBC / Peacock" share one slot so the UI never
 * lists the same destination twice.
 */
export function broadcastNetworkKey(label: string): string {
  const key = normalizeBroadcastLabel(label);
  if (!key) return "";
  if (key.includes("league pass")) return "league-pass";
  if (key.includes("tap to watch") || key.includes("how to watch")) return "nba-guide";
  if (key.includes("prime") || key === "amazon" || key.includes("amazon prime")) {
    return "prime";
  }
  if (key.includes("peacock") || key === "nbc" || key.startsWith("nbc ")) {
    return "nbc-peacock";
  }
  if (key.includes("espn") || key === "abc" || key.startsWith("abc ")) {
    return "espn-abc";
  }
  if (key.includes("nba tv") || key === "nbatv") return "nba-tv";
  if (key === "tnt" || key.startsWith("tnt ")) return "tnt";
  if (key === "tbs" || key.startsWith("tbs ")) return "tbs";
  if (key === "max" || key.includes("max sports")) return "max";
  if (key.includes("sportsnet")) return "sportsnet";
  if (key.includes("tsn")) return "tsn";
  if (key.includes("sky")) return "sky";
  if (key.includes("kayo")) return "kayo";
  return key;
}

/** Short site name for watch badges (ESPN, NBC, Prime, …). */
export function broadcastLogoMark(label: string): string {
  const family = broadcastNetworkKey(label);
  switch (family) {
    case "espn-abc": {
      const key = normalizeBroadcastLabel(label);
      if (key === "abc" || key.startsWith("abc ")) return "ABC";
      if (key.includes("espn2")) return "ESPN2";
      if (key.includes("espn plus") || key.includes("espn+")) return "ESPN+";
      return "ESPN";
    }
    case "nbc-peacock": {
      const key = normalizeBroadcastLabel(label);
      if (key.includes("peacock")) return "Peacock";
      return "NBC";
    }
    case "prime":
      return "Prime";
    case "league-pass":
      return "League Pass";
    case "nba-tv":
      return "NBA TV";
    case "nba-guide":
      return "NBA";
    case "tnt":
      return "TNT";
    case "tbs":
      return "TBS";
    case "max":
      return "Max";
    case "sportsnet":
      return "Sportsnet";
    case "tsn":
      return "TSN";
    case "sky":
      return "Sky";
    case "kayo":
      return "Kayo";
    default: {
      const raw = label.trim();
      if (raw.length <= 12) return raw;
      return raw.slice(0, 11);
    }
  }
}

/** Brand fill + text for a watch badge. */
export function broadcastBadgeColors(label: string): {
  background: string;
  color: string;
} {
  const family = broadcastNetworkKey(label);
  const key = normalizeBroadcastLabel(label);
  switch (family) {
    case "espn-abc":
      if (key === "abc" || key.startsWith("abc ")) {
        return { background: "#000000", color: "#FFFFFF" };
      }
      return { background: "#FF0000", color: "#FFFFFF" };
    case "nbc-peacock":
      if (key.includes("peacock")) {
        return { background: "#000000", color: "#FDB927" };
      }
      return { background: "#141414", color: "#FFFFFF" };
    case "prime":
      return { background: "#00A8E1", color: "#FFFFFF" };
    case "league-pass":
    case "nba-tv":
    case "nba-guide":
      return { background: "#C8102E", color: "#FFFFFF" };
    case "tnt":
      return { background: "#FF6600", color: "#FFFFFF" };
    case "tbs":
      return { background: "#000000", color: "#FFFFFF" };
    case "max":
      return { background: "#002BE7", color: "#FFFFFF" };
    case "sportsnet":
      return { background: "#C8102E", color: "#FFFFFF" };
    case "tsn":
      return { background: "#ED1C24", color: "#FFFFFF" };
    case "sky":
      return { background: "#0072C6", color: "#FFFFFF" };
    case "kayo":
      return { background: "#E4002B", color: "#FFFFFF" };
    default:
      return { background: "#1A1A1A", color: "#FFFFFF" };
  }
}

const URLS_2025: Record<string, string> = {
  espn: "https://www.espn.com/watch/",
  "espn plus": "https://www.espn.com/watch/",
  "espn app": "https://www.espn.com/watch/",
  abc: "https://abc.com/",
  nbc: "https://www.nbc.com/sports/nba",
  peacock: "https://www.peacocktv.com/sports/nba",
  "prime video": "https://www.primevideo.com/",
  amazon: "https://www.primevideo.com/",
  "amazon prime": "https://www.primevideo.com/",
  "amazon prime video": "https://www.primevideo.com/",
  "nba tv": NBA_WATCH_HUB,
  "nba league pass": NBA_LEAGUE_PASS,
  "league pass": NBA_LEAGUE_PASS,
};

const URLS_PRE_2025: Record<string, string> = {
  ...URLS_2025,
  tnt: "https://www.tntdrama.com/sports/nba",
  tbs: "https://www.tbs.com/",
  max: "https://www.max.com/",
  "max sports": "https://www.max.com/",
};

/**
 * Official destination for a broadcast label in the given era.
 * Returns null when we only know the name (typical local RSNs).
 */
export function officialWatchUrlForLabel(
  label: string,
  season?: string | null
): string | null {
  const key = normalizeBroadcastLabel(label);
  if (!key) return null;
  const era = streamingEraForSeason(season);
  const table = era === "2025-media" ? URLS_2025 : URLS_PRE_2025;
  if (table[key]) return table[key]!;
  // Soft matches: "ESPN2", "ABC / ESPN", "NBC Sports"
  for (const [alias, url] of Object.entries(table)) {
    if (key === alias || key.startsWith(`${alias} `) || key.includes(` ${alias}`)) {
      return url;
    }
  }
  if (key.includes("prime") && key.includes("video")) return table["prime video"]!;
  if (key.includes("peacock")) return table.peacock!;
  if (key.includes("league pass")) return NBA_LEAGUE_PASS;
  return null;
}

const REGIONS: StreamingRegion[] = [
  {
    countries: ["US"],
    label: "United States",
    leaguePassAvailable: true,
    leaguePassNote:
      "Out-of-market games on League Pass. Local RSNs and national games (ABC/ESPN, NBC/Peacock, Prime Video) have live blackouts.",
    partners: [
      {
        id: "us-espn-abc",
        name: "ABC / ESPN",
        watchUrl: "https://www.espn.com/watch/",
        role: "national",
        note: "National package · also on ESPN’s streaming app",
      },
      {
        id: "us-nbc-peacock",
        name: "NBC / Peacock",
        watchUrl: "https://www.peacocktv.com/sports/nba",
        role: "national",
        note: "National package · Peacock streams NBC games too",
      },
      {
        id: "us-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "national",
        note: "National package · NBA Cup knockouts and Play-In",
      },
      {
        id: "us-guide",
        name: "NBA Tap to Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
        note: "Official router to the right national or local stream",
      },
    ],
  },
  {
    countries: ["CA"],
    label: "Canada",
    leaguePassAvailable: true,
    leaguePassNote:
      "League Pass covers out-of-market games. Sportsnet and TSN carry Raptors and selected national windows; local blackouts apply.",
    partners: [
      {
        id: "ca-sportsnet",
        name: "Sportsnet",
        watchUrl: "https://www.sportsnet.ca/",
        role: "regional",
        note: "Raptors and national windows · Sportsnet+",
      },
      {
        id: "ca-tsn",
        name: "TSN",
        watchUrl: "https://www.tsn.ca/",
        role: "regional",
        note: "Raptors and national windows · TSN+",
      },
      {
        id: "ca-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["GB", "IE"],
    label: "United Kingdom & Ireland",
    leaguePassAvailable: true,
    leaguePassNote:
      "Sky Sports and Prime Video share live rights. League Pass fills in the rest of the slate.",
    partners: [
      {
        id: "uk-sky",
        name: "Sky Sports",
        watchUrl: "https://www.skysports.com/nba",
        role: "regional",
        note: "Large live package · also via NOW",
      },
      {
        id: "uk-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
        note: "Expanded UK/Ireland NBA package",
      },
      {
        id: "uk-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["AU", "NZ"],
    label: "Australia & New Zealand",
    leaguePassAvailable: true,
    leaguePassNote:
      "ESPN (Foxtel / Kayo / Disney+) carries a large slate. Prime Video and League Pass add more games.",
    partners: [
      {
        id: "au-espn",
        name: "ESPN (Kayo / Foxtel / Disney+)",
        watchUrl: "https://kayosports.com.au/",
        role: "regional",
        note: "Primary Australian live package",
      },
      {
        id: "au-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
      },
      {
        id: "au-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["DE", "AT", "CH", "LI"],
    label: "Germany, Austria & Switzerland",
    leaguePassAvailable: true,
    leaguePassNote: "Sky carries a large local package; Prime Video and League Pass cover more.",
    partners: [
      {
        id: "de-sky",
        name: "Sky",
        watchUrl: "https://www.sky.de/",
        role: "regional",
      },
      {
        id: "de-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
      },
      {
        id: "de-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["FR"],
    label: "France",
    leaguePassAvailable: true,
    leaguePassNote: "beIN Sports and Prime Video share live rights with League Pass.",
    partners: [
      {
        id: "fr-bein",
        name: "beIN Sports",
        watchUrl: "https://www.beinsports.com/",
        role: "regional",
      },
      {
        id: "fr-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
      },
      {
        id: "fr-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["ES"],
    label: "Spain",
    leaguePassAvailable: true,
    leaguePassNote: "Movistar and Prime Video carry live windows; League Pass covers more.",
    partners: [
      {
        id: "es-movistar",
        name: "Movistar Plus+",
        watchUrl: "https://www.movistarplus.es/",
        role: "regional",
      },
      {
        id: "es-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
      },
      {
        id: "es-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["IT", "SM"],
    label: "Italy",
    leaguePassAvailable: true,
    leaguePassNote: "Sky and Prime Video share Italian windows with League Pass.",
    partners: [
      {
        id: "it-sky",
        name: "Sky Sport",
        watchUrl: "https://sport.sky.it/",
        role: "regional",
      },
      {
        id: "it-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
      },
      {
        id: "it-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["BR"],
    label: "Brazil",
    leaguePassAvailable: true,
    leaguePassNote: "ESPN Brasil and Prime Video carry live packages; League Pass adds out-of-market games.",
    partners: [
      {
        id: "br-espn",
        name: "ESPN",
        watchUrl: "https://www.espn.com.br/",
        role: "regional",
      },
      {
        id: "br-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
      },
      {
        id: "br-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["MX"],
    label: "Mexico",
    leaguePassAvailable: true,
    leaguePassNote: "ESPN and Prime Video carry Mexican windows; League Pass covers more.",
    partners: [
      {
        id: "mx-espn",
        name: "ESPN",
        watchUrl: "https://www.espn.com.mx/",
        role: "regional",
      },
      {
        id: "mx-prime",
        name: "Prime Video",
        watchUrl: "https://www.primevideo.com/",
        role: "regional",
      },
      {
        id: "mx-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["JP"],
    label: "Japan",
    leaguePassAvailable: true,
    leaguePassNote: "League Pass is the main full-slate option; check NBA Watch for local windows.",
    partners: [
      {
        id: "jp-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    countries: ["IN"],
    label: "India",
    leaguePassAvailable: true,
    leaguePassNote: "League Pass is widely used; check NBA Watch for any local linear windows.",
    partners: [
      {
        id: "in-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
  {
    // Latin America (ex-BR/MX handled above) + Caribbean / Central America ESPN package
    countries: [
      "AR",
      "BO",
      "CL",
      "CO",
      "CR",
      "DO",
      "EC",
      "SV",
      "GT",
      "HN",
      "NI",
      "PA",
      "PY",
      "PE",
      "UY",
      "VE",
    ],
    label: "Latin America",
    leaguePassAvailable: true,
    leaguePassNote: "ESPN carries the main Latin American package; League Pass and Prime add more in select markets.",
    partners: [
      {
        id: "latam-espn",
        name: "ESPN",
        watchUrl: "https://www.espn.com/",
        role: "regional",
      },
      {
        id: "latam-guide",
        name: "NBA Watch",
        watchUrl: NBA_WATCH_HUB,
        role: "guide",
      },
    ],
  },
];

const DEFAULT_REGION: StreamingRegion = {
  countries: [],
  label: "International",
  leaguePassAvailable: true,
  leaguePassNote:
    "NBA League Pass is available in most countries. Some nations use a local broadcaster instead. Check the NBA’s global availability list.",
  partners: [
    {
      id: "row-guide",
      name: "NBA Watch",
      watchUrl: NBA_WATCH_HUB,
      role: "guide",
      note: "Official streams and League Pass",
    },
    {
      id: "row-global",
      name: "League Pass availability",
      watchUrl: NBA_LEAGUE_PASS_GLOBAL,
      role: "guide",
      note: "Country list from NBA Help Center",
    },
  ],
};

export function normalizeCountryCode(raw?: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (code === "XX" || code === "T1" || code === "A1" || code === "A2") return null;
  return code;
}

/** Prefer edge geo headers (Cloudflare / Vercel). */
export function countryFromRequestHeaders(headers: {
  get(name: string): string | null;
}): string | null {
  return (
    normalizeCountryCode(headers.get("cf-ipcountry")) ??
    normalizeCountryCode(headers.get("x-vercel-ip-country")) ??
    normalizeCountryCode(headers.get("x-country-code")) ??
    normalizeCountryCode(headers.get("cloudfront-viewer-country"))
  );
}

export function streamingRegionForCountry(country?: string | null): StreamingRegion {
  const code = normalizeCountryCode(country);
  if (!code) return DEFAULT_REGION;
  if (LEAGUE_PASS_BLOCKED.has(code)) {
    return {
      countries: [code],
      label: code === "CN" ? "China" : "Restricted region",
      leaguePassAvailable: false,
      leaguePassNote:
        code === "CN"
          ? "NBA League Pass is not sold here. Use the local licensed broadcaster (historically Tencent) for live games."
          : "NBA League Pass is not available in this country per the NBA Help Center.",
      partners: [
        {
          id: "blocked-guide",
          name: "NBA Watch",
          watchUrl: NBA_WATCH_HUB,
          role: "guide",
        },
        {
          id: "blocked-global",
          name: "League Pass availability",
          watchUrl: NBA_LEAGUE_PASS_GLOBAL,
          role: "guide",
        },
      ],
    };
  }
  return REGIONS.find((region) => region.countries.includes(code)) ?? DEFAULT_REGION;
}

export function howToWatchUrlForSeason(season?: string | null): string {
  return streamingEraForSeason(season) === "2025-media"
    ? NBA_HOW_TO_WATCH_2025
    : NBA_WATCH_HUB;
}

/** Common country picker options (ISO code → label). */
export const STREAMING_COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "DE", label: "Germany" },
  { code: "AT", label: "Austria" },
  { code: "CH", label: "Switzerland" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "JP", label: "Japan" },
  { code: "IN", label: "India" },
  { code: "AR", label: "Argentina" },
  { code: "CL", label: "Chile" },
  { code: "CO", label: "Colombia" },
  { code: "OTHER", label: "Other / rest of world" },
];
