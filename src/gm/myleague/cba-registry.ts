/**
 * Season-scoped CBA registry - year-accurate caps + era rule flags.
 */

import type { CBARules, SeasonYear } from "@/gm/myleague/types";
import capFile from "../../../data/cba/salary-cap-by-year.json";

type CapRow = {
  salaryCapM: number;
  luxuryTaxM: number;
  firstApronM?: number;
  secondApronM?: number;
  minSalaryM?: number;
  maxSalaryM?: number;
};

type CbaEpoch = {
  from: SeasonYear;
  to: SeasonYear;
  rules: Partial<Omit<CBARules, "season">> & {
    notes?: string;
    lotteryModel?: CBARules["lotteryModel"];
    tradeMatching?: CBARules["tradeMatching"];
  };
};

/** Rule flags by era (caps come from the year table when available). */
const EPOCHS: CbaEpoch[] = [
  {
    from: 1947,
    to: 1983,
    rules: {
      salaryCapM: 0,
      luxuryTaxM: 0,
      minSalaryM: 0.05,
      maxSalaryM: 2,
      rookieScale: false,
      birdRights: false,
      restrictedFreeAgency: false,
      signAndTrade: false,
      tradeMatching: "none",
      maxContractYears: 99,
      maxRoster: 12,
      minRoster: 10,
      twoWayContracts: false,
      draftRounds: 8,
      lotteryModel: "none",
      notes: "Pre-cap era.",
    },
  },
  {
    from: 1984,
    to: 1998,
    rules: {
      salaryCapM: 26.9,
      luxuryTaxM: 0,
      minSalaryM: 0.2,
      maxSalaryM: 10,
      rookieScale: true,
      birdRights: true,
      restrictedFreeAgency: true,
      signAndTrade: true,
      tradeMatching: "soft",
      maxContractYears: 7,
      maxRoster: 12,
      minRoster: 10,
      twoWayContracts: false,
      draftRounds: 2,
      lotteryModel: "coin_flip",
      notes: "Early soft-cap / Bird era.",
    },
  },
  {
    from: 1999,
    to: 2010,
    rules: {
      rookieScale: true,
      birdRights: true,
      restrictedFreeAgency: true,
      signAndTrade: true,
      tradeMatching: "soft",
      maxContractYears: 6,
      maxRoster: 15,
      minRoster: 13,
      twoWayContracts: false,
      draftRounds: 2,
      lotteryModel: "weighted_pre2019",
      notes: "Soft cap + luxury tax era.",
    },
  },
  {
    from: 2011,
    to: 2016,
    rules: {
      rookieScale: true,
      birdRights: true,
      restrictedFreeAgency: true,
      signAndTrade: true,
      tradeMatching: "soft",
      maxContractYears: 5,
      maxRoster: 15,
      minRoster: 13,
      twoWayContracts: false,
      draftRounds: 2,
      lotteryModel: "weighted_pre2019",
      notes: "2011 CBA window.",
    },
  },
  {
    from: 2017,
    to: 2022,
    rules: {
      rookieScale: true,
      birdRights: true,
      restrictedFreeAgency: true,
      signAndTrade: true,
      tradeMatching: "soft",
      maxContractYears: 5,
      maxRoster: 15,
      minRoster: 14,
      twoWayContracts: true,
      draftRounds: 2,
      lotteryModel: "weighted_pre2019",
      notes: "TV boom / two-way era.",
    },
  },
  {
    from: 2019,
    to: 2022,
    rules: {
      rookieScale: true,
      birdRights: true,
      restrictedFreeAgency: true,
      signAndTrade: true,
      tradeMatching: "soft",
      maxContractYears: 5,
      maxRoster: 15,
      minRoster: 14,
      twoWayContracts: true,
      draftRounds: 2,
      lotteryModel: "weighted_2019plus",
      notes: "Flattened lottery (2019+) within TV boom.",
    },
  },
  {
    from: 2023,
    to: 2035,
    rules: {
      rookieScale: true,
      birdRights: true,
      restrictedFreeAgency: true,
      signAndTrade: true,
      tradeMatching: "soft",
      maxContractYears: 5,
      maxRoster: 15,
      minRoster: 14,
      twoWayContracts: true,
      draftRounds: 2,
      lotteryModel: "weighted_2019plus",
      notes: "Apron CBA era.",
    },
  },
];

let capTable: Record<string, CapRow> | null = null;

function loadCapTable(): Record<string, CapRow> {
  if (capTable) return capTable;
  capTable = (capFile as { bySeasonEndYear: Record<string, CapRow> })
    .bySeasonEndYear;
  return capTable;
}

function epochFor(seasonEndYear: SeasonYear): CbaEpoch {
  // Prefer the most specific (latest-from) matching epoch.
  const matches = EPOCHS.filter(
    (e) => seasonEndYear >= e.from && seasonEndYear <= e.to
  );
  return matches[matches.length - 1] ?? EPOCHS[EPOCHS.length - 1]!;
}

