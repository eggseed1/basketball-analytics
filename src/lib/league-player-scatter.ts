/**
 * League-board scatters for Explore → Players → Visualizations.
 * Same qualified-peer pool as usage × efficiency.
 */
import type { PlayerSeason } from "@/data/types";

export type LeagueScatterPoint = {
  playerId: string;
  playerName: string;
  teamId?: string;
  teamAbbr?: string;
  /** Chart X (already in display units, e.g. percent points). */
  x: number;
  /** Chart Y (already in display units). */
  y: number;
  minutes: number;
  isSelf: boolean;
  /** Raw tooltip strings */
  xTooltip: string;
  yTooltip: string;
};

export type LeagueScatterKind =
  | "diet"
  | "creation"
  | "volume"
  | "impact"
  | "ft"
  | "glass"
  | "defense"
  | "bpm";

function isQualified(row: PlayerSeason, minMinutes: number): boolean {
  if (minMinutes <= 0) return true;
  return Number.isFinite(row.minutes) && row.minutes >= minMinutes;
}

function asFraction(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  return raw > 1.5 ? raw / 100 : raw;
}

function pctLabel(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function impactValue(row: PlayerSeason): number | null {
  const darko = row.darkoDpm ?? row.dpm;
  if (darko != null && Number.isFinite(darko) && darko !== 0) return darko;
  const drbl = row.drbl100;
  if (drbl != null && Number.isFinite(drbl) && drbl !== 0) return drbl;
  return null;
}

function impactLabel(row: PlayerSeason, value: number): string {
  if (row.darkoDpm != null && Number.isFinite(row.darkoDpm) && row.darkoDpm !== 0) {
    return `DARKO ${value.toFixed(2)}`;
  }
  if (row.dpm != null && Number.isFinite(row.dpm) && row.dpm !== 0) {
    return `DPM ${value.toFixed(2)}`;
  }
  return `DRBL/100 ${value.toFixed(2)}`;
}

export function leagueScatterMeta(kind: LeagueScatterKind): {
  title: string;
  blurb: string;
  xLabel: string;
  yLabel: string;
  /** Allow negative axis values (impact metrics). */
  allowNegativeY?: boolean;
} {
  switch (kind) {
    case "diet":
      return {
        title: "Shot diet",
        blurb:
          "Three-point attempt rate × three-point accuracy among qualified peers.",
        xLabel: "3PAr %",
        yLabel: "3P %",
      };
    case "creation":
      return {
        title: "Creation",
        blurb:
          "Assist rate × turnover rate — who generates offense vs who coughs it up.",
        xLabel: "AST %",
        yLabel: "TOV %",
      };
    case "volume":
      return {
        title: "Scoring volume",
        blurb: "Points per game × minutes — scoring load among qualified peers.",
        xLabel: "PPG",
        yLabel: "Minutes",
      };
    case "impact":
      return {
        title: "Usage vs impact",
        blurb:
          "Usage rate × DARKO (or DRBL/100) — high-usage creators vs efficient role players.",
        xLabel: "Usage %",
        yLabel: "Impact",
        allowNegativeY: true,
      };
    case "ft":
      return {
        title: "Free-throw pressure",
        blurb:
          "Free-throw rate × true shooting — who lives at the line and who converts overall.",
        xLabel: "FT rate %",
        yLabel: "TS %",
      };
    case "glass":
      return {
        title: "Glass work",
        blurb:
          "Offensive rebound rate × defensive rebound rate among qualified peers.",
        xLabel: "ORB %",
        yLabel: "DRB %",
      };
    case "defense":
      return {
        title: "Stocks",
        blurb:
          "Steal rate × block rate — disruptive defenders among qualified peers.",
        xLabel: "STL %",
        yLabel: "BLK %",
      };
    case "bpm":
      return {
        title: "Usage vs BPM",
        blurb:
          "Usage rate × box plus-minus — board impact without DARKO/DRBL overlays.",
        xLabel: "Usage %",
        yLabel: "BPM",
        allowNegativeY: true,
      };
  }
}

export function buildLeagueScatterPoints(
  peers: PlayerSeason[],
  kind: LeagueScatterKind,
  focalIds: ReadonlySet<string>,
  options: { minMinutes?: number; forceIncludeIds?: ReadonlySet<string> } = {}
): LeagueScatterPoint[] {
  const minMinutes = options.minMinutes ?? 500;
  const forceInclude = options.forceIncludeIds ?? focalIds;
  const out: LeagueScatterPoint[] = [];

  for (const row of peers) {
    const forced = forceInclude.has(row.playerId);
    if (!forced && !isQualified(row, minMinutes)) continue;

    let x: number | null = null;
    let y: number | null = null;
    let xTooltip = "";
    let yTooltip = "";

    if (kind === "diet") {
      const ar = asFraction(row.threePointAttemptRate);
      const pct = asFraction(row.threePointPct);
      if (ar == null || pct == null) continue;
      if (
        !forced &&
        (ar > 0.85 || pct > 0.65 || row.threePointersAttempted < 20)
      ) {
        continue;
      }
      x = ar * 100;
      y = pct * 100;
      xTooltip = `3PAr ${pctLabel(ar)}`;
      yTooltip = `3P ${pctLabel(pct)}`;
    } else if (kind === "creation") {
      const ast = asFraction(row.assistPct);
      const tov = asFraction(row.turnoverPct);
      if (ast == null || tov == null) continue;
      if (!forced && (ast > 0.55 || tov > 0.35)) continue;
      x = ast * 100;
      y = tov * 100;
      xTooltip = `AST% ${pctLabel(ast)}`;
      yTooltip = `TOV% ${pctLabel(tov)}`;
    } else if (kind === "volume") {
      const gp = Math.max(1, row.gamesPlayed);
      const ppg = row.points / gp;
      if (!Number.isFinite(ppg) || ppg < 0) continue;
      if (!forced && (ppg > 45 || row.minutes < 200)) continue;
      x = Number(ppg.toFixed(2));
      y = Math.round(row.minutes);
      xTooltip = `${ppg.toFixed(1)} PPG`;
      yTooltip = `${Math.round(row.minutes)} MIN`;
    } else if (kind === "impact") {
      const usg = asFraction(row.usagePct);
      const impact = impactValue(row);
      if (usg == null || impact == null) continue;
      if (!forced && (usg > 0.55 || Math.abs(impact) > 12)) continue;
      x = usg * 100;
      y = Number(impact.toFixed(2));
      xTooltip = `USG ${pctLabel(usg)}`;
      yTooltip = impactLabel(row, impact);
    } else if (kind === "ft") {
      const ftr = asFraction(row.freeThrowRate);
      const ts = asFraction(row.trueShootingPct);
      if (ftr == null || ts == null) continue;
      if (!forced && (ftr > 0.9 || ts > 0.8)) continue;
      x = ftr * 100;
      y = ts * 100;
      xTooltip = `FTr ${pctLabel(ftr)}`;
      yTooltip = `TS ${pctLabel(ts)}`;
    } else if (kind === "glass") {
      const orb = asFraction(row.offensiveReboundPct);
      const drb = asFraction(row.defensiveReboundPct);
      if (orb == null || drb == null) continue;
      if (!forced && (orb > 0.35 || drb > 0.45)) continue;
      x = orb * 100;
      y = drb * 100;
      xTooltip = `ORB% ${pctLabel(orb)}`;
      yTooltip = `DRB% ${pctLabel(drb)}`;
    } else if (kind === "defense") {
      const stl = asFraction(row.stealPct);
      const blk = asFraction(row.blockPct);
      if (stl == null || blk == null) continue;
      if (!forced && (stl > 0.08 || blk > 0.12)) continue;
      x = stl * 100;
      y = blk * 100;
      xTooltip = `STL% ${pctLabel(stl)}`;
      yTooltip = `BLK% ${pctLabel(blk)}`;
    } else {
      // bpm
      const usg = asFraction(row.usagePct);
      const bpm = row.bpm;
      if (usg == null || bpm == null || !Number.isFinite(bpm)) continue;
      if (!forced && (usg > 0.55 || Math.abs(bpm) > 15 || bpm === 0)) continue;
      x = usg * 100;
      y = Number(bpm.toFixed(2));
      xTooltip = `USG ${pctLabel(usg)}`;
      yTooltip = `BPM ${bpm.toFixed(2)}`;
    }

    out.push({
      playerId: row.playerId,
      playerName: row.playerName,
      teamId: row.teamId,
      teamAbbr: row.teamAbbreviation,
      x,
      y,
      minutes: row.minutes,
      isSelf: focalIds.has(row.playerId),
      xTooltip,
      yTooltip,
    });
  }

  return out;
}

/** Primary ranking value for field-size / Highest·Both·Lowest on scatters. */
export function leagueScatterRankValue(
  kind: LeagueScatterKind,
  point: Pick<LeagueScatterPoint, "x" | "y">
): number {
  switch (kind) {
    case "impact":
    case "bpm":
      return point.y;
    case "defense":
      return point.x + point.y;
    case "ft":
      return point.y;
    case "volume":
    case "diet":
    case "creation":
    case "glass":
    default:
      return point.x;
  }
}

/** Signed Y scatters default to Both so negatives stay on the board. */
export function leagueScatterDefaultRankEnd(
  kind: LeagueScatterKind
): "high" | "low" | "both" {
  return kind === "impact" || kind === "bpm" ? "both" : "high";
}

export function leagueScatterMedians(points: LeagueScatterPoint[]): {
  x: number | null;
  y: number | null;
} {
  if (!points.length) return { x: null, y: null };
  const xs = [...points.map((p) => p.x)].sort((a, b) => a - b);
  const ys = [...points.map((p) => p.y)].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return {
    x: xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2,
    y: ys.length % 2 ? ys[mid]! : (ys[mid - 1]! + ys[mid]!) / 2,
  };
}
