import {
  fetchBrefAdvancedCohort,
  fetchBrefPerGameCohort,
  type BrefAdvancedRow,
  type BrefPerGameCohortRow,
} from "@/data/providers/nba/bref-scraper";
import {
  countingForRate,
  fetchBrefPlayerPage,
  LUKA_BREF_ID,
  LUKA_DISPLAY_NAME,
  LUKA_ESPN_ID,
  LUKA_NBA_ID,
  type BrefCountingRow,
  type BrefPlayerAdvancedRow,
  type BrefPlayerPage,
  type BrefRateMode,
  type BrefSeasonType,
  type BrefStatBundle,
} from "@/data/providers/nba/bref-player-page";
import { formatNumber, formatOrdinal, formatPct } from "@/lib/format";
import { teamChartColor } from "@/lib/nba-brand";

export const LUKA_COHORT_RULE =
  "Qualified: 20+ games or 500+ minutes, same season and season type, combined-season grain.";

export type LukaTab = "overview" | "trends" | "shooting" | "all-stats";

export type LukaHeroCard = {
  key: string;
  label: string;
  display: string;
  unit: string;
  definition: string;
  percentile: number | null;
  rank: number | null;
  cohortSize: number | null;
  deltaDisplay: string | null;
  qualified: boolean;
  percentilesOnStint: boolean;
};

export type LukaPercentileRow = {
  id: string;
  group: string;
  label: string;
  display: string;
  percentile: number;
  fillPercentile: number;
  rank: number;
  cohortSize: number;
  lowerIsBetter: boolean;
};

export type LukaLedgerRow = {
  season: string;
  teamAbbr: string;
  combined: boolean;
  gamesPlayed: number | null;
  gamesStarted: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  fieldGoalPct: number | null;
  threePointPct: number | null;
  freeThrowPct: number | null;
  trueShootingPct: number | null;
  effectiveFieldGoalPct: number | null;
  usagePct: number | null;
  turnoverPct: number | null;
  per: number | null;
  bpm: number | null;
  vorp: number | null;
  winShares: number | null;
};

export type LukaTrendPoint = {
  season: string;
  value: number;
  teamId: string;
  teamAbbr: string;
  color: string;
};

export type LukaBrefProfile = {
  espnId: string;
  nbaId: string;
  displayName: string;
  bio: BrefPlayerPage["bio"];
  scrapedAt: string;
  season: string;
  seasonType: BrefSeasonType;
  team: string;
  rate: BrefRateMode;
  tab: LukaTab;
  seasons: string[];
  teamOptions: string[];
  viewingLine: string;
  currentLine: string;
  viewingAge: number | null;
  viewingPosition: string | null;
  rateUnit: string;
  hero: LukaHeroCard[];
  percentileRows: LukaPercentileRow[] | null;
  percentileBlockedReason: string | null;
  trends: {
    pts: LukaTrendPoint[];
    ts: LukaTrendPoint[];
    usg: LukaTrendPoint[];
    bpm: LukaTrendPoint[];
  };
  ledger: LukaLedgerRow[];
  emptyPlayoffs: boolean;
};

const TABS: LukaTab[] = ["overview", "trends", "shooting", "all-stats"];
const RATES: BrefRateMode[] = ["perGame", "totals", "per36", "per100"];

