export const TEAM_GAME_BOX_COLUMNS = [
  "date",
  "pts",
  "fgm",
  "fga",
  "tpm",
  "tpa",
  "ftm",
  "fta",
  "oreb",
  "dreb",
  "ast",
  "stl",
  "blk",
  "tov",
  "pf",
] as const;

/** One team's totals in one game. Date is the Eastern calendar date. */
export type TeamGameBoxRow = [
  date: string,
  pts: number,
  fgm: number,
  fga: number,
  tpm: number,
  tpa: number,
  ftm: number,
  fta: number,
  oreb: number,
  dreb: number,
  ast: number,
  stl: number,
  blk: number,
  tov: number,
  pf: number,
];

export type TeamGameBoxSnapshot = {
  generatedAt: string | null;
  source: string;
  columns: string[];
  /** season → ESPN team id → rows sorted by date */
  teams: Record<string, Record<string, TeamGameBoxRow[]>>;
};

export type TeamGameBox = {
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
};

export function teamGameBoxFromRow(row: TeamGameBoxRow): TeamGameBox {
  const [, pts, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, ast, stl, blk, tov, pf] = row;
  return { pts, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb: oreb + dreb, ast, stl, blk, tov, pf };
}
