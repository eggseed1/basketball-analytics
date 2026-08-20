import { CACHE_TTL_MS } from "./cache-policy";
import { isBrefCombinedTeam } from "./bref-scraper";

export const LUKA_BREF_ID = "doncilu01";
export const LUKA_ESPN_ID = "3945274";
export const LUKA_NBA_ID = "1629029";
export const LUKA_DISPLAY_NAME = "Luka Dončić";

const BREF_UA =
  "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)";

type CacheEntry<T> = {
  freshUntil: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<BrefPlayerPage>>();

export type BrefSeasonType = "regular" | "playoffs";
export type BrefRateMode = "perGame" | "totals" | "per36" | "per100";

export type BrefPlayerBio = {
  displayName: string;
  pronunciation: string | null;
  positionLine: string | null;
  shoots: string | null;
  heightLabel: string | null;
  heightInches: number | null;
  weightLbs: number | null;
  currentTeamName: string | null;
  currentTeamAbbr: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  country: string | null;
  draftLine: string | null;
  debutLine: string | null;
  experienceLine: string | null;
  jersey: string | null;
};

export type BrefCountingRow = {
  season: string;
  teamAbbr: string;
  combined: boolean;
  position: string | null;
  age: number | null;
  gamesPlayed: number | null;
  gamesStarted: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fieldGoalPct: number | null;
  threePointPct: number | null;
  freeThrowPct: number | null;
  effectiveFieldGoalPct: number | null;
};

export type BrefPlayerAdvancedRow = {
  season: string;
  teamAbbr: string;
  combined: boolean;
  minutes: number | null;
  gamesPlayed: number | null;
  per: number | null;
  trueShootingPct: number | null;
  usagePct: number | null;
  turnoverPct: number | null;
  assistPct: number | null;
  reboundPct: number | null;
  bpm: number | null;
  vorp: number | null;
  winShares: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
};

export type BrefStatBundle = {
  perGame: BrefCountingRow[];
  totals: BrefCountingRow[];
  per36: BrefCountingRow[];
  per100: BrefCountingRow[];
  advanced: BrefPlayerAdvancedRow[];
};

export type BrefPlayerPage = {
  brefId: string;
  scrapedAt: string;
  bio: BrefPlayerBio;
  regular: BrefStatBundle;
  playoffs: BrefStatBundle;
};

const SEASON_RE = /^(\d{4})-(\d{2})$/;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#9642;/g, "·")
    .replace(/&bull;/g, "·")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBioText(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = decodeEntities(value)
    .replace(/^[·•]+\s*/, "")
    .replace(/[·•]+\s*$/, "")
    .trim();
  return t || null;
}

function optionalNum(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = raw.replace(/,/g, "").trim();
  // BRef cells may use ASCII hyphen or Unicode dashes; treat all as empty.
  if (!t || t === "-" || t === "\u2013" || t === "\u2014") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function optionalRate(raw: string | undefined): number | null {
  const n = optionalNum(raw);
  if (n == null) return null;
  return n > 1 ? n / 100 : n;
}

function normalizeTeam(raw: string): { teamAbbr: string; combined: boolean } {
  const teamAbbr = raw.toUpperCase().trim();
  if (isBrefCombinedTeam(teamAbbr)) {
    return { teamAbbr: "TOT", combined: true };
  }
  return { teamAbbr, combined: false };
}

function extractTable(html: string, tableId: string): string | null {
  const cleaned = html.replace(/<!--|-->/g, "");
  const re = new RegExp(
    `<table[^>]*id="${tableId}"[\\s\\S]*?<\\/table>`,
    "i"
  );
  return cleaned.match(re)?.[0] ?? null;
}

function cellMap(rowHtml: string): Map<string, string> {
  const cells = new Map<string, string>();
  const cellRegex =
    /<(td|th)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of rowHtml.matchAll(cellRegex)) {
    cells.set(match[2], decodeEntities(match[3] ?? ""));
  }
  return cells;
}

function parseCountingTable(
  html: string,
  tableId: string,
  keys: {
    pts: string;
    trb: string;
    ast: string;
    stl: string;
    blk: string;
    tov: string;
    mp: string;
  }
): BrefCountingRow[] {
  const table = extractTable(html, tableId);
  if (!table) return [];
  const rows: BrefCountingRow[] = [];
  for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = cellMap(rowMatch[1] ?? "");
    const season = cells.get("year_id") ?? "";
    if (!SEASON_RE.test(season)) continue;
    const teamRaw =
      cells.get("team_name_abbr") ?? cells.get("team_id") ?? "";
    if (!teamRaw) continue;
    const { teamAbbr, combined } = normalizeTeam(teamRaw);
    rows.push({
      season,
      teamAbbr,
      combined,
      position: cells.get("pos") || null,
      age: optionalNum(cells.get("age")),
      gamesPlayed: optionalNum(cells.get("games") ?? cells.get("g")),
      gamesStarted: optionalNum(cells.get("games_started") ?? cells.get("gs")),
      minutes: optionalNum(cells.get(keys.mp)),
      points: optionalNum(cells.get(keys.pts)),
      rebounds: optionalNum(cells.get(keys.trb)),
      assists: optionalNum(cells.get(keys.ast)),
      steals: optionalNum(cells.get(keys.stl)),
      blocks: optionalNum(cells.get(keys.blk)),
      turnovers: optionalNum(cells.get(keys.tov)),
      fieldGoalPct: optionalRate(cells.get("fg_pct")),
      threePointPct: optionalRate(cells.get("fg3_pct")),
      freeThrowPct: optionalRate(cells.get("ft_pct")),
      effectiveFieldGoalPct: optionalRate(cells.get("efg_pct")),
    });
  }
  return rows;
}

