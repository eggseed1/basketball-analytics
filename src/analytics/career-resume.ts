/**
 * Career Resume - deterministic Peak / Prime / Longevity / Trajectory.
 *
 * IMPORTANT DATA CONSTRAINT
 * -------------------------
 * Live DARKO overlays are joined by player name only onto career rows, so
 * `darkoDpm` is NOT season-true historically. LEBRON is season-keyed but sparse.
 * This analyzer therefore ranks careers with a transparent counting-stat
 * composite (Career Production Index) computed only from season-true fields
 * on PlayerSeason. See docs/career-resume.md.
 */

import { computePlayerEvolution } from "@/analytics/evolution";
import { buildStatContext } from "@/analytics/context";
import type { AnalyticalFinding, StatContext } from "@/analytics/types";
import type { PlayerSeason } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";

/** Seasons must clear this GP floor to count toward Peak/Prime/Longevity. */
export const CAREER_RESUME_MIN_GAMES = 20;
/** Soft floor for shortened / lockout-style seasons. */
export const CAREER_RESUME_SHORT_SEASON_MIN_GAMES = 15;
export const CAREER_RESUME_MIN_MPG = 15;
export const CAREER_RESUME_SHORT_SEASON_MIN_MPG = 18;

/** Season counts as "prime" if CPI ≥ this fraction of the player's peak CPI. */
export const CAREER_PRIME_OF_PEAK = 0.9;
/** Season counts toward longevity if CPI ≥ this fraction of peak CPI. */
export const CAREER_LONGEVITY_OF_PEAK = 0.7;

/** Need at least this many qualifying seasons for Prime / Longevity labels. */
export const CAREER_RESUME_MIN_SEASONS_FOR_FULL = 2;

export type CareerProductionBreakdown = {
  ppg: number;
  apg: number;
  rpg: number;
  spg: number;
  bpg: number;
  tov: number;
  ts: number | null;
  mpg: number;
};

export type CareerSeasonScore = {
  season: string;
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  minutes: number;
  /** Career Production Index (documented composite). */
  cpi: number;
  breakdown: CareerProductionBreakdown;
  /** Fraction of this player's peak CPI (1 = peak). */
  ofPeak: number;
  inPrimeBand: boolean;
  inLongevityBand: boolean;
  incomplete: boolean;
  seasonHref: string;
};

export type CareerPhase = {
  id: string;
  label: string;
  seasonFrom: string;
  seasonTo: string;
};

export type CareerTransitionSummary = {
  fromSeason: string;
  toSeason: string;
  label: string;
  deltaDisplay: string;
  href: string;
};

export type CareerResumeMethodology = {
  version: string;
  primaryMetric: string;
  primaryMetricId: "cpi";
  cpiFormula: string;
  peakDefinition: string;
  primeDefinition: string;
  longevityDefinition: string;
  qualifyingRule: string;
  populationNote: string;
  impactCaveat: string;
};

export type CareerResume = {
  playerId: string;
  playerName: string;
  qualifyingSeasons: CareerSeasonScore[];
  incompleteCurrent: CareerSeasonScore | null;
  peak: CareerSeasonScore | null;
  prime: {
    seasonCount: number;
    seasonFrom: string | null;
    seasonTo: string | null;
    contiguousCount: number;
    contiguousFrom: string | null;
    contiguousTo: string | null;
    seasons: CareerSeasonScore[];
  } | null;
  longevity: {
    seasonCount: number;
    seasons: CareerSeasonScore[];
  } | null;
  trajectory: {
    phases: CareerPhase[];
    summary: string;
  };
  transitions: CareerTransitionSummary[];
  finding: AnalyticalFinding | null;
  limitedReason: string | null;
  methodology: CareerResumeMethodology;
  peakContext: StatContext | null;
};

