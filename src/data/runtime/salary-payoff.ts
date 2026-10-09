/**
 * Salary paid off, baked by scripts/build-salary-payoff.ts. One reading per
 * night for the live season; finished seasons are paced by minutes.
 */
import { loadPlayerIdAliases } from "@/data/providers/impact/player-id-aliases";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  paceSeries,
  paidOffDate,
  payoffSeries,
  projectedPct,
  shortDate,
  type PayoffSeasonFile,
  type PayoffSeries,
  type PayoffSnapshotFile,
} from "@/lib/salary-payoff";

import snapshot from "./salary-payoff-snapshot.json";

const data = snapshot as unknown as PayoffSnapshotFile;

export type PayoffSeasonMeta = Pick<
  PayoffSeasonFile,
  "kind" | "opener" | "end" | "cap" | "minimum" | "pricePerWin" | "leftOut"
> & {
  season: string;
  dates: string[];
  /** Percent of salary paid out by each date. */
  pace: number[];
  /** Day of the last reading. */
  through: string;
  players: number;
};

export type PayoffSummary = PayoffSeries & {
  paidOff: string | null;
  projected: number | null;
  /** 1 covers the largest share of his salary. */
  rank: number;
};

/** Seasons with readings, newest first. */
export function payoffSeasons(): string[] {
  return Object.keys(data.seasons).sort().reverse();
}

/** The league year we're in; it rolls over July 1, before opening night. */
export function currentPayoffSeason(): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear());
}

/** Seasons a picker should offer: this league year plus every baked one, newest first. */
export function payoffSeasonOptions(): string[] {
  return [...new Set([currentPayoffSeason(), ...payoffSeasons()])].sort().reverse();
}

export type PayoffWaiting = {
  season: string;
  /** Opening night, when the schedule has it. */
  opener: string | null;
  /** The newest finished season with lines, to point at instead. */
  previous: string | null;
};

/** This league year before its first reading: show a note, never last season's lines. */
export function payoffWaiting(season: string): PayoffWaiting | null {
  if (season !== currentPayoffSeason() || data.seasons[season]?.dates.length) return null;
  return {
    season,
    opener: data.openers?.[season] ?? null,
    previous: payoffSeasons().find((s) => s < season) ?? null,
  };
}

function meta(season: string, file: PayoffSeasonFile): PayoffSeasonMeta {
  return {
    season,
    kind: file.kind,
    opener: file.opener,
    end: file.end,
    cap: file.cap,
    minimum: file.minimum,
    pricePerWin: file.pricePerWin,
    leftOut: file.leftOut,
    dates: file.dates,
    pace: paceSeries(file),
    through: file.dates.at(-1) ?? file.opener,
    players: Object.keys(file.players).length,
  };
}

const summaries = new Map<string, PayoffSummary[]>();

function seasonSummaries(season: string): PayoffSummary[] {
  const cached = summaries.get(season);
  if (cached) return cached;
  const file = data.seasons[season];
  if (!file) return [];
  const rows = Object.keys(file.players)
    .map((key) => payoffSeries(file, key))
    .filter((s): s is PayoffSeries => s != null)
    .map((s) => ({ ...s, paidOff: paidOffDate(s, file.dates), projected: projectedPct(s, file), rank: 0 }))
    .sort((a, b) => (b.pct.at(-1) ?? 0) - (a.pct.at(-1) ?? 0) || a.name.localeCompare(b.name));
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  summaries.set(season, rows);
  return rows;
}

/** Exactly this season (this league year by default), or null when it has no lines. */
export function getPayoffSeason(season?: string | null): { meta: PayoffSeasonMeta; players: PayoffSummary[] } | null {
  const key = season ?? currentPayoffSeason();
  const file = data.seasons[key];
  if (!file?.dates.length) return null;
  return { meta: meta(key, file), players: seasonSummaries(key) };
}

/** His line in exactly this season (this league year by default). */
export function getPlayerPayoff(
  nbaId: string | null | undefined,
  season?: string | null
): { meta: PayoffSeasonMeta; player: PayoffSummary } | null {
  const found = nbaId ? getPayoffSeason(season) : null;
  const player = found?.players.find((p) => p.nbaId === nbaId);
  return found && player ? { meta: found.meta, player } : null;
}

export type TeamPayoff = {
  meta: PayoffSeasonMeta;
  players: PayoffSummary[];
  total: { salary: number; earned: number[]; pct: number[]; ahead: number[] };
};

