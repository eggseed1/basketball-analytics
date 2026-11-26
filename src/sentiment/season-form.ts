/**
 * This season's production for the players sentiment follows. Joined by player
 * id at read time, so it stays as fresh as the nightly season tables instead of
 * waiting on a sentiment rebuild. Pure; the file reads live in
 * `@/data/queries/sentiment-season-form`.
 */

export type SeasonForm = {
  season: string;
  gp: number;
  /** Minutes per game. */
  mpg: number;
  /** Box plus/minus per 100 possessions. */
  bpm: number;
  vorp: number | null;
  per: number | null;
  pts: number | null;
};

/** One row of the season tables, reduced to what the join needs. */
export type SeasonFormRow = {
  espnId?: string;
  nbaId?: string;
  gp: number;
  /** Total minutes. */
  mp: number;
  bpm: number;
  vorp?: number | null;
  per?: number | null;
  pts?: number | null;
};

/** Enough games and minutes for BPM to mean something. */
export const FORM_MIN_GP = 8;
export const FORM_MIN_MPG = 15;
/** Regular rotation: the floor for the home movers card. */
export const ROTATION_MIN_MPG = 18;

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Index by every id a row carries; a player on two teams keeps the longer stint. */
export function buildSeasonFormIndex(
  season: string,
  rows: readonly SeasonFormRow[]
): Map<string, SeasonForm> {
  const index = new Map<string, SeasonForm>();
  for (const row of rows) {
    const bpm = finite(row.bpm);
    if (bpm == null || !(row.gp > 0) || !(row.mp > 0)) continue;
    const form: SeasonForm = {
      season,
      gp: row.gp,
      mpg: Math.round((row.mp / row.gp) * 10) / 10,
      bpm,
      vorp: finite(row.vorp),
      per: finite(row.per),
      pts: finite(row.pts),
    };
    for (const id of [row.espnId, row.nbaId]) {
      if (!id) continue;
      const prev = index.get(id);
      if (!prev || form.gp > prev.gp) index.set(id, form);
    }
  }
  return index;
}

export function seasonFormFor(
  playerIds: readonly string[],
  index: ReadonlyMap<string, SeasonForm>
): SeasonForm | undefined {
  for (const id of playerIds) {
    const hit = index.get(String(id));
    if (hit) return hit;
  }
  return undefined;
}

/** Sample big enough to rank BPM against other players. */
export function qualifiesForForm(form: SeasonForm | undefined): form is SeasonForm {
  return form != null && form.gp >= FORM_MIN_GP && form.mpg >= FORM_MIN_MPG;
}

export function isRotationPlayer(form: SeasonForm | undefined): form is SeasonForm {
  return form != null && form.gp >= FORM_MIN_GP && form.mpg >= ROTATION_MIN_MPG;
}

export function formatBpm(bpm: number): string {
  const rounded = Math.round(bpm * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(1)}`;
}