export const CAREER_RESUME_METHODOLOGY: CareerResumeMethodology = {
  version: "1.0",
  primaryMetric: "Career Production Index (CPI)",
  primaryMetricId: "cpi",
  cpiFormula:
    "CPI = PPG + 1.5×APG + 1.2×RPG + 2.0×SPG + 2.0×BPG − TOV (per game)",
  peakDefinition:
    "Qualifying season with the highest CPI for this player (career-self peak).",
  primeDefinition: `Qualifying seasons with CPI ≥ ${CAREER_PRIME_OF_PEAK * 100}% of the player's own peak CPI. Contiguous prime is the longest consecutive run of those seasons.`,
  longevityDefinition: `Qualifying seasons with CPI ≥ ${CAREER_LONGEVITY_OF_PEAK * 100}% of the player's own peak CPI.`,
  qualifyingRule: `Standard: ≥${CAREER_RESUME_MIN_GAMES} GP and ≥${CAREER_RESUME_MIN_MPG} MPG. Shortened-season accommodation: ≥${CAREER_RESUME_SHORT_SEASON_MIN_GAMES} GP and ≥${CAREER_RESUME_SHORT_SEASON_MIN_MPG} MPG. Multi-team seasons keep the row with the most games. Incomplete current seasons below the GP floor are shown but excluded from Peak/Prime/Longevity.`,
  populationNote:
    "Thresholds are relative to this player's own peak CPI (career_self), not a league-wide or filtered-leaderboard percentile. Do not compare these bands to leaderboard context chips.",
  impactCaveat:
    "Live DARKO is not used for career ranking because career rows currently receive a name-only overlay (not season-true). LEBRON is season-keyed but too sparse for a career-wide primary metric. CPI uses season-true counting stats from career tables; TS% is shown as context only.",
};

function perGame(row: PlayerSeason, key: keyof PlayerSeason): number {
  const raw = row[key];
  const total = typeof raw === "number" ? raw : 0;
  return total / Math.max(1, row.gamesPlayed);
}

/** Documented Career Production Index - season-true counting composite. */
export function careerProductionIndex(row: PlayerSeason): number {
  const ppg = perGame(row, "points");
  const apg = perGame(row, "assists");
  const rpg = perGame(row, "rebounds");
  const spg = perGame(row, "steals");
  const bpg = perGame(row, "blocks");
  const tov = perGame(row, "turnovers");
  return ppg + 1.5 * apg + 1.2 * rpg + 2.0 * spg + 2.0 * bpg - tov;
}

/**
 * Highest-CPI qualifying season for a career (Career Resume peak).
 * Pure helper for default season selection on historical players.
 */
export function peakCareerSeason(career: PlayerSeason[]): string | null {
  if (!career.length) return null;
  const deduped = dedupeCareerSeasons(career);
  let best: { season: string; cpi: number } | null = null;
  for (const row of deduped) {
    if (!isCareerQualifyingSeason(row)) continue;
    const cpi = careerProductionIndex(row);
    if (
      !best ||
      cpi > best.cpi ||
      (cpi === best.cpi && row.season.localeCompare(best.season) > 0)
    ) {
      best = { season: row.season, cpi };
    }
  }
  return best?.season ?? null;
}

export function isCareerQualifyingSeason(row: PlayerSeason): boolean {
  if (!row.gamesPlayed || row.gamesPlayed < 0) return false;
  const mpg = perGame(row, "minutes");
  if (
    row.gamesPlayed >= CAREER_RESUME_MIN_GAMES &&
    mpg >= CAREER_RESUME_MIN_MPG
  ) {
    return true;
  }
  return (
    row.gamesPlayed >= CAREER_RESUME_SHORT_SEASON_MIN_GAMES &&
    mpg >= CAREER_RESUME_SHORT_SEASON_MIN_MPG
  );
}

/** One row per season - prefer multi-team aggregate, else highest gamesPlayed. */
export function dedupeCareerSeasons(career: PlayerSeason[]): PlayerSeason[] {
  const bySeason = new Map<string, PlayerSeason[]>();
  for (const row of career) {
    const list = bySeason.get(row.season) ?? [];
    list.push(row);
    bySeason.set(row.season, list);
  }
  const out: PlayerSeason[] = [];
  for (const [, rows] of bySeason) {
    const aggregate = rows.find(
      (row) =>
        row.teamId === "TOT" ||
        ["TOT", "2TM", "3TM", "4TM"].includes(
          (row.teamAbbreviation ?? "").toUpperCase()
        )
    );
    if (aggregate) {
      out.push(aggregate);
      continue;
    }
    out.push(
      rows.reduce((best, row) =>
        row.gamesPlayed > best.gamesPlayed ? row : best
      )
    );
  }
  return out.sort((a, b) => a.season.localeCompare(b.season));
}