function parseAdvancedTable(
  html: string,
  tableId: string
): BrefPlayerAdvancedRow[] {
  const table = extractTable(html, tableId);
  if (!table) return [];
  const rows: BrefPlayerAdvancedRow[] = [];
  for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = cellMap(rowMatch[1] ?? "");
    const season = cells.get("year_id") ?? "";
    if (!SEASON_RE.test(season)) continue;
    const teamRaw =
      cells.get("team_name_abbr") ?? cells.get("team_id") ?? "";
    if (!teamRaw) continue;
    const { teamAbbr, combined } = normalizeTeam(teamRaw);
    rows.push({
      season,
      teamAbbr,
      combined,
      minutes: optionalNum(cells.get("mp")),
      gamesPlayed: optionalNum(cells.get("games") ?? cells.get("g")),
      per: optionalNum(cells.get("per")),
      trueShootingPct: optionalRate(cells.get("ts_pct")),
      usagePct: optionalRate(cells.get("usg_pct")),
      turnoverPct: optionalRate(cells.get("tov_pct")),
      assistPct: optionalRate(cells.get("ast_pct")),
      reboundPct: optionalRate(cells.get("trb_pct")),
      bpm: optionalNum(cells.get("bpm")),
      vorp: optionalNum(cells.get("vorp")),
      winShares: optionalNum(cells.get("ws")),
      offensiveRating: optionalNum(cells.get("off_rtg")),
      defensiveRating: optionalNum(cells.get("def_rtg")),
    });
  }
  return rows;
}

function parseBundle(
  html: string,
  ids: {
    perGame: string;
    totals: string;
    per36: string;
    per100: string;
    advanced: string;
  }
): BrefStatBundle {
  return {
    perGame: parseCountingTable(html, ids.perGame, {
      pts: "pts_per_g",
      trb: "trb_per_g",
      ast: "ast_per_g",
      stl: "stl_per_g",
      blk: "blk_per_g",
      tov: "tov_per_g",
      mp: "mp_per_g",
    }),
    totals: parseCountingTable(html, ids.totals, {
      pts: "pts",
      trb: "trb",
      ast: "ast",
      stl: "stl",
      blk: "blk",
      tov: "tov",
      mp: "mp",
    }),
    per36: parseCountingTable(html, ids.per36, {
      pts: "pts_per_minute_36",
      trb: "trb_per_minute_36",
      ast: "ast_per_minute_36",
      stl: "stl_per_minute_36",
      blk: "blk_per_minute_36",
      tov: "tov_per_minute_36",
      mp: "mp",
    }),
    per100: parseCountingTable(html, ids.per100, {
      pts: "pts_per_poss",
      trb: "trb_per_poss",
      ast: "ast_per_poss",
      stl: "stl_per_poss",
      blk: "blk_per_poss",
      tov: "tov_per_poss",
      mp: "mp",
    }),
    advanced: parseAdvancedTable(html, ids.advanced),
  };
}

