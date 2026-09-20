/**
 * Player role phrases — behavior / shot-diet labels only.
 * Never consume DRBL, WAR, DARKO, or RAPTOR to pick the phrase.
 */

import type { PlayerSeason } from "@/data/types";
import type { Position } from "@/data/types/player";
import type { ShotZoneId } from "@/lib/shots/court-geometry";

export type PlayerRoleId =
  | "half_court_engine"
  | "secondary_initiator"
  | "volume_scorer"
  | "catch_and_shoot_spacer"
  | "cut_roll_finisher"
  | "post_paint_big"
  | "stretch_big"
  | "connector"
  | "unclear";

export type PlayerRoleShell = "guard" | "wing" | "big";

export type ShotDietKind =
  | "rim"
  | "paint"
  | "mid"
  | "corner"
  | "above_break"
  | "perimeter"
  | "inside"
  | "hybrid";

export type DefenseClauseId = "disruption" | "paint_protection";

export type PlayerRoleEvidence = {
  id: string;
  label: string;
  display: string;
};

export type PlayerRoleAssignment = {
  id: PlayerRoleId;
  /** Scout phrase shown under the name. */
  phrase: string;
  shell: PlayerRoleShell;
  diet: ShotDietKind;
  /** One short muted line under the phrase. */
  dietLine: string;
  defenseClause: DefenseClauseId | null;
  defenseLabel: string | null;
  confidence: number;
  evidence: PlayerRoleEvidence[];
  /** Why this phrase — for expand. */
  why: string[];
  season: string;
};

export const PLAYER_ROLE_PHRASES: Record<PlayerRoleId, string> = {
  half_court_engine: "Half-court engine",
  secondary_initiator: "Secondary initiator",
  volume_scorer: "Volume scorer",
  catch_and_shoot_spacer: "Catch-and-shoot spacer",
  cut_roll_finisher: "Cut / roll finisher",
  post_paint_big: "Post / paint big",
  stretch_big: "Stretch big",
  connector: "Connector",
  unclear: "Role unclear",
};

const DEFENSE_LABELS: Record<DefenseClauseId, string> = {
  disruption: "disruption on D",
  paint_protection: "paint protection",
};

const DIET_LINES: Record<ShotDietKind, string> = {
  rim: "Rim-heavy shot diet",
  paint: "Paint-heavy shot diet",
  mid: "Midrange-leaning shot diet",
  corner: "Corner-three heavy diet",
  above_break: "Above-break three diet",
  perimeter: "Perimeter-leaning shot diet",
  inside: "Inside-leaning shot diet",
  hybrid: "Hybrid shot diet",
};