function breakdownOf(row: PlayerSeason): CareerProductionBreakdown {
  return {
    ppg: perGame(row, "points"),
    apg: perGame(row, "assists"),
    rpg: perGame(row, "rebounds"),
    spg: perGame(row, "steals"),
    bpg: perGame(row, "blocks"),
    tov: perGame(row, "turnovers"),
    ts:
      row.trueShootingPct != null && row.trueShootingPct > 0
        ? row.trueShootingPct
        : null,
    mpg: perGame(row, "minutes"),
  };
}

function toScore(
  row: PlayerSeason,
  playerId: string,
  peakCpi: number,
  incomplete: boolean
): CareerSeasonScore {
  const cpi = careerProductionIndex(row);
  const ofPeak = peakCpi > 0 ? cpi / peakCpi : 0;
  return {
    season: row.season,
    teamId: row.teamId,
    teamName: row.teamName,
    gamesPlayed: row.gamesPlayed,
    minutes: row.minutes,
    cpi,
    breakdown: breakdownOf(row),
    ofPeak,
    inPrimeBand: !incomplete && ofPeak >= CAREER_PRIME_OF_PEAK,
    inLongevityBand: !incomplete && ofPeak >= CAREER_LONGEVITY_OF_PEAK,
    incomplete,
    seasonHref: `/players/${playerId}?season=${encodeURIComponent(row.season)}`,
  };
}

/**
 * Longest contiguous run among prime seasons, broken when a qualifying
 * season between them is outside the prime band.
 */
function longestPrimeRun(
  allQualifyingChron: CareerSeasonScore[],
  primeSeasons: CareerSeasonScore[]
): { count: number; from: string | null; to: string | null } {
  if (!primeSeasons.length) return { count: 0, from: null, to: null };
  const primeSet = new Set(primeSeasons.map((s) => s.season));
  let best = { count: 0, from: null as string | null, to: null as string | null };
  let runFrom: string | null = null;
  let runTo: string | null = null;
  let runLen = 0;

  for (const s of allQualifyingChron) {
    if (primeSet.has(s.season)) {
      if (runLen === 0) runFrom = s.season;
      runTo = s.season;
      runLen += 1;
      if (runLen > best.count) {
        best = { count: runLen, from: runFrom, to: runTo };
      }
    } else {
      runFrom = null;
      runTo = null;
      runLen = 0;
    }
  }
  return best;
}

function buildTrajectory(
  qualifying: CareerSeasonScore[],
  peak: CareerSeasonScore
): { phases: CareerPhase[]; summary: string } {
  if (qualifying.length === 1) {
    return {
      phases: [
        {
          id: "single",
          label: "Single qualifying season",
          seasonFrom: peak.season,
          seasonTo: peak.season,
        },
      ],
      summary: `One qualifying season on record (${peak.season}).`,
    };
  }

  const peakIdx = qualifying.findIndex((s) => s.season === peak.season);
  const phases: CareerPhase[] = [];

  if (peakIdx > 0) {
    const first = qualifying[0]!;
    const beforePeak = qualifying[peakIdx - 1]!;
    const rose = first.cpi < peak.cpi * 0.85;
    phases.push({
      id: rose ? "rise" : "early",
      label: rose ? "Development → rise" : "Early career",
      seasonFrom: first.season,
      seasonTo: beforePeak.season,
    });
  }

  const primeRun = longestPrimeRun(
    qualifying,
    qualifying.filter((s) => s.inPrimeBand)
  );
  if (primeRun.from && primeRun.to) {
    phases.push({
      id: "prime",
      label: "Prime",
      seasonFrom: primeRun.from,
      seasonTo: primeRun.to,
    });
  } else {
    phases.push({
      id: "peak",
      label: "Peak season",
      seasonFrom: peak.season,
      seasonTo: peak.season,
    });
  }

  if (peakIdx >= 0 && peakIdx < qualifying.length - 1) {
    const last = qualifying[qualifying.length - 1]!;
    const after = qualifying[peakIdx + 1]!;
    if (last.ofPeak < CAREER_PRIME_OF_PEAK) {
      phases.push({
        id: "decline",
        label:
          last.ofPeak >= CAREER_LONGEVITY_OF_PEAK ? "Late career" : "Decline",
        seasonFrom: after.season,
        seasonTo: last.season,
      });
    } else {
      phases.push({
        id: "sustained",
        label: "Sustained near peak",
        seasonFrom: after.season,
        seasonTo: last.season,
      });
    }
  }

  const last = qualifying[qualifying.length - 1]!;
  phases.push({
    id: "current",
    label: "Current phase",
    seasonFrom: last.season,
    seasonTo: last.season,
  });

  const summaryParts = [
    `Peak production in ${peak.season} (CPI ${formatNumber(peak.cpi, 1)}).`,
  ];
  if (primeRun.count > 1 && primeRun.from && primeRun.to) {
    summaryParts.push(
      `Sustained near-peak band across ${primeRun.count} seasons (${primeRun.from} → ${primeRun.to}).`
    );
  }
  if (last.season !== peak.season) {
    summaryParts.push(
      `Latest qualifying season ${last.season} is at ${formatNumber(last.ofPeak * 100, 0)}% of peak CPI.`
    );
  }

  return { phases, summary: summaryParts.join(" ") };
}

