/**
 * Player style phrases — behavior / shot-diet labels only.
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

/** Normalized affinity for one style (weights sum to ~1 across the mix). */
export type PlayerRoleMixEntry = {
  id: Exclude<PlayerRoleId, "unclear">;
  phrase: string;
  /** Raw score from the scorer. */
  score: number;
  /** Share of positive style mass (0–1). */
  weight: number;
};

export type PlayerRoleAssignment = {
  id: PlayerRoleId;
  /** Scout phrase shown under the name. */
  phrase: string;
  /** One-line catalog blurb for the assigned style. */
  blurb: string;
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
  /** Runner-up phrase when close, for the expand panel. */
  runnerUp: string | null;
  /** Runner-up role id when close. */
  runnerUpId: Exclude<PlayerRoleId, "unclear"> | null;
  /**
   * Soft mix of the top styles (usually 4). Used for affinity bars / radar.
   * Empty when the assignment is unclear.
   */
  roleMix: PlayerRoleMixEntry[];
};

export function playerRoleBlurb(id: PlayerRoleId): string {
  if (id === "unclear") {
    return "Usage, creation, and shot diet do not separate cleanly for this season.";
  }
  return (
    PLAYER_ROLE_CATALOG.find((entry) => entry.id === id)?.blurb ??
    PLAYER_ROLE_PHRASES[id]
  );
}

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

/** Directory order (creation → scoring → spacing → bigs). */
export const PLAYER_ROLE_ORDER: Array<Exclude<PlayerRoleId, "unclear">> = [
  "half_court_engine",
  "secondary_initiator",
  "volume_scorer",
  "connector",
  "catch_and_shoot_spacer",
  "cut_roll_finisher",
  "stretch_big",
  "post_paint_big",
];

export type PlayerRoleCatalogEntry = {
  id: Exclude<PlayerRoleId, "unclear">;
  phrase: string;
  blurb: string;
};

export const PLAYER_ROLE_CATALOG: PlayerRoleCatalogEntry[] = [
  {
    id: "half_court_engine",
    phrase: PLAYER_ROLE_PHRASES.half_court_engine,
    blurb: "High usage with real creation. Starts offense for themselves and teammates.",
  },
  {
    id: "secondary_initiator",
    phrase: PLAYER_ROLE_PHRASES.secondary_initiator,
    blurb: "Shared creation load. Runs actions without carrying the whole offense.",
  },
  {
    id: "volume_scorer",
    phrase: PLAYER_ROLE_PHRASES.volume_scorer,
    blurb: "Heavy shot diet, lighter creation. Most of the job is scoring.",
  },
  {
    id: "connector",
    phrase: PLAYER_ROLE_PHRASES.connector,
    blurb: "Keeps the ball moving. Lower usage, useful assist rate, careful with turnovers.",
  },
  {
    id: "catch_and_shoot_spacer",
    phrase: PLAYER_ROLE_PHRASES.catch_and_shoot_spacer,
    blurb: "Lives on catch-and-shoot threes. Low usage, high three-point rate.",
  },
  {
    id: "cut_roll_finisher",
    phrase: PLAYER_ROLE_PHRASES.cut_roll_finisher,
    blurb: "Finishes inside on cuts and rolls. Rarely starts the offense.",
  },
  {
    id: "stretch_big",
    phrase: PLAYER_ROLE_PHRASES.stretch_big,
    blurb: "Big who spaces the floor. Threes are a real part of the job.",
  },
  {
    id: "post_paint_big",
    phrase: PLAYER_ROLE_PHRASES.post_paint_big,
    blurb: "Big who works inside. Paint touches over perimeter volume.",
  },
];

const DEFENSE_LABELS: Record<DefenseClauseId, string> = {
  disruption: "Disrupts on defense",
  paint_protection: "Protects the paint",
};

const DIET_LINES: Record<ShotDietKind, string> = {
  rim: "Rim-heavy",
  paint: "Paint-heavy",
  mid: "Midrange-leaning",
  corner: "Corner-three heavy",
  above_break: "Above-the-break threes",
  perimeter: "Perimeter-leaning",
  inside: "Lives inside the arc",
  hybrid: "Hybrid",
};