/** Players listed with this team (the team he's on now, for the whole season), plus their total. */
export function getTeamPayoff(espnTeamId: string, season?: string | null): TeamPayoff | null {
  const found = getPayoffSeason(season);
  if (!found) return null;
  const players = found.players.filter((p) => p.teamId === espnTeamId);
  if (!players.length) return null;
  const salary = players.reduce((s, p) => s + p.salary, 0);
  const earned = found.meta.dates.map((_, i) => players.reduce((s, p) => s + (p.earned[i] ?? 0), 0));
  const ahead = found.meta.dates.map((_, i) => players.reduce((s, p) => s + (p.ahead[i] ?? 0), 0));
  return { meta: found.meta, players, total: { salary, earned, pct: earned.map((e) => (e / salary) * 100), ahead } };
}

function nextSeason(season: string): string {
  const start = Number(season.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Where the lines come from for this season. */
export function payoffSourceNote(meta: PayoffSeasonMeta): string {
  if (meta.kind === "paced") {
    return `${meta.season} is over, so this is a preview: each player's full-season value is spread across his games by minutes played, which means hot and cold stretches don't show. Once ${nextSeason(meta.season)} starts, the lines follow a new DRBL reading after each night of games.`;
  }
  return `Updated after each night of games from DRBL's season-to-date numbers, through ${shortDate(meta.through)}. Early in the season a few games move these a lot.`;
}

/** How worth is counted. */
export function payoffMethodNote(meta: PayoffSeasonMeta): string {
  const price = `$${(meta.pricePerWin / 1e6).toFixed(1)}M`;
  const minimum = `$${(meta.minimum / 1e6).toFixed(1)}M`;
  return `Worth is what his wins above replacement would cost on the open market, ${price} a win at the ${meta.season} cap, plus the ${minimum} league minimum that a replacement player costs, spread evenly over the season. Everyone starts at 0 on opening night, and 100% means his play has covered his whole salary for the year. These are the same prices the contract surplus estimates use.`;
}

/** Who isn't on the board, so a missing player doesn't read as zero. */
export function payoffLeftOutNote(meta: PayoffSeasonMeta): string | null {
  const { partial, noValue } = meta.leftOut;
  const parts = [
    partial
      ? `${partial} ${partial === 1 ? "salary" : "salaries"} under the league minimum, which ${partial === 1 ? "covers" : "cover"} only part of a season (two-way and short-term deals)`
      : null,
    noValue
      ? `${noValue} salaried ${noValue === 1 ? "player" : "players"} we couldn't match to any DRBL minutes`
      : null,
  ].filter(Boolean);
  return parts.length ? `Left out rather than counted as zero: ${parts.join(", and ")}.` : null;
}

export type PayoffLineData = {
  id: string;
  name: string;
  teamId: string;
  salary: number;
  pct: number[];
  earned: number[];
  href: string | null;
  strong?: boolean;
};

/** One chart line, keeping only the sampled dates. */
export function payoffLine(
  p: Pick<PayoffSummary, "key" | "nbaId" | "name" | "teamId" | "salary" | "pct" | "earned">,
  indexes: number[],
  strong?: boolean
): PayoffLineData {
  return {
    id: p.key,
    name: p.name,
    teamId: p.teamId,
    salary: p.salary,
    pct: indexes.map((i) => Math.round((p.pct[i] ?? 0) * 10) / 10),
    earned: indexes.map((i) => Math.round((p.earned[i] ?? 0) / 1000) * 1000),
    href: p.nbaId ? `/players/${p.nbaId}` : null,
    strong,
  };
}

/** Evenly spaced date indexes, always keeping the first and last. */
export function sampleIndexes(length: number, max: number): number[] {
  if (length <= max) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (max - 1);
  return [...new Set(Array.from({ length: max }, (_, i) => Math.round(i * step)))];
}

/** URL pin id (ESPN from search, or NBA) to the NBA id lines are keyed by. */
export async function payoffPinIds(pin: string | undefined, season?: string | null): Promise<Map<string, string>> {
  const ids = [...new Set((pin ?? "").split(",").map((p) => p.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const known = new Set((getPayoffSeason(season)?.players ?? []).map((p) => p.nbaId).filter(Boolean));
  const aliases = await loadPlayerIdAliases();
  for (const id of ids) {
    const nbaId = known.has(id) ? id : aliases.byEspn.get(id)?.nbaPlayerId?.trim();
    if (nbaId && known.has(nbaId)) out.set(id, nbaId);
  }
  return out;
}