function buildTransitions(
  playerId: string,
  career: PlayerSeason[],
  qualifyingChron: CareerSeasonScore[]
): CareerTransitionSummary[] {
  const deduped = dedupeCareerSeasons(career);
  const ranked: Array<CareerTransitionSummary & { mag: number }> = [];

  for (let i = 1; i < qualifyingChron.length; i++) {
    const toSeason = qualifyingChron[i]!;
    const current = deduped.find((r) => r.season === toSeason.season);
    if (!current) continue;
    const evo = computePlayerEvolution({ playerId, current, career });
    const top = evo?.topChanges[0];
    if (!top || !evo) continue;
    ranked.push({
      fromSeason: evo.priorSeason,
      toSeason: evo.currentSeason,
      label: top.label,
      deltaDisplay: top.deltaDisplay,
      href: `/players/${playerId}?season=${encodeURIComponent(evo.currentSeason)}`,
      mag: top.magnitude,
    });
  }

  ranked.sort((a, b) => b.mag - a.mag);
  return ranked.slice(0, 3).map((row) => ({
    fromSeason: row.fromSeason,
    toSeason: row.toSeason,
    label: row.label,
    deltaDisplay: row.deltaDisplay,
    href: row.href,
  }));
}

/**
 * Deterministic Career Resume from career PlayerSeason rows.
 * Pure - no network. Does not invent awards or impact history.
 */
