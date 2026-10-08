import type { BoxScore, SeasonLine } from "./types";

export type StatLine = Pick<SeasonLine, "min" | "pts" | "reb" | "ast" | "stl" | "blk" | "tov" | "fgm" | "fga" | "tpm" | "tpa" | "ftm" | "fta"> & { gp: number };

export const EMPTY_LINE: StatLine = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };

export function sumBoxes(boxes: BoxScore[]): StatLine & { wins: number; losses: number; margin: number } {
  const out = { ...EMPTY_LINE, wins: 0, losses: 0, margin: 0 };
  for (const b of boxes) {
    if (b.teamScore > b.oppScore) out.wins++;
    else out.losses++;
    out.margin += b.teamScore - b.oppScore;
    if (b.min <= 0) continue;
    out.gp++;
    for (const k of ["min", "pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta"] as const) out[k] += b[k];
  }
  return out;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Advanced rates. Null means the denominator is zero, shown as a blank. */
export function advanced(l: StatLine) {
  return {
    ts: div(l.pts, 2 * (l.fga + 0.44 * l.fta)),
    efg: div(l.fgm + 0.5 * l.tpm, l.fga),
    fg: div(l.fgm, l.fga),
    tp: div(l.tpm, l.tpa),
    ft: div(l.ftm, l.fta),
    tpar: div(l.tpa, l.fga),
    ftr: div(l.fta, l.fga),
    astTov: div(l.ast, l.tov),
    pts36: div(l.pts * 36, l.min),
    reb36: div(l.reb * 36, l.min),
    ast36: div(l.ast * 36, l.min),
    stocks36: div((l.stl + l.blk) * 36, l.min),
    gmsc: div(gameScoreTotal(l), l.gp),
  };
}

/**
 * Simplified Hollinger Game Score. The sim has no offensive/defensive rebound
 * split or fouls, so rebounds count 0.4 each and fouls are left out.
 */
export function gameScoreTotal(l: Omit<StatLine, "gp">): number {
  return l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.4 * l.reb + l.stl + 0.7 * l.ast + 0.7 * l.blk - l.tov;
}

export const pct = (v: number | null, digits = 1) => (v === null ? "—" : `${(v * 100).toFixed(digits)}%`);
export const num = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