export type ZoneShareInput = {
  zone: string;
  frequency: number;
  fga?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pctDisplay(fraction: number | null | undefined): string | null {
  if (fraction == null || !Number.isFinite(fraction)) return null;
  return `${Math.round(fraction * 100)}%`;
}

function normalizeZoneKey(zone: string): ShotZoneId | "OTHER" {
  const z = zone.trim().toUpperCase().replace(/\s+/g, "_");
  if (z === "RIM" || z.includes("RESTRICTED")) return "RIM";
  if (z === "PAINT_NON_RIM" || z.includes("PAINT") || z.includes("IN_THE_PAINT"))
    return "PAINT_NON_RIM";
  if (z.includes("SHORT_MID") || z === "SHORT_MIDRANGE") return "SHORT_MIDRANGE";
  if (z.includes("LONG_MID") || z === "LONG_MIDRANGE" || z.includes("MID-RANGE"))
    return "LONG_MIDRANGE";
  if (z.includes("LEFT_CORNER") || z === "LEFT_CORNER_3") return "LEFT_CORNER_3";
  if (z.includes("RIGHT_CORNER") || z === "RIGHT_CORNER_3")
    return "RIGHT_CORNER_3";
  if (
    z.includes("ABOVE_BREAK") ||
    z.includes("ABOVE-BREAK") ||
    z.includes("BREAK_3")
  )
    return "ABOVE_BREAK_3";
  if (z.includes("CORNER")) return "LEFT_CORNER_3";
  if (z.includes("HEAVE")) return "HEAVE";
  return "OTHER";
}

export function resolveRoleShell(
  position: Position | string | null | undefined,
  reboundPct: number | null | undefined
): PlayerRoleShell {
  const pos = String(position ?? "")
    .trim()
    .toUpperCase();
  const trb = reboundPct != null && Number.isFinite(reboundPct) ? reboundPct : 0;
  if (pos === "C" || pos.startsWith("C-") || pos.endsWith("-C")) return "big";
  if (pos === "PF" || pos.includes("PF")) {
    return trb >= 0.12 || pos === "PF" ? "big" : "wing";
  }
  if (trb >= 0.15) return "big";
  if (pos === "SF" || pos.includes("SF") || pos.includes("F")) return "wing";
  if (pos === "PG" || pos === "SG" || pos.includes("G")) return "guard";
  if (trb >= 0.12) return "big";
  return "wing";
}

export function resolveShotDiet(
  row: PlayerSeason,
  zones?: ZoneShareInput[] | null
): ShotDietKind {
  const threePar = row.threePointAttemptRate;
  if (zones?.length) {
    const totals = {
      rim: 0,
      paint: 0,
      mid: 0,
      corner: 0,
      above: 0,
      other: 0,
    };
    let located = 0;
    for (const z of zones) {
      if (!Number.isFinite(z.frequency) || z.frequency <= 0) continue;
      const key = normalizeZoneKey(z.zone);
      located += z.frequency;
      if (key === "RIM") totals.rim += z.frequency;
      else if (key === "PAINT_NON_RIM") totals.paint += z.frequency;
      else if (key === "SHORT_MIDRANGE" || key === "LONG_MIDRANGE")
        totals.mid += z.frequency;
      else if (key === "LEFT_CORNER_3" || key === "RIGHT_CORNER_3")
        totals.corner += z.frequency;
      else if (key === "ABOVE_BREAK_3") totals.above += z.frequency;
      else totals.other += z.frequency;
    }
    if (located >= 0.55) {
      const ranked: Array<[ShotDietKind, number]> = [
        ["rim", totals.rim],
        ["paint", totals.paint],
        ["mid", totals.mid],
        ["corner", totals.corner],
        ["above_break", totals.above],
      ];
      ranked.sort((a, b) => b[1] - a[1]);
      const top = ranked[0]!;
      const second = ranked[1]!;
      if (top[1] >= 0.38 && top[1] - second[1] >= 0.08) return top[0];
      if (totals.corner + totals.above >= 0.4) {
        return totals.corner >= totals.above ? "corner" : "above_break";
      }
      if (totals.rim + totals.paint >= 0.45) {
        return totals.rim >= totals.paint ? "rim" : "paint";
      }
      return "hybrid";
    }
  }

  if (Number.isFinite(threePar)) {
    if (threePar >= 0.45) return "perimeter";
    if (threePar <= 0.18) return "inside";
  }
  return "hybrid";
}

function defenseClause(
  row: PlayerSeason,
  shell: PlayerRoleShell
): DefenseClauseId | null {
  const stl = row.stealPct;
  const blk = row.blockPct;
  const deflections = row.hustleDeflections;
  const contested = row.hustleContestedShots;
  const gp = Math.max(1, row.gamesPlayed);

  if (shell === "big") {
    if (blk != null && blk >= 0.045) return "paint_protection";
    if (contested != null && contested / gp >= 4.5) return "paint_protection";
    return null;
  }

  if (stl != null && stl >= 0.025) return "disruption";
  if (deflections != null && deflections / gp >= 1.8) return "disruption";
  return null;
}

function scoreRoles(input: {
  usg: number;
  ast: number;
  threePar: number;
  tov: number;
  shell: PlayerRoleShell;
  diet: ShotDietKind;
}): Array<{ id: Exclude<PlayerRoleId, "unclear">; score: number }> {
  const { usg, ast, threePar, tov, shell, diet } = input;
  const inside =
    diet === "rim" ||
    diet === "paint" ||
    diet === "inside" ||
    threePar <= 0.2;
  const perimeter =
    diet === "perimeter" ||
    diet === "corner" ||
    diet === "above_break" ||
    threePar >= 0.38;

  const scores: Record<Exclude<PlayerRoleId, "unclear">, number> = {
    half_court_engine: 0,
    secondary_initiator: 0,
    volume_scorer: 0,
    catch_and_shoot_spacer: 0,
    cut_roll_finisher: 0,
    post_paint_big: 0,
    stretch_big: 0,
    connector: 0,
  };

  // Creation / scoring load
  if (usg >= 0.27 && ast >= 0.24) scores.half_court_engine += 4;
  if (usg >= 0.24 && ast >= 0.28) scores.half_court_engine += 1.5;
  if (usg >= 0.2 && usg < 0.28 && ast >= 0.2) scores.secondary_initiator += 3.5;
  if (usg >= 0.18 && usg < 0.26 && ast >= 0.24) scores.secondary_initiator += 1;
  if (usg >= 0.27 && ast < 0.18) scores.volume_scorer += 4;
  if (usg >= 0.3 && ast < 0.22) scores.volume_scorer += 1.5;

  // Spacer / connector / finisher
  if (usg < 0.22 && threePar >= 0.4) scores.catch_and_shoot_spacer += 4;
  if (usg < 0.2 && perimeter) scores.catch_and_shoot_spacer += 1.5;
  if (usg < 0.2 && ast >= 0.14 && tov <= 0.14) scores.connector += 3.2;
  if (usg < 0.18 && ast >= 0.18) scores.connector += 1.2;
  if (usg < 0.24 && inside) scores.cut_roll_finisher += 3.5;
  if (usg < 0.22 && (diet === "rim" || diet === "paint"))
    scores.cut_roll_finisher += 1.5;

  // Big shells
  if (shell === "big") {
    scores.post_paint_big += inside ? 3.5 : 0.5;
    scores.stretch_big += threePar >= 0.25 ? 4 : 0;
    if (threePar >= 0.3) scores.stretch_big += 1.5;
    if (threePar < 0.2) scores.post_paint_big += 2.5;
    // Finisher label is for wings/guards who dive — bigs use paint/post.
    scores.cut_roll_finisher *= 0.2;
    // Suppress guard-coded roles for true bigs unless creation is extreme
    if (usg < 0.28) {
      scores.half_court_engine *= 0.35;
      scores.volume_scorer *= 0.45;
      scores.catch_and_shoot_spacer *= 0.4;
    }
  } else {
    scores.post_paint_big *= 0.15;
    scores.stretch_big *= 0.2;
  }

  if (shell === "guard" && usg < 0.18 && inside) {
    scores.cut_roll_finisher += 0.8;
  }

  return (Object.entries(scores) as Array<
    [Exclude<PlayerRoleId, "unclear">, number]
  >)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Assign a scout-phrase role from season shape + optional zone diet.
 * Impact ratings are intentionally ignored.
 */
export function assignPlayerRole(options: {
  row: PlayerSeason;
  zones?: ZoneShareInput[] | null;
  position?: Position | string | null;
}): PlayerRoleAssignment | null {
  const { row } = options;
  if (!row || row.gamesPlayed < 15) return null;

  const usg = row.usagePct;
  const ast = row.assistPct;
  if (usg == null || !Number.isFinite(usg) || !Number.isFinite(ast)) {
    return null;
  }

  const threePar = Number.isFinite(row.threePointAttemptRate)
    ? row.threePointAttemptRate
    : 0;
  const tov = Number.isFinite(row.turnoverPct) ? row.turnoverPct : 0.12;
  const shell = resolveRoleShell(
    options.position ?? row.position,
    row.reboundPct
  );
  const diet = resolveShotDiet(row, options.zones);
  const ranked = scoreRoles({ usg, ast, threePar, tov, shell, diet });
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < 2.2) {
    return {
      id: "unclear",
      phrase: PLAYER_ROLE_PHRASES.unclear,
      shell,
      diet,
      dietLine: DIET_LINES[diet],
      defenseClause: null,
      defenseLabel: null,
      confidence: clamp01(top?.score ? top.score / 6 : 0),
      evidence: buildEvidence(row),
      why: ["Not enough separation in usage, creation, and shot diet."],
      season: row.season,
    };
  }

  const margin = top.score - (second?.score ?? 0);
  const minutesFactor = Math.min(
    1,
    (row.minutes || row.gamesPlayed * 20) / (row.gamesPlayed * 28)
  );
  const confidence = clamp01(
    0.35 + margin * 0.18 + Math.min(0.25, top.score / 12) * minutesFactor
  );

  const id: PlayerRoleId =
    confidence < 0.42 && margin < 0.9 ? "unclear" : top.id;
  const defense = id === "unclear" ? null : defenseClause(row, shell);

  const why: string[] = [];
  why.push(
    `Usage ${pctDisplay(usg)} · assist rate ${pctDisplay(ast)} · 3PAr ${pctDisplay(threePar)}`
  );
  why.push(`${DIET_LINES[diet]}.`);
  if (shell === "big") why.push("Sized as a big from position / rebound rate.");
  if (defense) why.push(`Defensive clause: ${DEFENSE_LABELS[defense]}.`);
  why.push("Describes how they're used — not how good they are.");

  return {
    id,
    phrase: PLAYER_ROLE_PHRASES[id],
    shell,
    diet,
    dietLine: DIET_LINES[diet],
    defenseClause: defense,
    defenseLabel: defense ? DEFENSE_LABELS[defense] : null,
    confidence,
    evidence: buildEvidence(row),
    why,
    season: row.season,
  };
}

function buildEvidence(row: PlayerSeason): PlayerRoleEvidence[] {
  const out: PlayerRoleEvidence[] = [];
  const usg = pctDisplay(row.usagePct);
  const ast = pctDisplay(row.assistPct);
  const three = pctDisplay(row.threePointAttemptRate);
  if (usg) out.push({ id: "usg", label: "USG", display: usg });
  if (ast) out.push({ id: "ast", label: "AST%", display: ast });
  if (three) out.push({ id: "three", label: "3PAr", display: three });
  return out;
}