function firstParam(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function bundleForType(page: BrefPlayerPage, type: BrefSeasonType): BrefStatBundle {
  return type === "playoffs" ? page.playoffs : page.regular;
}

function pickRow<T extends { season: string; teamAbbr: string; combined: boolean }>(
  rows: T[],
  season: string,
  team: string
): T | null {
  const inSeason = rows.filter((r) => r.season === season);
  if (!inSeason.length) return null;
  if (team === "TOT") {
    return inSeason.find((r) => r.combined) ?? inSeason[0] ?? null;
  }
  return inSeason.find((r) => r.teamAbbr === team && !r.combined) ?? null;
}

function priorSeason(seasons: string[], season: string): string | null {
  const i = seasons.indexOf(season);
  if (i <= 0) return null;
  return seasons[i - 1] ?? null;
}

function rankAndPercentile(
  value: number,
  pool: number[],
  lowerIsBetter: boolean
): { rank: number; percentile: number } {
  const n = pool.length;
  const better = lowerIsBetter
    ? pool.filter((v) => v < value).length
    : pool.filter((v) => v > value).length;
  const worse = lowerIsBetter
    ? pool.filter((v) => v > value).length
    : pool.filter((v) => v < value).length;
  return {
    rank: better + 1,
    percentile: n ? (worse / n) * 100 : 50,
  };
}

function qualifiedAdvanced(row: BrefAdvancedRow): boolean {
  return row.gamesPlayed >= 20 || row.minutes >= 500;
}

function fmt(value: number | null, kind: "num" | "pct" | "rate", digits = 1): string {
  if (value == null) return "-";
  if (kind === "pct" || kind === "rate") return formatPct(value, digits);
  return formatNumber(value, digits);
}

function delta(
  current: number | null,
  previous: number | null,
  kind: "num" | "pct",
  previousSeason: string | null
): string | null {
  if (current == null || previous == null || !previousSeason) return null;
  const d = current - previous;
  const vs = ` vs ${previousSeason}`;
  if (kind === "pct") {
    const pts = d * 100;
    const sign = pts > 0 ? "+" : pts < 0 ? "−" : "";
    return `${sign}${Math.abs(pts).toFixed(1)} pts${vs}`;
  }
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d).toFixed(1)}${vs}`;
}

function rateUnit(rate: BrefRateMode): string {
  if (rate === "totals") return "TOT";
  if (rate === "per36") return "/36";
  if (rate === "per100") return "/100";
  return "/G";
}

function countingDigits(rate: BrefRateMode): number {
  return rate === "totals" ? 0 : 1;
}

function trendColor(teamAbbr: string): string {
  if (teamAbbr === "TOT") return "#6b7280";
  return teamChartColor(teamAbbr).color;
}

function shortSeason(season: string): string {
  const match = /^(\d{2})\d{2}-(\d{2})$/.exec(season);
  return match ? `${match[1]}-${match[2]}` : season;
}

function finitePool(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

function combinedTrend(
  counting: BrefCountingRow[],
  advanced: BrefPlayerAdvancedRow[],
  metric: "pts" | "ts" | "usg" | "bpm"
): LukaTrendPoint[] {
  const seasons = [...new Set(counting.map((r) => r.season))].sort();
  const points: LukaTrendPoint[] = [];
  for (const season of seasons) {
    const inSeason = counting.filter((r) => r.season === season);
    const row =
      inSeason.find((r) => r.combined) ??
      (inSeason.length === 1 ? inSeason[0] : null);
    const advPool = advanced.filter((r) => r.season === season);
    const adv =
      advPool.find((r) => r.combined) ??
      (advPool.length === 1 ? advPool[0] : null);
    if (!row) continue;
    let value: number | null = null;
    if (metric === "pts") value = row.points;
    if (metric === "ts") value = adv?.trueShootingPct ?? null;
    if (metric === "usg") value = adv?.usagePct ?? null;
    if (metric === "bpm") value = adv?.bpm ?? null;
    if (value == null) continue;
    const teamAbbr = row.teamAbbr;
    points.push({
      season: shortSeason(season),
      value: metric === "ts" || metric === "usg" ? value * 100 : value,
      teamId: teamAbbr.toLowerCase(),
      teamAbbr,
      color: trendColor(teamAbbr),
    });
  }
  return points;
}

export async function getLukaBrefProfile(
  searchParams: Record<string, string | string[] | undefined>
): Promise<LukaBrefProfile> {
  const page = await fetchBrefPlayerPage(LUKA_BREF_ID);
  const regularSeasons = [
    ...new Set(page.regular.perGame.map((r) => r.season)),
  ].sort();
  const playoffSeasons = [
    ...new Set(page.playoffs.perGame.map((r) => r.season)),
  ].sort();

  const seasonType: BrefSeasonType =
    firstParam(searchParams, "seasonType") === "playoffs"
      ? "playoffs"
      : "regular";
  const seasonPool =
    seasonType === "playoffs" ? playoffSeasons : regularSeasons;
  const requestedSeason = firstParam(searchParams, "season");
  const season =
    requestedSeason && seasonPool.includes(requestedSeason)
      ? requestedSeason
      : (seasonPool[seasonPool.length - 1] ?? regularSeasons[regularSeasons.length - 1] ?? "2025-26");

  const bundle = bundleForType(page, seasonType);
  const emptyPlayoffs =
    seasonType === "playoffs" && bundle.perGame.length === 0;

  const inSeasonTeams = bundle.perGame.filter((r) => r.season === season);
  const teamOptions = [
    ...(inSeasonTeams.some((r) => r.combined) ? ["TOT"] : []),
    ...inSeasonTeams.filter((r) => !r.combined).map((r) => r.teamAbbr),
  ];
  const requestedTeam = firstParam(searchParams, "team")?.toUpperCase();
  const team =
    requestedTeam && teamOptions.includes(requestedTeam)
      ? requestedTeam
      : (teamOptions[0] ?? "TOT");

  const requestedRate = firstParam(searchParams, "rate") as BrefRateMode | undefined;
  const rate: BrefRateMode = requestedRate && RATES.includes(requestedRate)
    ? requestedRate
    : "perGame";
  const requestedTab = firstParam(searchParams, "tab") as LukaTab | undefined;
  const tab: LukaTab = requestedTab && TABS.includes(requestedTab)
    ? requestedTab
    : "overview";

  const counting = countingForRate(bundle, rate);
  const row = pickRow(counting, season, team);
  const adv = pickRow(bundle.advanced, season, team);
  const viewingCombined = team === "TOT";

  const prev = priorSeason(seasonPool, season);
  const prevRow = prev ? pickRow(counting, prev, team === "TOT" ? "TOT" : team) : null;
  const prevAdv = prev ? pickRow(bundle.advanced, prev, team === "TOT" ? "TOT" : team) : null;

  let cohort: BrefAdvancedRow[] = [];
  let perGameCohort: BrefPerGameCohortRow[] = [];
  if (seasonType === "regular" && viewingCombined) {
    const [advancedRows, perGameRows] = await Promise.all([
      fetchBrefAdvancedCohort(season).catch(() => [] as BrefAdvancedRow[]),
      fetchBrefPerGameCohort(season).catch(() => [] as BrefPerGameCohortRow[]),
    ]);
    cohort = advancedRows.filter(qualifiedAdvanced);
    const qualifiedIds = new Set(
      cohort.map((r) => r.brefId).filter((id): id is string => Boolean(id))
    );
    perGameCohort = perGameRows.filter((r) => {
      if (qualifiedIds.size) return Boolean(r.brefId && qualifiedIds.has(r.brefId));
      return r.gamesPlayed >= 20;
    });
  }

  const lukaCohort = cohort.find((r) => r.brefId === LUKA_BREF_ID);
  const digits = countingDigits(rate);
  const unit = rateUnit(rate);

  function heroFromCounting(
    key: string,
    label: string,
    value: number | null,
    prevValue: number | null,
    definition: string
  ): LukaHeroCard {
    return {
      key,
      label,
      display: fmt(value, "num", digits),
      unit,
      definition,
      percentile: null,
      rank: null,
      cohortSize: null,
      deltaDisplay: delta(value, prevValue, "num", prev),
      qualified: (row?.gamesPlayed ?? 0) >= 20 || (row?.minutes ?? 0) >= 500,
      percentilesOnStint: !viewingCombined,
    };
  }

  function heroFromAdvanced(
    key: string,
    label: string,
    value: number | null,
    prevValue: number | null,
    poolKey: keyof BrefAdvancedRow,
    definition: string
  ): LukaHeroCard {
    const pool = finitePool(cohort.map((r) => r[poolKey] as number | null));
    const self = lukaCohort?.[poolKey];
    const ranked =
      viewingCombined && typeof self === "number" && pool.length
        ? rankAndPercentile(self, pool, false)
        : null;
    return {
      key,
      label,
      display: fmt(value, "pct"),
      unit: "",
      definition,
      percentile: ranked?.percentile ?? null,
      rank: ranked?.rank ?? null,
      cohortSize: ranked ? pool.length : null,
      deltaDisplay: delta(value, prevValue, "pct", prev),
      qualified:
        (row?.gamesPlayed ?? 0) >= 20 || (adv?.minutes ?? 0) >= 500,
      percentilesOnStint: !viewingCombined,
    };
  }

  const pgSelf = pickRow(
    seasonType === "regular" ? page.regular.perGame : page.playoffs.perGame,
    season,
    "TOT"
  );
  const lukaPerGame = perGameCohort.find((r) => r.brefId === LUKA_BREF_ID);

  function countingRank(metric: "points" | "rebounds" | "assists"): {
    percentile: number;
    rank: number;
    cohortSize: number;
  } | null {
    if (!viewingCombined || seasonType !== "regular") return null;
    const self =
      lukaPerGame?.[metric] ??
      (metric === "points"
        ? pgSelf?.points
        : metric === "rebounds"
          ? pgSelf?.rebounds
          : pgSelf?.assists) ??
      null;
    const pool = finitePool(perGameCohort.map((r) => r[metric]));
    if (self == null || !pool.length) return null;
    const ranked = rankAndPercentile(self, pool, false);
    return { ...ranked, cohortSize: pool.length };
  }

  const ptsRank = countingRank("points");
  const rebRank = countingRank("rebounds");
  const astRank = countingRank("assists");

  const ptsHero = heroFromCounting(
    "pts",
    "PTS",
    row?.points ?? null,
    prevRow?.points ?? null,
    "Points in the selected rate mode. Percentile uses per-game combined rows."
  );
  if (ptsRank) {
    ptsHero.percentile = ptsRank.percentile;
    ptsHero.rank = ptsRank.rank;
    ptsHero.cohortSize = ptsRank.cohortSize;
  }

  const rebHero = heroFromCounting(
    "reb",
    "REB",
    row?.rebounds ?? null,
    prevRow?.rebounds ?? null,
    "Rebounds in the selected rate mode. Percentile uses per-game combined rows."
  );
  if (rebRank) {
    rebHero.percentile = rebRank.percentile;
    rebHero.rank = rebRank.rank;
    rebHero.cohortSize = rebRank.cohortSize;
  }

  const astHero = heroFromCounting(
    "ast",
    "AST",
    row?.assists ?? null,
    prevRow?.assists ?? null,
    "Assists in the selected rate mode. Percentile uses per-game combined rows."
  );
  if (astRank) {
    astHero.percentile = astRank.percentile;
    astHero.rank = astRank.rank;
    astHero.cohortSize = astRank.cohortSize;
  }

  const hero: LukaHeroCard[] = [
    ptsHero,
    rebHero,
    astHero,
    heroFromAdvanced(
      "ts",
      "TS%",
      adv?.trueShootingPct ?? null,
      prevAdv?.trueShootingPct ?? null,
      "trueShootingPct",
      "True shooting. From BRef Advanced (not rescaled by rate mode)."
    ),
    heroFromAdvanced(
      "usg",
      "USG%",
      adv?.usagePct ?? null,
      prevAdv?.usagePct ?? null,
      "usagePct",
      "Usage rate. From BRef Advanced (not rescaled by rate mode)."
    ),
  ];

  let percentileRows: LukaPercentileRow[] | null = null;
  let percentileBlockedReason: string | null = null;
  if (!viewingCombined) {
    percentileBlockedReason =
      "Percentiles use combined-season rows. Switch Team to TOT to compare.";
  } else if (seasonType === "playoffs") {
    percentileBlockedReason =
      "Playoff percentiles are not computed in this example (small samples).";
  } else if (!lukaCohort || !cohort.length) {
    percentileBlockedReason = "League advanced table unavailable for this season.";
  } else {
    const pg = pickRow(page.regular.perGame, season, "TOT");
    const ptsPool = finitePool(perGameCohort.map((r) => r.points));
    const specs: Array<{
      id: string;
      group: string;
      label: string;
      display: string;
      value: number | null;
      pool: number[];
      lowerIsBetter: boolean;
    }> = [
      {
        id: "pts",
        group: "Scoring",
        label: "PTS / G",
        display: fmt(pg?.points ?? lukaPerGame?.points ?? null, "num", 1),
        value: lukaPerGame?.points ?? pg?.points ?? null,
        pool: ptsPool,
        lowerIsBetter: false,
      },
      {
        id: "ts",
        group: "Shooting",
        label: "TS%",
        display: fmt(lukaCohort.trueShootingPct, "pct"),
        value: lukaCohort.trueShootingPct,
        pool: finitePool(cohort.map((r) => r.trueShootingPct)),
        lowerIsBetter: false,
      },
      {
        id: "ast",
        group: "Creation",
        label: "AST%",
        display: fmt(lukaCohort.assistPct, "pct"),
        value: lukaCohort.assistPct,
        pool: finitePool(cohort.map((r) => r.assistPct)),
        lowerIsBetter: false,
      },
      {
        id: "tov",
        group: "Ball security",
        label: "TOV%",
        display: fmt(lukaCohort.turnoverPct, "pct"),
        value: lukaCohort.turnoverPct,
        pool: finitePool(cohort.map((r) => r.turnoverPct)),
        lowerIsBetter: true,
      },
      {
        id: "trb",
        group: "Rebounding",
        label: "TRB%",
        display: fmt(lukaCohort.reboundPct, "pct"),
        value: lukaCohort.reboundPct,
        pool: finitePool(cohort.map((r) => r.reboundPct)),
        lowerIsBetter: false,
      },
      {
        id: "bpm",
        group: "Impact",
        label: "BPM",
        display: fmt(lukaCohort.bpm, "num", 1),
        value: lukaCohort.bpm,
        pool: finitePool(cohort.map((r) => r.bpm)),
        lowerIsBetter: false,
      },
    ];
    percentileRows = specs
      .filter((s) => s.value != null && s.pool.length)
      .map((s) => {
        const ranked = rankAndPercentile(
          s.value as number,
          s.pool,
          s.lowerIsBetter
        );
        return {
          id: s.id,
          group: s.group,
          label: s.label,
          display: s.display,
          percentile: ranked.percentile,
          fillPercentile: ranked.percentile,
          rank: ranked.rank,
          cohortSize: s.pool.length,
          lowerIsBetter: s.lowerIsBetter,
        };
      });
  }

  const ledger: LukaLedgerRow[] = seasonPool.flatMap((s) => {
    const countRows = counting.filter((r) => r.season === s);
    const ordered = [
      ...countRows.filter((r) => r.combined),
      ...countRows.filter((r) => !r.combined),
    ];
    return ordered.map((c) => {
      const a = pickRow(bundle.advanced, s, c.combined ? "TOT" : c.teamAbbr);
      return {
        season: c.season,
        teamAbbr: c.teamAbbr,
        combined: c.combined,
        gamesPlayed: c.gamesPlayed,
        gamesStarted: c.gamesStarted,
        minutes: c.minutes,
        points: c.points,
        rebounds: c.rebounds,
        assists: c.assists,
        fieldGoalPct: c.fieldGoalPct,
        threePointPct: c.threePointPct,
        freeThrowPct: c.freeThrowPct,
        trueShootingPct: a?.trueShootingPct ?? null,
        effectiveFieldGoalPct: c.effectiveFieldGoalPct,
        usagePct: a?.usagePct ?? null,
        turnoverPct: a?.turnoverPct ?? null,
        per: a?.per ?? null,
        bpm: a?.bpm ?? null,
        vorp: a?.vorp ?? null,
        winShares: a?.winShares ?? null,
      };
    });
  });

  const stintTeams = inSeasonTeams.filter((r) => !r.combined).map((r) => r.teamAbbr);
  const viewingLine =
    team === "TOT" && stintTeams.length > 1
      ? `${season} ${seasonType === "playoffs" ? "playoffs" : "regular season"} · TOT (${stintTeams.join(" + ")})`
      : `${season} ${seasonType === "playoffs" ? "playoffs" : "regular season"} · ${team}`;

  const currentTeam =
    page.bio.currentTeamAbbr ?? page.bio.currentTeamName ?? "-";
  const currentLine = page.bio.currentTeamName
    ? `${page.bio.currentTeamName}${page.bio.jersey ? ` · #${page.bio.jersey}` : ""}`
    : String(currentTeam);

  const trendPg = page.regular.perGame;
  const trendAdv = page.regular.advanced;

  return {
    espnId: LUKA_ESPN_ID,
    nbaId: LUKA_NBA_ID,
    displayName: page.bio.displayName || LUKA_DISPLAY_NAME,
    bio: page.bio,
    scrapedAt: page.scrapedAt,
    season,
    seasonType,
    team,
    rate,
    tab,
    seasons: seasonPool,
    teamOptions,
    viewingLine,
    currentLine,
    viewingAge: row?.age ?? null,
    viewingPosition: row?.position ?? page.bio.positionLine,
    rateUnit: unit,
    hero,
    percentileRows,
    percentileBlockedReason,
    trends: {
      pts: combinedTrend(trendPg, trendAdv, "pts"),
      ts: combinedTrend(trendPg, trendAdv, "ts"),
      usg: combinedTrend(trendPg, trendAdv, "usg"),
      bpm: combinedTrend(trendPg, trendAdv, "bpm"),
    },
    ledger,
    emptyPlayoffs,
  };
}

export function formatCohortLine(
  percentile: number | null,
  rank: number | null,
  n: number | null
): string | null {
  if (percentile == null || rank == null || n == null) return null;
  return `${formatOrdinal(Math.round(percentile))} · ${rank} of ${n} qualified`;
}
