import type { PlayerSeason } from "@/data/types";

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Season totals from stats.nba.com leaguehustlestatsplayer (PerMode=Totals). */
export type HustleSeasonPatch = Pick<
  PlayerSeason,
  | "hustleContestedShots"
  | "hustleDeflections"
  | "hustleChargesDrawn"
  | "hustleScreenAssists"
  | "hustleLooseBallsRecovered"
  | "hustleBoxOuts"
>;

/** Integer counting total from a Totals-mode hustle row (never invent from rates). */
function totalCount(
  row: Record<string, string | number | null>,
  field: string
): number | undefined {
  const raw = num(row[field]);
  if (raw == null) return undefined;
  // Totals endpoints publish whole counts; round only to absorb float noise.
  return Math.round(raw);
}

/**
 * Map one leaguehustlestatsplayer Totals row to optional hustle season totals.
 * Returns an empty object when the player has no published hustle line.
 */
export function hustlePatchFromStatsNbaRow(
  row: Record<string, string | number | null>
): Partial<HustleSeasonPatch> {
  const gp = num(row.G) ?? num(row.GP) ?? 0;
  if (gp <= 0) return {};

  const contested = totalCount(row, "CONTESTED_SHOTS");
  const deflections = totalCount(row, "DEFLECTIONS");
  const charges = totalCount(row, "CHARGES_DRAWN");
  const screens = totalCount(row, "SCREEN_ASSISTS");
  const loose = totalCount(row, "LOOSE_BALLS_RECOVERED");
  const boxOuts = totalCount(row, "BOX_OUTS");

  if (
    contested == null &&
    deflections == null &&
    charges == null &&
    screens == null &&
    loose == null &&
    boxOuts == null
  ) {
    return {};
  }

  return {
    ...(contested != null ? { hustleContestedShots: contested } : {}),
    ...(deflections != null ? { hustleDeflections: deflections } : {}),
    ...(charges != null ? { hustleChargesDrawn: charges } : {}),
    ...(screens != null ? { hustleScreenAssists: screens } : {}),
    ...(loose != null ? { hustleLooseBallsRecovered: loose } : {}),
    ...(boxOuts != null ? { hustleBoxOuts: boxOuts } : {}),
  };
}

export function hasHustleStats(
  row: Pick<
    PlayerSeason,
    | "hustleContestedShots"
    | "hustleDeflections"
    | "hustleChargesDrawn"
    | "hustleScreenAssists"
    | "hustleLooseBallsRecovered"
    | "hustleBoxOuts"
  >
): boolean {
  return (
    row.hustleContestedShots != null ||
    row.hustleDeflections != null ||
    row.hustleChargesDrawn != null ||
    row.hustleScreenAssists != null ||
    row.hustleLooseBallsRecovered != null ||
    row.hustleBoxOuts != null
  );
}

export function hustlePerGame(
  row: PlayerSeason,
  key: keyof HustleSeasonPatch
): number | null {
  const total = row[key];
  if (total == null || !Number.isFinite(total)) return null;
  return total / Math.max(1, row.gamesPlayed);
}

export type TeamHustleAggregate = {
  contestedShots: number;
  deflections: number;
  chargesDrawn: number;
  screenAssists: number;
  looseBalls: number;
  boxOuts: number;
  playersWithData: number;
  rosterSize: number;
  /** Max GP among roster rows with hustle (proxy for team games played). */
  teamGames: number;
};

function sumOptional(rows: PlayerSeason[], key: keyof HustleSeasonPatch): number {
  return rows.reduce((acc, row) => {
    const v = row[key];
    return acc + (v != null && Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Sum hustle season totals across an actual team roster (not league team table). */
export function aggregateTeamHustleFromRoster(
  roster: PlayerSeason[]
): TeamHustleAggregate | null {
  const withHustle = roster.filter(hasHustleStats);
  if (!withHustle.length) return null;
  const teamGames = Math.max(
    ...withHustle.map((row) => row.gamesPlayed || 0),
    1
  );
  return {
    contestedShots: sumOptional(withHustle, "hustleContestedShots"),
    deflections: sumOptional(withHustle, "hustleDeflections"),
    chargesDrawn: sumOptional(withHustle, "hustleChargesDrawn"),
    screenAssists: sumOptional(withHustle, "hustleScreenAssists"),
    looseBalls: sumOptional(withHustle, "hustleLooseBallsRecovered"),
    boxOuts: sumOptional(withHustle, "hustleBoxOuts"),
    playersWithData: withHustle.length,
    rosterSize: roster.length,
    teamGames,
  };
}

export function teamHustlePerGame(
  totals: TeamHustleAggregate,
  key: keyof Pick<
    TeamHustleAggregate,
    | "contestedShots"
    | "deflections"
    | "chargesDrawn"
    | "screenAssists"
    | "looseBalls"
    | "boxOuts"
  >
): number {
  return totals[key] / Math.max(1, totals.teamGames);
}
