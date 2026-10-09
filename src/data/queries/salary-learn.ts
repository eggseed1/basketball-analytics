/**
 * Real numbers for the Salary & contracts guide at /learn/salary. Everything
 * comes from the same snapshots the team and player salary pages read.
 */
import capHistoryFile from "../../../data/cba/salary-cap-by-year.json";
import capSeasonsFile from "../../../data/cba/league-cap-seasons.json";

import { contractValueModel, getContractValue, listContractValues } from "@/data/runtime/contract-value";
import { bundledContractTeamIds, bundledTeamContracts, type BrefSalaryCell } from "@/data/runtime/bref-team-contracts";
import { bundledFuturePicks } from "@/data/runtime/future-picks-snapshot";
import { getPayoffSeason, payoffLine, payoffSeasons, sampleIndexes, type PayoffLineData } from "@/data/runtime/salary-payoff";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type CapLines = {
  season: string;
  cap: number;
  tax: number;
  apron1: number;
  apron2: number;
  minimum: number | null;
};

type CapSeasonRow = {
  season: string;
  salaryCap: number;
  luxuryTax: number;
  firstApron: number | null;
  secondApron: number | null;
  minimumTeamSalary: number | null;
};

const capSeasons = (capSeasonsFile as unknown as { seasons: CapSeasonRow[] }).seasons;

function seasonFromEndYear(end: number): string {
  return `${end - 1}-${String(end % 100).padStart(2, "0")}`;
}

function teamMeta(espnId: string) {
  const brand = resolveTeamBrand(espnId);
  return { teamId: espnId, abbr: brand?.abbr.toUpperCase() ?? espnId, key: brand?.id ?? espnId };
}

/** The cap season the contract books start from. */
function booksSeason(): string {
  return contractValueModel().capSeason;
}

export function capLines(season = booksSeason()): CapLines | null {
  const row = capSeasons.find((s) => s.season === season);
  if (!row?.firstApron || !row.secondApron) return null;
  return {
    season,
    cap: row.salaryCap,
    tax: row.luxuryTax,
    apron1: row.firstApron,
    apron2: row.secondApron,
    minimum: row.minimumTeamSalary,
  };
}

export type TeamPayroll = { teamId: string; abbr: string; key: string; payroll: number; players: number };

/** Every team's listed salary for the first season on the books. */
export function teamPayrolls(): TeamPayroll[] {
  const season = booksSeason();
  const out: TeamPayroll[] = [];
  for (const id of bundledContractTeamIds()) {
    const team = bundledTeamContracts(id);
    const col = team?.seasons.indexOf(season) ?? -1;
    const payroll = col >= 0 ? team?.totals?.years[col] : null;
    if (!team || payroll == null) continue;
    out.push({ ...teamMeta(id), payroll, players: team.rows.filter((r) => r.years[col]).length });
  }
  return out.sort((a, b) => a.payroll - b.payroll);
}

export type CapZone = "under-cap" | "over-cap" | "tax" | "apron1" | "apron2";

export function capZone(payroll: number, lines: CapLines): CapZone {
  if (payroll >= lines.apron2) return "apron2";
  if (payroll >= lines.apron1) return "apron1";
  if (payroll >= lines.tax) return "tax";
  if (payroll >= lines.cap) return "over-cap";
  return "under-cap";
}

export type CapHistoryPoint = { season: string; cap: number; projected: boolean };

/** Official caps, then the growth rate the contract model assumes for the years not set yet. */
export function capHistory(fromEndYear = 2011, projectYears = 4): CapHistoryPoint[] {
  const byEnd = (capHistoryFile as unknown as { bySeasonEndYear: Record<string, { salaryCapM: number }> }).bySeasonEndYear;
  const points = new Map<string, CapHistoryPoint>();
  for (const [end, row] of Object.entries(byEnd)) {
    if (Number(end) < fromEndYear) continue;
    points.set(seasonFromEndYear(Number(end)), { season: seasonFromEndYear(Number(end)), cap: Math.round(row.salaryCapM * 1e6), projected: false });
  }
  for (const row of capSeasons) points.set(row.season, { season: row.season, cap: row.salaryCap, projected: false });
  const known = [...points.values()].sort((a, b) => a.season.localeCompare(b.season));
  const growth = contractValueModel().capGrowth;
  let last = known[known.length - 1];
  for (let i = 0; i < projectYears; i++) {
    const end = Number(last.season.slice(0, 4)) + 2;
    last = { season: seasonFromEndYear(end), cap: Math.round(last.cap * (1 + growth)), projected: true };
    known.push(last);
  }
  return known;
}