const SHELL_LABELS: Record<PlayerRoleShell, string> = {
  guard: "Guard",
  wing: "Wing",
  big: "Big",
};

export function playerRoleShellLabel(shell: PlayerRoleShell): string {
  return SHELL_LABELS[shell];
}

export function playerRoleDietLabel(diet: ShotDietKind): string {
  return DIET_LINES[diet];
}

export function isAssignedPlayerRoleId(
  value: string | null | undefined
): value is Exclude<PlayerRoleId, "unclear"> {
  return PLAYER_ROLE_ORDER.includes(value as Exclude<PlayerRoleId, "unclear">);
}

export type ZoneShareInput = {
  zone: string;
  frequency: number;
  fga?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** 0 below lo, 1 above hi, linear between. */
export function ramp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return 0;
  if (hi <= lo) return x >= hi ? 1 : 0;
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  return (x - lo) / (hi - lo);
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

export type RoleShellSignals = {
  reboundPct?: number | null;
  blockPct?: number | null;
  assistPct?: number | null;
  usagePct?: number | null;
  threePointAttemptRate?: number | null;
};

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

/**
 * Centers are bigs. A forward is a big only when he rebounds like one and
 * also protects the rim, lives inside, or rarely creates. A PF listing alone
 * is not enough: Tatum and Siakam are listed PF and play on the wing.
 */
export function resolveRoleShell(
  position: Position | string | null | undefined,
  signals: RoleShellSignals | number | null | undefined
): PlayerRoleShell {
  const s: RoleShellSignals =
    typeof signals === "number" || signals == null
      ? { reboundPct: signals ?? null }
      : signals;
  const pos = String(position ?? "")
    .trim()
    .toUpperCase();
  if (pos === "C" || pos.startsWith("C-") || pos.endsWith("-C")) return "big";
  if (pos === "PG" || pos === "SG" || (pos.includes("G") && !pos.includes("F"))) {
    return "guard";
  }

  const trb = finite(s.reboundPct) ?? 0;
  const blk = finite(s.blockPct);
  const ast = finite(s.assistPct);
  const usg = finite(s.usagePct);
  const threePar = finite(s.threePointAttemptRate);
  const creator = ast != null && usg != null && ast >= 0.2 && usg >= 0.22;
  const inside = threePar != null && threePar < 0.12;
  const rimProtector = blk != null && blk >= 0.03;
  const perimeterHeavy = threePar != null && threePar >= 0.35;

  if (trb >= 0.14 && (rimProtector || inside || (!creator && !perimeterHeavy))) {
    return "big";
  }
  if (inside && trb >= 0.1 && (pos.includes("PF") || pos === "F")) return "big";
  return "wing";
}

export function resolveShotDiet(
  row: PlayerSeason,
  zones?: ZoneShareInput[] | null
): ShotDietKind {
  const threePar = row.threePointAttemptRate;
  const ftr = finite(row.freeThrowRate);
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
    if (located >= 0.5) {
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
      if (top[1] >= 0.34 && top[1] - second[1] >= 0.06) return top[0];
      if (totals.corner + totals.above >= 0.38) {
        return totals.corner >= totals.above * 0.85 ? "corner" : "above_break";
      }
      if (totals.rim + totals.paint >= 0.42) {
        return totals.rim >= totals.paint ? "rim" : "paint";
      }
      if (totals.mid >= 0.28 && totals.mid >= (totals.corner + totals.above) * 0.9) {
        return "mid";
      }
      return "hybrid";
    }
  }

  if (Number.isFinite(threePar)) {
    if (threePar! >= 0.48) return "perimeter";
    if (threePar! <= 0.15) return "inside";
    if (threePar! <= 0.22 && ftr != null && ftr >= 0.32) return "inside";
    // Midrange leaners: middling 3PAr and modest free-throw rate (not rim-hunting).
    if (
      threePar! >= 0.22 &&
      threePar! <= 0.38 &&
      ftr != null &&
      ftr <= 0.26
    ) {
      return "mid";
    }
  }
  return "hybrid";
}

