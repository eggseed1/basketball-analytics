/**
 * Season-wide league views for the homepage. Pure, so tests can feed fixtures.
 * Inputs are bundled ESPN standings, Basketball Reference advanced stats,
 * NBA.com play types and NBA.com league shot zones; nothing here estimates a
 * missing value.
 */

/* ---------- Team map ---------- */

export type StandingsRowLite = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  wins: number;
  losses: number;
  ppg: number;
  oppPpg: number;
};

export type TeamMapPoint = {
  teamId: string;
  abbr: string;
  name: string;
  wins: number;
  losses: number;
  ppg: number;
  oppPpg: number;
};

export type TeamMap = { season: string; teams: TeamMapPoint[]; leaguePpg: number };

/** A team needs this many games before its scoring rates go on the map. */
export const TEAM_MAP_MIN_GAMES = 10;

/**
 * Newest season where every team has played enough games to place. Early in a
 * season this falls back to last year instead of plotting two-game samples.
 */
export function pickTeamMap(
  seasons: { season: string; rows: StandingsRowLite[] }[]
): TeamMap | null {
  const ordered = [...seasons].sort((a, b) => b.season.localeCompare(a.season));
  for (const { season, rows } of ordered) {
    if (rows.length < 30) continue;
    const ready = rows.every(
      (r) => r.wins + r.losses >= TEAM_MAP_MIN_GAMES && r.ppg > 0 && r.oppPpg > 0
    );
    if (!ready) continue;
    const teams = rows.map((r) => ({
      teamId: r.teamId,
      abbr: r.abbreviation,
      name: r.displayName,
      wins: r.wins,
      losses: r.losses,
      ppg: r.ppg,
      oppPpg: r.oppPpg,
    }));
    const leaguePpg = teams.reduce((s, t) => s + t.ppg, 0) / teams.length;
    return { season, teams, leaguePpg };
  }
  return null;
}

/* ---------- Usage vs efficiency ---------- */

export type AdvancedRowLite = {
  n: string;
  t: string;
  e?: string;
  mp: number;
  ts: number;
  usg: number;
  gp?: number;
  bpm?: number;
  astPct?: number;
  tovPct?: number;
  tm?: string[];
};

export type UsagePoint = {
  name: string;
  team: string;
  /** Stint teams on combined (2TM) rows, in order played. */
  stints: string[] | null;
  playerId: string | null;
  usg: number;
  ts: number;
  minutes: number;
  games: number | null;
  bpm: number | null;
  astPct: number | null;
  tovPct: number | null;
  labeled: boolean;
};

function finiteOrNull(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const USAGE_MIN_MINUTES = 1500;

/**
 * Qualified players by usage and true shooting. Labels go to the four heaviest
 * workloads and the two most efficient of the high-usage group.
 */
export function buildUsageEfficiency(
  rows: AdvancedRowLite[],
  minMinutes = USAGE_MIN_MINUTES
): UsagePoint[] {
  const seen = new Set<string>();
  // Most minutes first, so a traded player keeps his combined row.
  const qualified = [...rows].sort((a, b) => b.mp - a.mp).filter((r) => {
    if (r.mp < minMinutes || !(r.ts > 0) || !(r.usg > 0)) return false;
    const key = r.e ?? r.n;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const byUsage = [...qualified].sort((a, b) => b.usg - a.usg);
  const labels = new Set(byUsage.slice(0, 4).map((r) => r.e ?? r.n));
  const efficient = qualified
    .filter((r) => r.usg >= 24 && !labels.has(r.e ?? r.n))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 2);
  for (const r of efficient) labels.add(r.e ?? r.n);
  return qualified.map((r) => ({
    name: r.n,
    team: r.t,
    stints: r.tm?.length ? r.tm : null,
    playerId: r.e ?? null,
    usg: r.usg,
    ts: r.ts,
    minutes: r.mp,
    games: finiteOrNull(r.gp),
    bpm: finiteOrNull(r.bpm),
    astPct: finiteOrNull(r.astPct),
    tovPct: finiteOrNull(r.tovPct),
    labeled: labels.has(r.e ?? r.n),
  }));
}

/* ---------- Play types ---------- */

export type PlayTypeMixRow = { key: string; share: number; ppp: number; poss: number };

/**
 * League totals per play type from player rows shaped
 * [id, totalPoss, poss0, pts0, poss1, pts1, ...]. "Misc" is left out.
 */
export function buildPlayTypeMix(
  rows: Array<Array<string | number>>,
  playTypes: string[]
): PlayTypeMixRow[] {
  const totals = playTypes.map((key, i) => {
    let poss = 0;
    let pts = 0;
    for (const r of rows) {
      poss += Number(r[2 + i * 2]) || 0;
      pts += Number(r[3 + i * 2]) || 0;
    }
    return { key, poss, pts };
  });
  const kept = totals.filter((t) => t.key !== "Misc" && t.poss > 0);
  const all = kept.reduce((s, t) => s + t.poss, 0);
  if (!all) return [];
  return kept
    .map((t) => ({ key: t.key, share: t.poss / all, ppp: t.pts / t.poss, poss: t.poss }))
    .sort((a, b) => b.share - a.share);
}

/* ---------- Shot zones ---------- */

/** [made, attempted] by NBA shot-zone name. */
export type ShotZoneTotals = Record<string, [number, number]>;

export type ShotZoneGroup = "rim" | "paint" | "mid" | "corner3" | "above3";

export const SHOT_ZONE_GROUPS: { id: ShotZoneGroup; label: string; zones: string[] }[] = [
  { id: "rim", label: "At the rim", zones: ["Restricted Area"] },
  { id: "paint", label: "Paint", zones: ["In The Paint (Non-RA)"] },
  { id: "mid", label: "Mid-range", zones: ["Mid-Range"] },
  { id: "corner3", label: "Corner 3", zones: ["Left Corner 3", "Right Corner 3"] },
  { id: "above3", label: "Above-break 3", zones: ["Above the Break 3"] },
];

export type ShotProfileZone = {
  id: ShotZoneGroup;
  share: number;
  fgPct: number;
  /** Change in share from the prior season, in percentage points. */
  shareChange: number | null;
};

function groupTotals(zones: ShotZoneTotals) {
  const totals = SHOT_ZONE_GROUPS.map((g) => {
    let made = 0;
    let att = 0;
    for (const z of g.zones) {
      const hit = zones[z];
      if (!hit) continue;
      made += hit[0];
      att += hit[1];
    }
    return { id: g.id, made, att };
  });
  const attempts = totals.reduce((s, t) => s + t.att, 0);
  if (!attempts || totals.some((t) => t.att === 0)) return null;
  return { totals, attempts };
}

/** Backcourt heaves are left out; they are noise next to the other zones. */
export function buildShotProfile(
  current: ShotZoneTotals,
  prior: ShotZoneTotals | null
): ShotProfileZone[] {
  const now = groupTotals(current);
  if (!now) return [];
  const before = prior ? groupTotals(prior) : null;
  return now.totals.map((t) => {
    const share = t.att / now.attempts;
    const was = before?.totals.find((b) => b.id === t.id);
    return {
      id: t.id,
      share,
      fgPct: t.made / t.att,
      shareChange: was && before ? (share - was.att / before.attempts) * 100 : null,
    };
  });
}

/** "2025-26" → "2024-25". */
export function priorSeason(season: string): string | null {
  const start = Number(season.slice(0, 4));
  if (!Number.isFinite(start)) return null;
  const prev = start - 1;
  return `${prev}-${String(start).slice(2)}`;
}