export type ContractCellKind = "guaranteed" | "player" | "team" | "partial";
export type ContractExample = {
  name: string;
  abbr: string;
  teamKey: string;
  brefId: string;
  /** Which feature this row shows off. */
  feature: Exclude<ContractCellKind, "guaranteed">;
  seasons: Array<{ season: string; amount: number; kind: ContractCellKind }>;
};

function cellKind(cell: NonNullable<BrefSalaryCell>): ContractCellKind {
  if (cell.option) return cell.option;
  return cell.notGuaranteed ? "partial" : "guaranteed";
}

/** The biggest current deal with a player option, a team option, and a year not fully guaranteed. */
export function contractExamples(): ContractExample[] {
  const best = new Map<ContractExample["feature"], { example: ContractExample; total: number }>();
  for (const id of bundledContractTeamIds()) {
    const team = bundledTeamContracts(id);
    if (!team) continue;
    for (const row of team.rows) {
      if (/^Waived\b/.test(team.notes[row.brefId] ?? "")) continue;
      const seasons = row.years
        .map((cell, i) => (cell ? { season: team.seasons[i], amount: cell.amount, kind: cellKind(cell) } : null))
        .filter((s): s is ContractExample["seasons"][number] => s != null);
      if (seasons.length < 2) continue;
      const total = seasons.reduce((s, y) => s + y.amount, 0);
      for (const feature of ["player", "team", "partial"] as const) {
        if (!seasons.some((s) => s.kind === feature)) continue;
        const current = best.get(feature);
        if (current && current.total >= total) continue;
        const meta = teamMeta(id);
        best.set(feature, { example: { name: row.name, abbr: meta.abbr, teamKey: meta.key, brefId: row.brefId, feature, seasons }, total });
      }
    }
  }
  return (["player", "team", "partial"] as const)
    .map((f) => best.get(f)?.example)
    .filter((x): x is ContractExample => x != null);
}

export type BooksSeason = { season: string; total: number; players: number };

/** Money already committed league-wide, by season. */
export function leagueBooks(): BooksSeason[] {
  const bySeason = new Map<string, BooksSeason>();
  for (const id of bundledContractTeamIds()) {
    const team = bundledTeamContracts(id);
    if (!team) continue;
    team.seasons.forEach((season, i) => {
      const total = team.totals?.years[i];
      if (total == null) return;
      const row = bySeason.get(season) ?? { season, total: 0, players: 0 };
      row.total += total;
      row.players += team.rows.filter((r) => r.years[i]).length;
      bySeason.set(season, row);
    });
  }
  return [...bySeason.values()].sort((a, b) => a.season.localeCompare(b.season)).filter((s) => s.players > 0);
}

/** The newest season with a full year of salary paid off lines. */
function finishedPayoffSeason() {
  for (const season of payoffSeasons()) {
    const found = getPayoffSeason(season);
    if (found && (found.meta.pace.at(-1) ?? 0) >= 99.9) return found;
  }
  return null;
}

export type WorthPoint = { key: string; name: string; teamId: string; href: string | null; salary: number; worth: number };
export type WorthScatter = {
  season: string;
  pricePerWin: number;
  minimum: number;
  points: WorthPoint[];
};

/** Last season: what each player was paid against what his play was worth. */
export function worthScatter(): WorthScatter | null {
  const found = finishedPayoffSeason();
  if (!found) return null;
  return {
    season: found.meta.season,
    pricePerWin: found.meta.pricePerWin,
    minimum: found.meta.minimum,
    points: found.players.map((p) => ({
      key: p.key,
      name: p.name,
      teamId: p.teamId,
      href: p.nbaId ? `/players/${p.nbaId}` : null,
      salary: p.salary,
      worth: p.earned.at(-1) ?? 0,
    })),
  };
}

export type PricePerWin = { season: string; cap: number; pricePerWin: number; minimum: number; share: number };