/** Softmax-ish mix from ranked raw scores (top N positive entries). */
export function buildRoleMix(
  ranked: Array<{ id: Exclude<PlayerRoleId, "unclear">; score: number }>,
  limit = 4
): PlayerRoleMixEntry[] {
  const positive = ranked
    .filter((row) => row.score > 0.35)
    .slice(0, Math.max(1, limit));
  if (!positive.length) return [];
  // Temperature keeps a clear leader without flattening close seconds.
  const temp = 1.35;
  const exps = positive.map((row) => Math.exp(row.score / temp));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return positive.map((row, i) => ({
    id: row.id,
    phrase: PLAYER_ROLE_PHRASES[row.id],
    score: row.score,
    weight: exps[i]! / sum,
  }));
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
    if (blk != null && blk >= 0.04) return "paint_protection";
    if (contested != null && contested / gp >= 4.2) return "paint_protection";
    return null;
  }

  if (stl != null && stl >= 0.022) return "disruption";
  if (deflections != null && deflections / gp >= 1.6) return "disruption";
  return null;
}

function scoreRoles(input: {
  usg: number;
  ast: number;
  threePar: number;
  tov: number;
  ftr: number;
  shell: PlayerRoleShell;
  diet: ShotDietKind;
}): Array<{ id: Exclude<PlayerRoleId, "unclear">; score: number }> {
  const { usg, ast, threePar, tov, ftr, shell, diet } = input;
  const insideDiet =
    diet === "rim" ||
    diet === "paint" ||
    diet === "inside" ||
    threePar <= 0.2;
  const perimeterDiet =
    diet === "perimeter" ||
    diet === "corner" ||
    diet === "above_break" ||
    threePar >= 0.38;
  const midDiet = diet === "mid";
  const rimDiet = diet === "rim" || diet === "paint";

  // Creation load: both the ball and the pass rate have to show up together.
  const load = ramp(usg, 0.2, 0.33);
  const create = ramp(usg, 0.19, 0.31) * ramp(ast, 0.18, 0.38);
  // Assist share relative to usage — connectors pass a lot for how little they use.
  const passShare = ramp(ast / Math.max(usg, 0.08), 0.7, 1.45);
  const pass = ramp(ast, 0.14, 0.34);
  const shoot3 = ramp(threePar, 0.3, 0.55);
  const insideBias = Math.max(
    insideDiet ? 0.8 : 0,
    1 - ramp(threePar, 0.1, 0.38),
    ramp(ftr, 0.24, 0.5) * (1 - shoot3)
  );
  const careful = 1 - ramp(tov, 0.1, 0.18);
  const lowUsage = 1 - ramp(usg, 0.14, 0.23);
  const midUsage = ramp(usg, 0.16, 0.24) * (1 - ramp(usg, 0.26, 0.32));
  // Scoring without creation — volume first, helpers second.
  const scoreFirst =
    ramp(usg, 0.26, 0.34) * (1 - ramp(ast, 0.1, 0.2)) +
    0.45 * ramp(usg, 0.24, 0.3) * (1 - ramp(ast, 0.14, 0.24));

  // Creation index: usage × assist with a soft floor so one spike alone
  // cannot mint an engine (e.g. high USG / tiny AST%).
  const creationIndex = create * (0.55 + 0.45 * ramp(ast, 0.16, 0.3));

  const scores: Record<Exclude<PlayerRoleId, "unclear">, number> = {
    half_court_engine:
      7.8 * creationIndex +
      3.6 * load * ramp(ast, 0.24, 0.38) +
      2.4 * ramp(ast, 0.28, 0.42) * ramp(usg, 0.25, 0.33) +
      // True engines keep the ball; pure passers with low usage fall elsewhere.
      1.5 * creationIndex * (1 - lowUsage),
    secondary_initiator:
      7.0 * midUsage * ramp(ast, 0.18, 0.3) * (1 - ramp(usg, 0.29, 0.35)) +
      2.6 * ramp(usg, 0.17, 0.24) * ramp(ast, 0.2, 0.32) * (1 - ramp(usg, 0.27, 0.32)) +
      1.4 * passShare * midUsage * (1 - ramp(usg, 0.3, 0.34)) +
      // Shared creation without primary usage.
      1.1 * creationIndex * (1 - load) * midUsage,
    volume_scorer:
      7.4 * scoreFirst +
      2.8 * load * (1 - ramp(ast, 0.12, 0.22)) +
      (midDiet ? 1.6 : 0) * scoreFirst +
      (perimeterDiet && !shoot3 ? 0.6 : 0) * scoreFirst -
      // Creation pulls volume off the top when the player also runs offense.
      2.2 * creationIndex * ramp(ast, 0.18, 0.3),
    catch_and_shoot_spacer:
      7.2 * lowUsage * shoot3 * (1 - ramp(ast, 0.1, 0.2)) +
      (perimeterDiet ? 2.1 : 0) * lowUsage * shoot3 +
      (diet === "corner" || diet === "above_break" ? 1.3 : 0) * lowUsage -
      1.4 * passShare * ramp(ast, 0.16, 0.28),
    cut_roll_finisher:
      6.4 * lowUsage * insideBias * (1 - ramp(ast, 0.12, 0.22)) +
      2.1 * ramp(ftr, 0.26, 0.48) * (1 - shoot3) * (1 - ramp(usg, 0.2, 0.28)) +
      (rimDiet ? 1.7 : 0) * lowUsage * (1 - shoot3),
    post_paint_big: 0,
    stretch_big: 0,
    connector:
      6.2 * lowUsage * ramp(ast, 0.14, 0.28) * careful +
      2.6 * passShare * lowUsage * careful +
      1.7 * pass * (1 - ramp(usg, 0.16, 0.24)) * careful -
      // Spacers who barely pass should not land here.
      1.8 * shoot3 * (1 - ramp(ast, 0.12, 0.2)),
  };

  if (shell === "big") {
    scores.post_paint_big =
      5.8 * insideBias +
      3.0 * (1 - shoot3) +
      1.6 * ramp(usg, 0.14, 0.24) +
      (rimDiet || insideDiet ? 1.4 : 0);
    scores.stretch_big =
      6.6 * shoot3 +
      2.6 * ramp(threePar, 0.28, 0.42) +
      1.2 * lowUsage +
      (perimeterDiet ? 1.2 : 0);
    // Creation bigs (Jokic / Sabonis shape) keep the engine label.
    scores.half_court_engine += 3.6 * create * ramp(ast, 0.28, 0.42);
    scores.secondary_initiator += 1.4 * midUsage * ramp(ast, 0.22, 0.34);
    scores.cut_roll_finisher *= 0.22;
    if (usg < 0.25 || ast < 0.22) {
      scores.half_court_engine *= 0.35;
      scores.volume_scorer *= 0.35;
      scores.catch_and_shoot_spacer *= 0.3;
      scores.secondary_initiator *= 0.5;
    } else {
      // High-usage creation bigs are engines, not volume scorers or spacers.
      scores.volume_scorer *= 0.4;
      scores.catch_and_shoot_spacer *= 0.2;
      scores.post_paint_big *= 0.55;
      scores.stretch_big *= 0.45;
    }
  } else {
    scores.post_paint_big *= 0.1;
    scores.stretch_big *= 0.15;
  }

  if (shell === "guard" && usg < 0.18 && insideBias > 0.55) {
    scores.cut_roll_finisher += 1.3;
  }
  if (shell === "wing" && load > 0.7 && pass < 0.35) {
    scores.volume_scorer += 1.2;
  }
  // Spacers who also create a little still aren't engines.
  if (shoot3 > 0.7 && usg < 0.2) {
    scores.half_court_engine *= 0.35;
    scores.volume_scorer *= 0.45;
  }

  return (Object.entries(scores) as Array<
    [Exclude<PlayerRoleId, "unclear">, number]
  >)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Assign a scout-phrase style from season shape + optional zone diet.
 * Impact ratings are intentionally ignored.
 */
export function assignPlayerRole(options: {
  row: PlayerSeason;
  zones?: ZoneShareInput[] | null;
  position?: Position | string | null;
}): PlayerRoleAssignment | null {
  const { row } = options;
  if (!row || row.gamesPlayed < 15) return null;
  const mpg = row.minutes / Math.max(1, row.gamesPlayed);
  if (mpg < 12 && row.minutes < 400) return null;

  const usg = row.usagePct;
  const ast = row.assistPct;
  if (usg == null || !Number.isFinite(usg) || ast == null || !Number.isFinite(ast)) {
    return null;
  }

  const threePar = Number.isFinite(row.threePointAttemptRate)
    ? (row.threePointAttemptRate as number)
    : 0;
  const tov = Number.isFinite(row.turnoverPct) ? (row.turnoverPct as number) : 0.12;
  const ftr = Number.isFinite(row.freeThrowRate) ? (row.freeThrowRate as number) : 0.25;
  const shell = resolveRoleShell(options.position ?? row.position, {
    reboundPct: row.reboundPct,
    blockPct: row.blockPct,
    assistPct: ast,
    usagePct: usg,
    threePointAttemptRate: threePar,
  });
  const diet = resolveShotDiet(row, options.zones);
  const ranked = scoreRoles({ usg, ast, threePar, tov, ftr, shell, diet });
  const top = ranked[0];
  const second = ranked[1];
  const roleMix = buildRoleMix(ranked, 4);
  if (!top || top.score < 2.0) {
    return {
      id: "unclear",
      phrase: PLAYER_ROLE_PHRASES.unclear,
      blurb: playerRoleBlurb("unclear"),
      shell,
      diet,
      dietLine: DIET_LINES[diet],
      defenseClause: null,
      defenseLabel: null,
      confidence: clamp01(top?.score ? top.score / 7 : 0),
      evidence: buildEvidence(row),
      why: ["Usage, creation, and shot diet do not separate cleanly."],
      season: row.season,
      runnerUp: null,
      runnerUpId: null,
      roleMix: [],
    };
  }

  const margin = top.score - (second?.score ?? 0);
  const relative = top.score / Math.max(top.score + (second?.score ?? 0), 0.01);
  const mixLead = roleMix[0]?.weight ?? relative;
  const minutesFactor = Math.min(
    1,
    (row.minutes || row.gamesPlayed * 20) / (row.gamesPlayed * 28)
  );
  // Mix share rewards a dominant style; margin still separates coin-flips.
  const confidence = clamp01(
    0.22 +
      mixLead * 0.42 +
      margin * 0.1 +
      (relative - 0.5) * 0.28 +
      Math.min(0.18, top.score / 14) * minutesFactor
  );

  const id: PlayerRoleId =
    confidence < 0.36 && margin < 0.65 ? "unclear" : top.id;
  const defense = id === "unclear" ? null : defenseClause(row, shell);
  const runnerUpId =
    id !== "unclear" && second && second.score >= 1.8 && margin < 1.6
      ? second.id
      : null;
  const runnerUp = runnerUpId ? PLAYER_ROLE_PHRASES[runnerUpId] : null;

  const why: string[] = [];
  why.push(
    `Usage ${pctDisplay(usg)}, assist rate ${pctDisplay(ast)}, 3PAr ${pctDisplay(threePar)}.`
  );
  if (Number.isFinite(tov)) {
    why.push(`Turnover rate ${pctDisplay(tov)}.`);
  }
  why.push(`Shot diet reads ${DIET_LINES[diet].toLowerCase()}.`);
  if (shell === "big") {
    why.push("Sized as a big from position and rebound rate.");
  } else if (shell === "guard") {
    why.push("Listed or shaped as a guard.");
  } else {
    why.push("Sized as a wing.");
  }
  if (defense) why.push(`${DEFENSE_LABELS[defense]}.`);
  if (roleMix.length > 1) {
    const mixLine = roleMix
      .slice(0, 3)
      .map((entry) => `${entry.phrase} ${Math.round(entry.weight * 100)}%`)
      .join(", ");
    why.push(`Style mix: ${mixLine}.`);
  }
  if (runnerUp) why.push(`Close second: ${runnerUp}.`);
  why.push("This is about role and shot diet, not how good the player is.");

  return {
    id,
    phrase: PLAYER_ROLE_PHRASES[id],
    blurb: playerRoleBlurb(id),
    shell,
    diet,
    dietLine: DIET_LINES[diet],
    defenseClause: defense,
    defenseLabel: defense ? DEFENSE_LABELS[defense] : null,
    confidence,
    evidence: buildEvidence(row),
    why,
    season: row.season,
    runnerUp,
    runnerUpId,
    roleMix: id === "unclear" ? [] : roleMix,
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