function parseBio(html: string): BrefPlayerBio {
  const meta = html.match(/<div id="meta"[\s\S]*?<!-- div#info/)?.[0] ?? html;
  const displayName =
    cleanBioText(
      meta.match(/<h1[^>]*>\s*<span>([^<]+)<\/span>/i)?.[1]
    ) ?? LUKA_DISPLAY_NAME;
  const pronunciation =
    cleanBioText(
      meta.match(/Pronunciation<\/strong>\s*:\s*([^<]+)/i)?.[1]
    );
  const positionLine = cleanBioText(
    meta.match(/Position:\s*<\/strong>\s*([^<]+)/i)?.[1]
  );
  const shoots = cleanBioText(
    meta.match(/Shoots:\s*<\/strong>\s*([^<]+)/i)?.[1]
  );
  const size = meta.match(/>(\d+)-(\d+)<\/span>.*?(\d+)\s*lb/i);
  const heightInches = size
    ? Number(size[1]) * 12 + Number(size[2])
    : null;
  const heightLabel = size ? `${size[1]}'${size[2]}"` : null;
  const weightLbs = size ? Number(size[3]) : null;
  const currentTeamName =
    meta
      .match(/<strong>\s*Team\s*<\/strong>\s*:\s*<a[^>]*>([^<]+)<\/a>/i)?.[1]
      ?.trim() ?? null;
  const currentTeamAbbr =
    meta
      .match(/<strong>\s*Team\s*<\/strong>\s*:\s*<a href='\/teams\/([A-Z]{2,3})\//i)?.[1]
      ?.toUpperCase() ??
    meta
      .match(/<strong>\s*Team\s*<\/strong>\s*:\s*<a href="\/teams\/([A-Z]{2,3})\//i)?.[1]
      ?.toUpperCase() ??
    null;
  const birthDate =
    meta.match(/data-birth="(\d{4}-\d{2}-\d{2})"/)?.[1] ?? null;
  const birthPlaceMatch = meta.match(
    /in(?:&nbsp;|\s)+([^<,]+),(?:&nbsp;|\s)*<a[^>]*>([^<]+)<\/a>/i
  );
  const birthPlace = birthPlaceMatch
    ? `${decodeEntities(birthPlaceMatch[1] ?? "")}, ${decodeEntities(birthPlaceMatch[2] ?? "")}`
    : null;
  const country = birthPlaceMatch
    ? decodeEntities(birthPlaceMatch[2] ?? "")
    : null;
  const draftLine = cleanBioText(
    meta
      .match(/Draft:\s*<\/strong>\s*([\s\S]*?NBA Draft)/i)?.[1]
      ?.replace(/<[^>]+>/g, " ")
  );
  const debutLine = cleanBioText(
    meta.match(/NBA Debut:\s*<\/strong>\s*([\s\S]*?)<\/p>/i)?.[1]
  );
  const experienceLine = cleanBioText(
    meta.match(/Experience:\s*<\/strong>\s*([^<]+)/i)?.[1]
  );
  const jersey =
    html.match(
      /class="jersey"[\s\S]*?<text[^>]*>\s*(\d{1,2})\s*<\/text>/i
    )?.[1] ?? null;

  return {
    displayName,
    pronunciation,
    positionLine,
    shoots,
    heightLabel,
    heightInches,
    weightLbs,
    currentTeamName,
    currentTeamAbbr,
    birthDate,
    birthPlace,
    country,
    draftLine,
    debutLine,
    experienceLine,
    jersey,
  };
}

export function parseBrefPlayerHtml(
  html: string,
  brefId: string,
  scrapedAt = new Date().toISOString()
): BrefPlayerPage {
  return {
    brefId,
    scrapedAt,
    bio: parseBio(html),
    regular: parseBundle(html, {
      perGame: "per_game_stats",
      totals: "totals_stats",
      per36: "per_minute_stats",
      per100: "per_poss",
      advanced: "advanced",
    }),
    playoffs: parseBundle(html, {
      perGame: "per_game_stats_post",
      totals: "totals_stats_post",
      per36: "per_minute_stats_post",
      per100: "per_poss_post",
      advanced: "advanced_post",
    }),
  };
}

export async function fetchBrefPlayerPage(
  brefId: string
): Promise<BrefPlayerPage> {
  const url = `https://www.basketball-reference.com/players/${brefId[0]}/${brefId}.html`;
  const now = Date.now();
  const cached = memoryCache.get(url);
  if (cached && cached.freshUntil > now) return cached.value;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": BREF_UA,
        },
      });
      if (!response.ok) {
        throw new Error(`BRef player page failed (${response.status}): ${url}`);
      }
      const html = await response.text();
      const page = parseBrefPlayerHtml(html, brefId);
      memoryCache.set(url, {
        value: page,
        freshUntil: now + CACHE_TTL_MS.brefCurrent,
      });
      return page;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`BRef player page failed: ${url}`);
}

export function countingForRate(
  bundle: BrefStatBundle,
  rate: BrefRateMode
): BrefCountingRow[] {
  if (rate === "totals") return bundle.totals;
  if (rate === "per36") return bundle.per36;
  if (rate === "per100") return bundle.per100;
  return bundle.perGame;
}