/** The prices the contract model uses for the first season on the books. */
export function contractPrices(): PricePerWin {
  const model = contractValueModel() as ReturnType<typeof contractValueModel> & { minimumShare: number };
  return {
    season: model.capSeason,
    cap: model.capSeasonCap,
    pricePerWin: model.pricePerWinShare * model.capSeasonCap,
    minimum: model.minimumShare * model.capSeasonCap,
    share: model.pricePerWinShare,
  };
}

export type SurplusBand = { label: string; min: number; max: number; contracts: number; positive: number; surplus: number };

const BANDS: Array<[string, number, number]> = [
  ["Under $5M", 0, 5e6],
  ["$5M to $10M", 5e6, 10e6],
  ["$10M to $20M", 10e6, 20e6],
  ["$20M to $35M", 20e6, 35e6],
  ["$35M and up", 35e6, Infinity],
];

/** Total projected surplus grouped by this season's salary. */
export function surplusBySalary(): SurplusBand[] {
  const bands = BANDS.map(([label, min, max]) => ({ label, min, max, contracts: 0, positive: 0, surplus: 0 }));
  for (const entry of listContractValues()) {
    const value = getContractValue(entry.teamId, entry.brefId);
    const first = value?.kind === "estimate" ? value.years[0]?.salary : null;
    if (first == null) continue;
    const band = bands.find((b) => first >= b.min && first < b.max);
    if (!band) continue;
    band.contracts += 1;
    if (entry.surplus > 0) band.positive += 1;
    band.surplus += entry.surplus;
  }
  return bands;
}

export type YearAhead = { offset: number; season: string; contracts: number; salary: number; worth: number };

/** Projected worth against salary, by how far ahead the season is. */
export function worthByYearAhead(maxOffset = 4): YearAhead[] {
  const model = contractValueModel();
  const start = Number(model.capSeason.slice(0, 4));
  const rows: YearAhead[] = Array.from({ length: maxOffset + 1 }, (_, offset) => ({
    offset,
    season: `${start + offset}-${String((start + offset + 1) % 100).padStart(2, "0")}`,
    contracts: 0,
    salary: 0,
    worth: 0,
  }));
  for (const entry of listContractValues()) {
    const value = getContractValue(entry.teamId, entry.brefId);
    if (value?.kind !== "estimate") continue;
    for (const year of value.years) {
      const offset = Number(year.season.slice(0, 4)) - start;
      const row = rows[offset];
      if (!row) continue;
      row.contracts += 1;
      row.salary += year.salary;
      row.worth += year.worth;
    }
  }
  return rows.filter((r) => r.contracts > 0);
}

export type ValuedContractExample = {
  name: string;
  abbr: string;
  teamKey: string;
  years: Array<{ season: string; salary: number; worthLow: number; worth: number; worthHigh: number; kind: ContractCellKind }>;
  surplus: number;
  surplusLow: number;
  surplusHigh: number;
};

function contractRow(teamId: string, brefId: string) {
  const team = bundledTeamContracts(teamId);
  const row = team?.rows.find((r) => r.brefId === brefId);
  return team && row ? { team, row } : null;
}

function valuedExample(teamId: string, brefId: string): ValuedContractExample | null {
  const value = getContractValue(teamId, brefId);
  const found = contractRow(teamId, brefId);
  if (value?.kind !== "estimate" || !found) return null;
  const meta = teamMeta(teamId);
  return {
    name: found.row.name,
    abbr: meta.abbr,
    teamKey: meta.key,
    years: value.years.map((y) => {
      const cell = found.row.years[found.team.seasons.indexOf(y.season)];
      return { ...y, kind: cell ? cellKind(cell) : "guaranteed" };
    }),
    surplus: value.surplus,
    surplusLow: value.surplusLow,
    surplusHigh: value.surplusHigh,
  };
}

/** The largest long deal: its worth drifts below salary as the player ages. */
export function longContractExample(): ValuedContractExample | null {
  const pick = listContractValues()
    .filter((c) => c.seasons.length >= 4)
    .sort((a, b) => b.salary - a.salary)[0];
  return pick ? valuedExample(pick.teamId, pick.brefId) : null;
}

export type OptionExample = {
  kind: "player" | "team";
  name: string;
  abbr: string;
  season: string;
  salary: number;
  worthLow: number;
  worth: number;
  worthHigh: number;
};

