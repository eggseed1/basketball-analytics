import { randomItem, type ArcadeLeague, type ArcadeRow } from "@/arcade/league";

export type HigherLowerStatId = "vorp" | "darko" | "pts" | "trb" | "ast";

export type HigherLowerStat = {
  id: HigherLowerStatId;
  label: string;
  /** Short wheel label. */
  short: string;
  blurb: string;
  value: (row: ArcadeRow) => number | null;
  format: (value: number) => string;
};

const oneDecimal = (value: number) => value.toFixed(1);
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

export const HIGHER_LOWER_STATS: HigherLowerStat[] = [
  {
    id: "vorp",
    label: "VORP",
    short: "VORP",
    blurb: "Value over replacement player: a season total of box-score value above a fringe roster player.",
    value: (row) => row.vorp,
    format: oneDecimal,
  },
  {
    id: "darko",
    label: "DARKO",
    short: "DARKO",
    blurb: "An impact rating in points per 100 possessions above an average player.",
    value: (row) => row.darko,
    format: signed,
  },
  {
    id: "pts",
    label: "Points per game",
    short: "PTS",
    blurb: "Points per game that season.",
    value: (row) => row.pts,
    format: oneDecimal,
  },
  {
    id: "trb",
    label: "Rebounds per game",
    short: "REB",
    blurb: "Total rebounds per game that season.",
    value: (row) => row.trb,
    format: oneDecimal,
  },
  {
    id: "ast",
    label: "Assists per game",
    short: "AST",
    blurb: "Assists per game that season.",
    value: (row) => row.ast,
    format: oneDecimal,
  },
];

/** Enough minutes that the season is one people might remember. */
export const HIGHER_LOWER_MIN_MINUTES = 1500;

export function higherLowerPool(league: ArcadeLeague, stat: HigherLowerStat): ArcadeRow[] {
  return league.rows.filter(
    (row) => row.mp >= HIGHER_LOWER_MIN_MINUTES && stat.value(row) != null
  );
}

/** Next season to guess: a different player, with a value that differs from the shown one. */
export function nextHigherLowerRow(
  pool: ArcadeRow[],
  stat: HigherLowerStat,
  current: ArcadeRow | null,
  rng: () => number = Math.random
): ArcadeRow {
  for (let tries = 0; tries < 50; tries += 1) {
    const row = randomItem(pool, rng);
    if (!current) return row;
    if (row.pid !== current.pid && stat.value(row) !== stat.value(current)) return row;
  }
  return randomItem(pool, rng);
}

/** Ties are not possible by construction, but count as correct either way. */
export function judgeHigherLower(
  guess: "higher" | "lower",
  shown: number,
  hidden: number
): boolean {
  return guess === "higher" ? hidden >= shown : hidden <= shown;
}