export function computeCareerResume(options: {
  playerId: string;
  playerName: string;
  career: PlayerSeason[];
  /** Season currently viewed - used to flag incomplete current. */
  viewingSeason?: string;
}): CareerResume {
  const { playerId, playerName, career, viewingSeason } = options;
  const methodology = CAREER_RESUME_METHODOLOGY;

  const empty = (limitedReason: string | null): CareerResume => ({
    playerId,
    playerName,
    qualifyingSeasons: [],
    incompleteCurrent: null,
    peak: null,
    prime: null,
    longevity: null,
    trajectory: { phases: [], summary: limitedReason ?? "" },
    transitions: [],
    finding: limitedReason
      ? {
          id: `career-resume-limited-${playerId}`,
          eyebrow: "Career resume",
          title: "Limited sample",
          body: limitedReason,
          level: 2,
          playerIds: [playerId],
        }
      : null,
    limitedReason,
    methodology,
    peakContext: null,
  });

  if (!career.length) {
    return empty("No career season rows available.");
  }

  const deduped = dedupeCareerSeasons(career);
  const latest = deduped[deduped.length - 1]!;
  const viewKey = viewingSeason ?? latest.season;

  let incompleteCurrent: CareerSeasonScore | null = null;
  const qualifyingRows: PlayerSeason[] = [];

  for (const row of deduped) {
    if (isCareerQualifyingSeason(row)) {
      qualifyingRows.push(row);
      continue;
    }
    if (
      row.season === viewKey &&
      row.gamesPlayed > 0 &&
      row.gamesPlayed < CAREER_RESUME_MIN_GAMES
    ) {
      incompleteCurrent = toScore(row, playerId, 1, true);
    }
  }

  if (qualifyingRows.length === 0) {
    const reason = incompleteCurrent
      ? `Career resume requires at least one qualifying season (≥${CAREER_RESUME_MIN_GAMES} GP and ≥${CAREER_RESUME_MIN_MPG} MPG). ${incompleteCurrent.season} is underway (${incompleteCurrent.gamesPlayed} GP) and is not counted yet.`
      : `Career resume requires at least one qualifying season (≥${CAREER_RESUME_MIN_GAMES} GP and ≥${CAREER_RESUME_MIN_MPG} MPG).`;
    const limited = empty(reason);
    limited.incompleteCurrent = incompleteCurrent;
    return limited;
  }

  let peakCpi = -Infinity;
  for (const row of qualifyingRows) {
    const cpi = careerProductionIndex(row);
    if (cpi > peakCpi) peakCpi = cpi;
  }

  const qualifying = qualifyingRows.map((row) =>
    toScore(row, playerId, peakCpi, false)
  );

  if (incompleteCurrent) {
    incompleteCurrent = {
      ...incompleteCurrent,
      ofPeak: peakCpi > 0 ? incompleteCurrent.cpi / peakCpi : 0,
      inPrimeBand: false,
      inLongevityBand: false,
    };
  }

  const peak = qualifying.reduce((best, s) => (s.cpi > best.cpi ? s : best));

  const primeSeasons = qualifying.filter((s) => s.inPrimeBand);
  const longevitySeasons = qualifying.filter((s) => s.inLongevityBand);
  const contiguous = longestPrimeRun(qualifying, primeSeasons);
  const full = qualifying.length >= CAREER_RESUME_MIN_SEASONS_FOR_FULL;

  const primeSortedAsc = [...primeSeasons].sort((a, b) =>
    a.season.localeCompare(b.season)
  );
  const primeSortedDesc = [...primeSeasons].sort((a, b) =>
    b.season.localeCompare(a.season)
  );

  const prime = full
    ? {
        seasonCount: primeSeasons.length,
        seasonFrom: primeSortedAsc[0]?.season ?? null,
        seasonTo: primeSortedDesc[0]?.season ?? null,
        contiguousCount: contiguous.count,
        contiguousFrom: contiguous.from,
        contiguousTo: contiguous.to,
        seasons: primeSeasons,
      }
    : null;

  const longevity = full
    ? {
        seasonCount: longevitySeasons.length,
        seasons: longevitySeasons,
      }
    : null;

  const trajectory = buildTrajectory(qualifying, peak);
  const transitions = full
    ? buildTransitions(playerId, career, qualifying)
    : [];

  const peakContext = buildStatContext({
    display: formatNumber(peak.cpi, 1),
    value: peak.cpi,
    unit: "other",
    population: "career_self",
    populationLabel: "this player's qualifying seasons",
    sampleSize: qualifying.length,
    timeframe: peak.season,
    sourceLabel: "Career Production Index",
  });

  const limitedReason = full
    ? null
    : `Only one qualifying season (${peak.season}). Peak is shown; Prime and Longevity need at least ${CAREER_RESUME_MIN_SEASONS_FOR_FULL} qualifying seasons.`;

  const finding: AnalyticalFinding = {
    id: `career-resume-${playerId}`,
    eyebrow: "Career resume",
    title: full
      ? `Peak ${peak.season}`
      : `Peak ${peak.season} (limited sample)`,
    body: full
      ? `${trajectory.summary} Prime band: ${primeSeasons.length} season${primeSeasons.length === 1 ? "" : "s"} ≥${CAREER_PRIME_OF_PEAK * 100}% of peak. Longevity: ${longevitySeasons.length} season${longevitySeasons.length === 1 ? "" : "s"} ≥${CAREER_LONGEVITY_OF_PEAK * 100}% of peak.`
      : limitedReason!,
    level: 2,
    playerIds: [playerId],
    href: peak.seasonHref,
  };

  return {
    playerId,
    playerName,
    qualifyingSeasons: qualifying,
    incompleteCurrent,
    peak,
    prime,
    longevity,
    trajectory,
    transitions,
    finding,
    limitedReason,
    methodology,
    peakContext,
  };
}

export function formatCpi(cpi: number): string {
  return formatNumber(cpi, 1);
}

export function formatOfPeak(ofPeak: number): string {
  return `${formatNumber(ofPeak * 100, 0)}% of peak`;
}

export function formatTsContext(ts: number | null): string | null {
  return ts == null ? null : formatPct(ts);
}