/** A real option year of each kind whose worth range straddles the salary, so both outcomes are possible. */
export function optionExamples(): OptionExample[] {
  const out = new Map<"player" | "team", { example: OptionExample; score: number }>();
  for (const entry of listContractValues()) {
    const example = valuedExample(entry.teamId, entry.brefId);
    if (!example) continue;
    for (const y of example.years) {
      if (y.kind !== "player" && y.kind !== "team") continue;
      if (!(y.worthLow < y.salary && y.worthHigh > y.salary)) continue;
      const score = y.salary;
      const current = out.get(y.kind);
      if (current && current.score >= score) continue;
      out.set(y.kind, { example: { kind: y.kind, name: example.name, abbr: example.abbr, season: y.season, salary: y.salary, worthLow: y.worthLow, worth: y.worth, worthHigh: y.worthHigh }, score });
    }
  }
  return (["player", "team"] as const)
    .map((k) => out.get(k)?.example)
    .filter((x): x is OptionExample => x != null);
}

export type PayoffExamples = {
  season: string;
  dates: string[];
  pace: number[];
  lines: Array<PayoffLineData & { why: string }>;
};

/** A few lines from last season that show the range: the best value, the priciest deal, and in between. */
export function payoffExamples(): PayoffExamples | null {
  const found = finishedPayoffSeason();
  if (!found) return null;
  const { meta, players } = found;
  const last = (p: (typeof players)[number]) => p.pct.at(-1) ?? 0;
  const big = players.filter((p) => p.salary >= 25e6).sort((a, b) => last(b) - last(a));
  const picks: Array<[(typeof players)[number] | undefined, string]> = [
    [[...players].sort((a, b) => (b.earned.at(-1) ?? 0) - (a.earned.at(-1) ?? 0))[0], "Most worth in the league"],
    [[...players].sort((a, b) => b.salary - a.salary)[0], "Highest salary"],
    [big[Math.floor(big.length / 2)], "Middle of the $25M+ salaries"],
    [big.at(-1), "Lowest share among $25M+ salaries"],
  ];
  const indexes = sampleIndexes(meta.dates.length, meta.dates.length);
  const seen = new Set<string>();
  const lines: PayoffExamples["lines"] = [];
  for (const [p, why] of picks) {
    if (!p || seen.has(p.key)) continue;
    seen.add(p.key);
    lines.push({ ...payoffLine(p, indexes, true), why });
  }
  return { season: meta.season, dates: indexes.map((i) => meta.dates[i]), pace: indexes.map((i) => meta.pace[i]), lines };
}

export type TeamPicks = {
  teamId: string;
  abbr: string;
  key: string;
  own: number;
  acquired: number;
  swaps: number;
  /** Held picks that only convey under conditions, such as a top-5 protection. */
  conditional: number;
  frozen: number;
  owedAway: number;
};

/** First-round picks each team holds over the drafts on file. */
export function firstRoundPicks(): { years: number[]; teams: TeamPicks[] } {
  const years = new Set<number>();
  const teams: TeamPicks[] = [];
  for (const id of bundledContractTeamIds()) {
    const data = bundledFuturePicks(id);
    if (!data) continue;
    const meta = teamMeta(id);
    const abbr = data.abbr.toUpperCase();
    const firsts = data.picks.filter((p) => p.round === 1);
    firsts.forEach((p) => years.add(p.year));
    const held = firsts.filter((p) => p.holder.toUpperCase() === abbr);
    teams.push({
      ...meta,
      own: held.filter((p) => p.origin.toUpperCase() === abbr).length,
      acquired: held.filter((p) => p.origin.toUpperCase() !== abbr).length,
      swaps: firsts.filter((p) => p.swapWith).length,
      conditional: held.filter((p) => p.terms && /\bif\b|favorable/i.test(p.terms)).length,
      frozen: held.filter((p) => p.frozen).length,
      owedAway: firsts.filter((p) => p.origin.toUpperCase() === abbr && p.holder.toUpperCase() !== abbr).length,
    });
  }
  return { years: [...years].sort(), teams: teams.sort((a, b) => b.own + b.acquired - (a.own + a.acquired) || a.abbr.localeCompare(b.abbr)) };
}