function nearestCapRow(seasonEndYear: SeasonYear): CapRow | null {
  const table = loadCapTable();
  if (table[String(seasonEndYear)]) return table[String(seasonEndYear)]!;
  const years = Object.keys(table)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  if (!years.length) return null;
  if (seasonEndYear < years[0]!) return table[String(years[0])]!;
  if (seasonEndYear > years[years.length - 1]!) {
    return table[String(years[years.length - 1])]!;
  }
  // interpolate between neighbors
  let lo = years[0]!;
  let hi = years[years.length - 1]!;
  for (let i = 0; i < years.length - 1; i++) {
    if (seasonEndYear >= years[i]! && seasonEndYear <= years[i + 1]!) {
      lo = years[i]!;
      hi = years[i + 1]!;
      break;
    }
  }
  const a = table[String(lo)]!;
  const b = table[String(hi)]!;
  const t = hi === lo ? 0 : (seasonEndYear - lo) / (hi - lo);
  const mix = (x: number, y: number) => Math.round((x + (y - x) * t) * 1000) / 1000;
  return {
    salaryCapM: mix(a.salaryCapM, b.salaryCapM),
    luxuryTaxM: mix(a.luxuryTaxM, b.luxuryTaxM),
    firstApronM:
      a.firstApronM != null && b.firstApronM != null
        ? mix(a.firstApronM, b.firstApronM)
        : b.firstApronM ?? a.firstApronM,
    secondApronM:
      a.secondApronM != null && b.secondApronM != null
        ? mix(a.secondApronM, b.secondApronM)
        : b.secondApronM ?? a.secondApronM,
    minSalaryM: mix(a.minSalaryM ?? 0.5, b.minSalaryM ?? 1),
    maxSalaryM: mix(a.maxSalaryM ?? a.salaryCapM * 0.35, b.maxSalaryM ?? b.salaryCapM * 0.35),
  };
}

/** Resolve CBA rules for a season-end year (e.g. 2025 for 2024-25). */
export function getCbaRules(seasonEndYear: SeasonYear): CBARules {
  const epoch = epochFor(seasonEndYear);
  const caps = nearestCapRow(seasonEndYear);
  const salaryCapM = caps?.salaryCapM ?? epoch.rules.salaryCapM ?? 0;
  const luxuryTaxM = caps?.luxuryTaxM ?? epoch.rules.luxuryTaxM ?? 0;
  const minSalaryM =
    caps?.minSalaryM ?? epoch.rules.minSalaryM ?? Math.max(0.5, salaryCapM * 0.008);
  const maxSalaryM =
    caps?.maxSalaryM ?? epoch.rules.maxSalaryM ?? Math.round(salaryCapM * 0.35 * 10) / 10;

  return {
    season: seasonEndYear,
    salaryCapM,
    luxuryTaxM,
    firstApronM: caps?.firstApronM ?? epoch.rules.firstApronM,
    secondApronM: caps?.secondApronM ?? epoch.rules.secondApronM,
    minSalaryM,
    maxSalaryM,
    rookieScale: epoch.rules.rookieScale ?? true,
    birdRights: epoch.rules.birdRights ?? true,
    restrictedFreeAgency: epoch.rules.restrictedFreeAgency ?? true,
    signAndTrade: epoch.rules.signAndTrade ?? true,
    tradeMatching: epoch.rules.tradeMatching ?? "soft",
    maxContractYears: epoch.rules.maxContractYears ?? 5,
    maxRoster: epoch.rules.maxRoster ?? 15,
    minRoster: epoch.rules.minRoster ?? 14,
    twoWayContracts: epoch.rules.twoWayContracts ?? false,
    draftRounds: epoch.rules.draftRounds ?? 2,
    lotteryModel: epoch.rules.lotteryModel ?? "weighted_pre2019",
    notes:
      caps != null
        ? `Year-accurate cap table + ${epoch.rules.notes ?? "era rules"}`
        : epoch.rules.notes,
  };
}

/** @deprecated Prefer getCbaRules - year table is exact for 2001-2026. */
export function getCbaRulesInterpolated(seasonEndYear: SeasonYear): CBARules {
  return getCbaRules(seasonEndYear);
}

export function listCbaEpochs(): Array<{
  from: SeasonYear;
  to: SeasonYear;
  salaryCapM: number;
  lotteryModel: CBARules["lotteryModel"];
  notes?: string;
}> {
  return EPOCHS.map((e) => {
    const mid = Math.floor((e.from + e.to) / 2);
    const rules = getCbaRules(mid);
    return {
      from: e.from,
      to: e.to,
      salaryCapM: rules.salaryCapM,
      lotteryModel: rules.lotteryModel,
      notes: e.rules.notes,
    };
  });
}

/** Year-by-year cap rows for UI / debugging. */
export function listSalaryCapHistory(
  fromEndYear = 2001,
  toEndYear = 2026
): Array<CapRow & { seasonEndYear: number; label: string }> {
  const rows: Array<CapRow & { seasonEndYear: number; label: string }> = [];
  for (let y = fromEndYear; y <= toEndYear; y++) {
    const caps = nearestCapRow(y);
    if (!caps) continue;
    rows.push({
      seasonEndYear: y,
      label: `${y - 1}-${String(y).slice(-2)}`,
      ...caps,
    });
  }
  return rows;
}
