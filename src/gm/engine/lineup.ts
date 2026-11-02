import type { GmPlayer, GmPosition, GmTeam } from "@/gm/types";
import {
  overallFromAttributes,
  playerSheet,
  SHEET_VERSION,
} from "@/gm/engine/attributes";
import { clamp } from "@/gm/engine/rng";
import { bestStartingFive, roleFit } from "@/gm/engine/rotation-roles";

/**
 * Who can share a spot. NBA coaches still staff a handler and a big.
 * A guard can slide to the other guard spot or to the wing.
 * A forward can slide to the wing or the other big spot.
 * A guard does not take the center's minutes, and a center does not run the point.
 */
const ACCEPTS: Record<GmPosition, GmPosition[]> = {
  PG: ["PG", "SG"],
  SG: ["SG", "PG", "SF"],
  SF: ["SF", "SG", "PF"],
  PF: ["PF", "SF", "C"],
  C: ["C", "PF"],
};

/** Scarce spots first, so wings cannot claim the center and the point. */
const FILL_ORDER: GmPosition[] = ["C", "PG", "SG", "SF", "PF"];

export const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

/** Typical starter and backup minutes at each spot. The five pairs add to 240. */
const STARTER_MINUTES: Record<GmPosition, number> = { PG: 32, SG: 32, SF: 32, PF: 30, C: 28 };
const BACKUP_MINUTES: Record<GmPosition, number> = { PG: 16, SG: 16, SF: 16, PF: 18, C: 20 };

/** Target minutes covering each listed spot (starter + backup). */
export const POSITION_MINUTE_TARGET = 48;

export function slotAccepts(slot: GmPosition, position: GmPosition): boolean {
  return ACCEPTS[slot].includes(position);
}

/** Spots a player can list as secondary from a given primary. */
export function secondaryOptions(primary: GmPosition): GmPosition[] {
  return ACCEPTS[primary].filter((pos) => pos !== primary);
}

/**
 * How well a listing covers a night's slot.
 * 1 = primary, ~0.94 = listed secondary, ~0.88 = legal slide, lower = stretch.
 */
export function positionFit(player: GmPlayer, slot: GmPosition): number {
  if (player.position === slot) return 1;
  if (player.secondaryPosition === slot) return 0.94;
  if (slotAccepts(slot, player.position)) return 0.88;
  if (
    player.secondaryPosition &&
    slotAccepts(slot, player.secondaryPosition)
  ) {
    return 0.84;
  }
  return 0.76;
}

/** Relist secondary only. Primary and overall stay put. */
export function setSecondaryPosition(
  player: GmPlayer,
  secondary: GmPosition | null
): GmPlayer {
  if (!secondary || secondary === player.position) {
    return { ...player, secondaryPosition: null };
  }
  if (!secondaryOptions(player.position).includes(secondary)) {
    return player;
  }
  return { ...player, secondaryPosition: secondary };
}

/** Natural backup listing next to a primary spot. */
export function siblingPosition(position: GmPosition): GmPosition {
  if (position === "PG") return "SG";
  if (position === "SG") return "PG";
  if (position === "SF") return "PF";
  if (position === "PF") return "SF";
  return "PF";
}

/** Best alternate listing for the minutes-per-position secondary column. */
export function inferredSecondary(player: GmPlayer): GmPosition | null {
  if (player.secondaryPosition && player.secondaryPosition !== player.position) {
    return player.secondaryPosition;
  }
  return siblingPosition(player.position);
}

/** Bump when natural-position rules change so saves re-list. */
export const POSITION_BOOK_VERSION = 4;

function heightBell(height: number, peak: number, spread: number): number {
  const z = (height - peak) / spread;
  return Math.exp(-0.5 * z * z);
}

/** Same as heightBell, but the tall side can use a wider spread (centers). */
function heightBellAsym(
  height: number,
  peak: number,
  spreadShort: number,
  spreadTall: number
): number {
  const spread = height >= peak ? spreadTall : spreadShort;
  const z = (height - peak) / spread;
  return Math.exp(-0.5 * z * z);
}

function weightBell(weight: number, peak: number, spread: number): number {
  const z = (weight - peak) / spread;
  return Math.exp(-0.5 * z * z);
}

/**
 * Soft prior from ESPN/bio G·F·C (or an already-split five-spot listing).
 * Never locks the player into that bucket — physicals can move a tall "G" to the wing.
 */
function listedPrior(listed: GmPosition, spot: GmPosition): number {
  // Soft only — ESPN G/F/C is a hint, not a lock. Physicals decide the split.
  if (listed === spot) return 0.18;
  if (listed === "PG" || listed === "SG") {
    if (spot === "PG" || spot === "SG") return 0.12;
    if (spot === "SF") return 0.02;
    return -0.35;
  }
  if (listed === "SF" || listed === "PF") {
    if (spot === "SF" || spot === "PF") return 0.12;
    if (spot === "SG" || spot === "C") return 0.0;
    return -0.2;
  }
  if (listed === "C") {
    if (spot === "C") return 0.22;
    if (spot === "PF") return 0.1;
    return -0.45;
  }
  return 0;
}

/**
 * How naturally a body + playstyle sits at a spot (0..~1.4).
 * Height and weight lead; ratings only tilt within a physical band.
 */
export function naturalFitScore(
  player: Pick<GmPlayer, "position" | "heightIn" | "weightLbs" | "ratings">,
  spot: GmPosition
): number {
  const height = player.heightIn > 0 ? player.heightIn : 78;
  const weight =
    player.weightLbs > 0
      ? player.weightLbs
      : height >= 82
        ? 250
        : height >= 79
          ? 220
          : height >= 76
            ? 200
            : 185;
  // Incomplete sheets (NaN skill ratings) must not poison the ranking — fall
  // back to mid-band so height/weight still place the player.
  const skill = (value: number | undefined, fallback = 50) =>
    Number.isFinite(value) ? (value as number) : fallback;
  const play = skill(player.ratings.playmaking);
  const reb = skill(player.ratings.rebounding);
  const shoot = skill(player.ratings.shooting);
  const finish = skill(player.ratings.finishing);
  const def = Number.isFinite(player.ratings.defense)
    ? 50 + (player.ratings.defense as number) * 8
    : 50;
  const off = Number.isFinite(player.ratings.offense)
    ? 50 + (player.ratings.offense as number) * 8
    : 50;

  // Physical peaks (inches / lbs). PF peaks near 6'8–6'10 so career fours
  // like Tatum (6'8", ~224) are not forced to SF by a 6'11" center curve.
  // Centers keep a wide tall-side bell so 7'2"+ (Tacko, etc.) stay C.
  const physical: Record<GmPosition, number> = {
    PG: heightBell(height, 74.0, 2.0) * 0.72 + weightBell(weight, 186, 16) * 0.28,
    SG: heightBell(height, 76.2, 1.9) * 0.72 + weightBell(weight, 198, 16) * 0.28,
    SF: heightBell(height, 78.6, 2.0) * 0.7 + weightBell(weight, 212, 18) * 0.3,
    PF: heightBell(height, 80.8, 2.15) * 0.7 + weightBell(weight, 232, 20) * 0.3,
    C:
      heightBellAsym(height, 84.0, 2.2, 5.5) * 0.72 +
      weightBell(weight, 258, 26) * 0.28,
  };

  // Playstyle tilts inside the physical band (not a replacement for size).
  const style: Record<GmPosition, number> = {
    PG: (play - 52) * 0.013 + (75.5 - height) * 0.018 - (reb - 48) * 0.005,
    SG:
      (shoot - 55) * 0.009 +
      (off - 55) * 0.005 +
      (play - 50) * 0.003 -
      (reb - 48) * 0.006 -
      Math.max(0, height - 78) * 0.04,
    SF:
      (off - 52) * 0.006 +
      (shoot - 52) * 0.004 +
      (def - 52) * 0.003 +
      (height - 77.5) * 0.006 -
      Math.max(0, weight - 225) * 0.0012,
    PF:
      (reb - 52) * 0.012 +
      (finish - 52) * 0.008 +
      (height - 79.5) * 0.028 +
      (weight - 218) * 0.002 -
      (play - 58) * 0.0025,
    C:
      (reb - 58) * 0.013 +
      (finish - 55) * 0.008 +
      (height - 82) * 0.028 +
      (weight - 245) * 0.0022 -
      (play - 50) * 0.004,
  };

  // Forward shells that are clearly big-wing sized stay on the four.
  // Light 6'11" stretch fours stay PF/SF — centers need mass, not just height.
  let forwardBump = 0;
  if (
    (player.position === "SF" || player.position === "PF" || player.position === "C") &&
    height >= 79.5 &&
    height <= 83.5 &&
    play < 84
  ) {
    if (weight >= 215 && weight < 245) {
      if (spot === "PF") forwardBump = 0.22;
      if (spot === "SF") forwardBump = 0.06;
      if (spot === "SG") forwardBump = -0.25;
      if (spot === "C") forwardBump = -0.18;
    } else if (weight < 215 && height <= 83) {
      if (spot === "PF") forwardBump = 0.14;
      if (spot === "SF") forwardBump = 0.1;
      if (spot === "C") forwardBump = -0.28;
    }
  }
  // Stocky playmaking / defensive forwards (Draymond-types) stay on the four.
  if (
    height >= 77 &&
    height <= 79.5 &&
    weight >= 225 &&
    play >= 60 &&
    (reb >= 55 || def >= 62)
  ) {
    if (spot === "PF") forwardBump += 0.28;
    if (spot === "SF") forwardBump -= 0.1;
    if (spot === "SG") forwardBump -= 0.2;
  }

  // Absolute size floor: 7'+ (or 6'11"+ and heavy) is a center shell.
  let sizeFloor = 0;
  if (height >= 86 || (height >= 84 && weight >= 245)) {
    if (spot === "C") sizeFloor = 0.55;
    if (spot === "PF") sizeFloor = 0.12;
    if (spot === "PG" || spot === "SG") sizeFloor = -0.8;
  }

  return (
    physical[spot] * 1.08 +
    style[spot] +
    listedPrior(player.position, spot) +
    forwardBump +
    sizeFloor
  );
}

/**
 * Natural primary from physicals + playstyle. ESPN G/F/C is only a soft prior.
 * Secondary prefers the adjacent sibling when scores are close so a light
 * tall wing lists SF behind PF instead of C.
 */
export function classifyListedPosition(
  player: Pick<GmPlayer, "position" | "heightIn" | "weightLbs" | "ratings">
): {
  position: GmPosition;
  secondaryPosition: GmPosition;
} {
  const ranked = [...POSITIONS]
    .map((spot) => ({ spot, score: naturalFitScore(player, spot) }))
    .sort((a, b) => b.score - a.score);
  const primary = ranked[0]!.spot;
  const legal = ranked.filter(
    (row) => row.spot !== primary && ACCEPTS[primary].includes(row.spot)
  );
  const best = legal[0];
  const sib = siblingPosition(primary);
  const sibRow = legal.find((row) => row.spot === sib);
  const secondary =
    sibRow && best && best.score - sibRow.score < 0.28
      ? sib
      : (best?.spot ?? sib);
  return { position: primary, secondaryPosition: secondary };
}

/** Apply five-spot listing + sibling secondary. Rebuilds overall when primary moves. */
export function withListedPositions(player: GmPlayer): GmPlayer {
  if (player.listedPosition) return { ...player, position: player.listedPosition, secondaryPosition: player.secondaryPosition ?? siblingPosition(player.listedPosition) };
  const listed = classifyListedPosition(player);
  if (
    player.position === listed.position &&
    player.secondaryPosition === listed.secondaryPosition
  ) {
    return player;
  }
  if (player.position !== listed.position) {
    return {
      ...reassignPosition(player, listed.position),
      secondaryPosition: listed.secondaryPosition,
    };
  }
  return { ...player, secondaryPosition: listed.secondaryPosition };
}

/**
 * After the per-player split, promote one wing if a club still has no PG or PF.
 * Keeps every depth chart able to staff five spots.
 */
export function ensureTeamPositionCoverage(players: GmPlayer[]): GmPlayer[] {
  const byTeam = new Map<string, GmPlayer[]>();
  for (const player of players) {
    if (!player.teamId) continue;
    const list = byTeam.get(player.teamId) ?? [];
    list.push(player);
    byTeam.set(player.teamId, list);
  }
  const promote = new Map<string, GmPosition>();
  for (const roster of byTeam.values()) {
    if (!roster.some((player) => player.position === "PG")) {
      const guard = [...roster]
        .filter((player) => player.position === "SG" && !player.listedPosition)
        .sort(
          (a, b) =>
            b.ratings.playmaking - a.ratings.playmaking || a.heightIn - b.heightIn
        )[0];
      if (guard) promote.set(guard.id, "PG");
    }
    if (!roster.some((player) => player.position === "PF")) {
      const forward = [...roster]
        .filter((player) => player.position === "SF" && !player.listedPosition)
        .sort(
          (a, b) =>
            b.heightIn - a.heightIn || b.ratings.rebounding - a.ratings.rebounding
        )[0];
      if (forward) promote.set(forward.id, "PF");
    }
  }
  if (!promote.size) return players;
  return players.map((player) => {
    const next = promote.get(player.id);
    if (!next || player.position === next) return player;
    return {
      ...reassignPosition(player, next),
      secondaryPosition: siblingPosition(next),
    };
  });
}

/** Classify every player, then fill any team still missing PG or PF. */
export function assignLeaguePositions(players: GmPlayer[]): GmPlayer[] {
  return ensureTeamPositionCoverage(players.map(withListedPositions));
}

/**
 * Overall if listed at `position`. Latent strength still leads, but a clear
 * physical mismatch (6'8" forward graded as a SG) is pulled back so "best at"
 * tracks natural position, not only scoring weights.
 */
export function overallAtPosition(player: GmPlayer, position: GmPosition): number {
  const sheet = playerSheet(player);
  const raw = overallFromAttributes(position, sheet.attributes, {
    impact: player.ratings.impact,
    offense: player.ratings.offense,
    defense: player.ratings.defense,
  });
  const home = classifyListedPosition(player).position;
  if (position === home) return raw;
  const homeFit = naturalFitScore(player, home);
  const here = naturalFitScore(player, position);
  // Pull down listings that fight the body type so "best at" tracks
  // physicals / playstyle, not only the scoring blend.
  const mismatch =
    homeFit > 0.05 ? clamp((homeFit - here) / Math.max(0.35, homeFit), 0, 1) : 0;
  return clamp(Math.round(raw - mismatch * 6), 25, 99);
}

/**
 * Relist a player at a new primary spot. Overall moves with the position weights.
 * Keeps attributes; only the blend changes.
 */
export function reassignPosition(player: GmPlayer, position: GmPosition): GmPlayer {
  if (player.position === position) return player;
  const sheet = playerSheet(player);
  const overall = overallAtPosition(player, position);
  const secondary =
    player.secondaryPosition === position
      ? player.position
      : player.secondaryPosition && slotAccepts(position, player.secondaryPosition)
        ? player.secondaryPosition
        : ACCEPTS[position].find((pos) => pos !== position) ?? null;
  return {
    ...player,
    position,
    secondaryPosition: secondary,
    sheet: {
      ...sheet,
      overall,
      priorOverall: sheet.overall,
    },
  };
}

export type PositionMinuteRow = {
  position: GmPosition;
  primary: number;
  secondary: number;
  total: number;
  /** green | yellow | red vs the 48-minute target. */
  health: "good" | "thin" | "heavy";
};

/**
 * Fill missing cover assignments so each minute lands on exactly one spot.
 * Players already in `coverSlot` keep their seat; everyone else with minutes
 * defaults to their primary listing.
 */
export function resolveCoverSlot(
  players: GmPlayer[],
  minutes: Record<string, number>,
  coverSlot?: Partial<Record<string, GmPosition>> | null
): Record<string, GmPosition> {
  const resolved: Record<string, GmPosition> = {};
  for (const [id, spot] of Object.entries(coverSlot ?? {})) {
    if (spot) resolved[id] = spot;
  }
  for (const player of players) {
    if ((minutes[player.id] ?? 0) <= 0) continue;
    if (resolved[player.id]) continue;
    resolved[player.id] = player.position;
  }
  return resolved;
}

/**
 * How minutes stack at each spot. Target for the bar is 48.
 * `coverSlot` is who is actually staffing the spot (starter/backup assignment).
 * Without it, a SG filling SF still shows under SG and the SF bar stays empty.
 *
 * Each player's minutes count once. Primary = natural listing at that seat;
 * secondary = covering the seat from another listing. Never also dump minutes
 * onto `secondaryPosition` — every roster now has a sibling secondary, and that
 * double-counted the board (centers piled onto PF, guards mirrored PG/SG).
 */
export function minutesPerPosition(
  players: GmPlayer[],
  minutes: Record<string, number>,
  coverSlot?: Partial<Record<string, GmPosition>> | null,
  positionMinutes?: Record<string, Partial<Record<GmPosition, number>>>
): PositionMinuteRow[] {
  const seats = resolveCoverSlot(players, minutes, coverSlot);
  return POSITIONS.map((position) => {
    let primary = 0;
    let secondary = 0;
    for (const player of players) {
      const m = Math.max(0, minutes[player.id] ?? 0);
      if (m <= 0) continue;
      const split = positionMinutes?.[player.id];
      const sum = split ? Object.values(split).reduce((n, value) => n + Math.max(0, value ?? 0), 0) : 0;
      if (!sum && seats[player.id] !== position) continue;
      const assigned = sum ? m * Math.max(0, split?.[position] ?? 0) / sum : m;
      if (player.position === position) primary += assigned;
      else secondary += assigned;
    }
    const total = primary + secondary;
    const under = POSITION_MINUTE_TARGET - total;
    const over = total - POSITION_MINUTE_TARGET;
    const health: PositionMinuteRow["health"] =
      Math.abs(total - POSITION_MINUTE_TARGET) <= 6
        ? "good"
        : over > 8
          ? "heavy"
          : under > 8
            ? "thin"
            : Math.abs(total - POSITION_MINUTE_TARGET) <= 12
              ? "thin"
              : "heavy";
    return {
      position,
      primary: Math.round(primary * 10) / 10,
      secondary: Math.round(secondary * 10) / 10,
      total: Math.round(total * 10) / 10,
      health,
    };
  });
}

/**
 * How much of a player's rating sticks at this night's minute load.
 * Fresh through the low-30s; sharp fade toward ironman minutes.
 */
export function minuteLoadMul(minutes: number, stamina = 70): number {
  const legs = clamp(stamina / 70, 0.75, 1.2);
  const soft = 32 + (legs - 1) * 4;
  if (minutes <= soft) return 1;
  if (minutes >= 46) return clamp(0.62 / legs, 0.5, 0.78);
  const t = (minutes - soft) / (46 - soft);
  return clamp(1 - t * t * (0.38 / legs), 0.55, 1);
}

/**
 * Coaching quality from the minute plan. 1 = balanced depth near 48 per spot.
 * Star hogging, empty spots, and 240 leftover all pull this down.
 */
export function rotationQuality(
  players: GmPlayer[],
  minutes: Record<string, number>,
  coverSlot?: Partial<Record<string, GmPosition>> | null
): number {
  const rows = minutesPerPosition(players, minutes, coverSlot);
  const used = Object.values(minutes).reduce((sum, value) => sum + Math.max(0, value), 0);
  const coverage =
    rows.reduce((sum, row) => {
      const gap = Math.abs(row.total - POSITION_MINUTE_TARGET);
      return sum + clamp(1 - gap / 24, 0, 1);
    }, 0) / 5;
  const depth = players.filter((player) => (minutes[player.id] ?? 0) >= 10).length;
  const depthScore = clamp(depth / 9, 0.28, 1.05);
  const maxMin = Math.max(0, ...players.map((player) => minutes[player.id] ?? 0));
  // Ironman books get punished harder; sweet spot is mid-30s starters.
  const hog =
    maxMin >= 44
      ? 0.42
      : maxMin > 36
        ? clamp(1 - (maxMin - 36) / 12, 0.48, 1)
        : 1;
  const fill = clamp(1 - Math.abs(240 - used) / 40, 0.5, 1);
  // Wide band for the coaching UI. simulateGame maps this through
  // coachingOrtNudge so a bad book costs a few points, not −38% ORtg.
  return clamp(coverage * 0.45 + depthScore * 0.3 + hog * 0.18 + fill * 0.07, 0.55, 1.1);
}

function realMpg(player: GmPlayer): number {
  const line = player.priorLine && player.priorLine.gp >= 15 ? player.priorLine : player.nbaSeason;
  if (line && line.gp > 0 && line.min > 0) return line.min / line.gp;
  return player.minutesPreference || 0;
}

export function overallOf(player: GmPlayer): number {
  const sheet = player.sheet;
  if (sheet && (sheet.version === SHEET_VERSION || sheet.version == null) && sheet.overall > 0) {
    return sheet.overall;
  }
  // Same spine as sheets: 72 + 3.45×net (O+D when available).
  const net =
    Number.isFinite(player.ratings.offense) && Number.isFinite(player.ratings.defense)
      ? player.ratings.offense + player.ratings.defense
      : player.ratings.impact;
  return clamp(Math.round(72 + net * 3.45), 45, 95);
}

/**
 * Minutes a healthy player should want.
 * Real minutes are the base, so a flat overall board still looks like the NBA.
 * Each point of overall above 68 adds a little. A 16-game sample at 33 a night
 * stays a starter.
 */
export function rotationTarget(player: GmPlayer): number {
  const fromReal = player.seasonLine && player.seasonLine.gp >= 15
    ? player.seasonLine.min / player.seasonLine.gp : realMpg(player);
  const bump = (overallOf(player) - 80) * 0.08;
  const base = fromReal > 0 ? fromReal : clamp(16 + bump, 0, 36);
  return clamp(base + bump, 0, 38);
}

/**
 * Who should start: overall plus real-minute gravity.
 * Stops an 8-MPG fluke card from locking a seat over a 26-MPG starter
 * when their overalls are within a couple points.
 */
export function starterSeatScore(player: GmPlayer): number {
  const mpg = rotationTarget(player);
  // 32 mpg → +6, 24 → +2, 16 → −2, 8 → −6 (clamped).
  const minuteTilt = clamp((mpg - 20) * 0.5, -8, 8);
  return overallOf(player) + minuteTilt;
}

/** Default per-night ceiling. Nobody plays all 48 in this engine. */
export const MAX_PLAYER_MINUTES = 44;

/** Shallow books need a higher individual cap so 240 can still close. */
export function maxMinutesForDepth(depth?: number | null): number {
  const pool = clampRotationDepth(depth);
  if (pool <= 6) return 44;
  if (pool === 7) return 44;
  return MAX_PLAYER_MINUTES;
}

/** Cap individuals and put leftover minutes on the shortest dressed players. */
export function clampAndRespread(
  minutes: Record<string, number>,
  maxCap = MAX_PLAYER_MINUTES
): Record<string, number> {
  const next: Record<string, number> = { ...minutes };
  let overflow = 0;
  for (const id of Object.keys(next)) {
    const value = next[id] ?? 0;
    if (value > maxCap) {
      overflow += value - maxCap;
      next[id] = maxCap;
    }
  }
  const dressed = Object.keys(next)
    .filter((id) => (next[id] ?? 0) > 0)
    .sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
  while (overflow > 0.5 && dressed.length) {
    let moved = false;
    for (const id of dressed) {
      if (overflow < 0.5) break;
      const room = maxCap - (next[id] ?? 0);
      if (room < 0.5) continue;
      const add = Math.min(room, 1, overflow);
      next[id] = (next[id] ?? 0) + add;
      overflow -= add;
      moved = true;
    }
    if (!moved) break;
  }
  // Keep the book to one decimal so UI and sims never show float soup.
  for (const id of Object.keys(next)) {
    next[id] = Math.round((next[id] ?? 0) * 10) / 10;
  }
  return next;
}

/** Hand minutes from the top of the rotation until 240 is used. */
export function allocateMinutes(
  rows: { id: string; minutes: number }[],
  depth?: number | null
): Record<string, number> {
  const cap = maxMinutesForDepth(depth ?? rows.filter((row) => row.minutes > 0).length);
  const ranked = [...rows].sort((a, b) => b.minutes - a.minutes);
  const out: Record<string, number> = {};
  let left = 240;
  for (const row of ranked) {
    const give = Math.min(left, clamp(row.minutes, 0, cap));
    out[row.id] = give;
    left -= give;
  }
  // Spread leftovers toward players who still sit under their wish, then the short end.
  // Never dump the whole remainder onto one star.
  if (left > 0) {
    const dressed = ranked.filter((row) => (out[row.id] ?? 0) > 0);
    const wishOf = new Map(ranked.map((row) => [row.id, row.minutes]));
    let guard = 0;
    while (left > 0 && dressed.length && guard < 240) {
      guard += 1;
      let moved = false;
      const order = [...dressed].sort((a, b) => {
        const aGap = (wishOf.get(a.id) ?? 0) - (out[a.id] ?? 0);
        const bGap = (wishOf.get(b.id) ?? 0) - (out[b.id] ?? 0);
        return bGap - aGap || (out[a.id] ?? 0) - (out[b.id] ?? 0);
      });
      for (const row of order) {
        if (left <= 0) break;
        const current = out[row.id] ?? 0;
        if (current >= cap) continue;
        out[row.id] = current + 1;
        left -= 1;
        moved = true;
      }
      if (!moved) break;
    }
  }
  for (const row of rows) if (out[row.id] == null) out[row.id] = 0;
  return out;
}

function byWish(a: GmPlayer, b: GmPlayer): number {
  return rotationTarget(b) - rotationTarget(a) || overallOf(b) - overallOf(a);
}

/**
 * Best available at the spot.
 * Primary / secondary listings compete on overall — a 74 SF does not lock the
 * wing when an 84 forward lists it second. Stretch slides only fill holes.
 */
function pickForSlot(slot: GmPosition, roster: GmPlayer[], used: Set<string>): GmPlayer | undefined {
  const open = roster.filter((player) => !used.has(player.id));
  if (!open.length) return undefined;

  const natural = open
    .filter((player) => player.position === slot)
    .sort(
      (a, b) =>
        starterSeatScore(b) - starterSeatScore(a) ||
        overallAtPosition(b, slot) - overallAtPosition(a, slot) ||
        byWish(a, b)
    );

  let best: GmPlayer | undefined;
  let bestScore = -Infinity;
  for (const player of open) {
    const fit = positionFit(player, slot);
    // Auto lineup stays on primary / listed secondary / legal one-step slide.
    if (fit < 0.88) continue;
    const atSlot = overallAtPosition(player, slot);
    const atHome = overallAtPosition(player, player.position);
    // Do not park someone at a worse seat when their own listing is clearly better.
    // (e.g. a star SG/SF should not start at PF just because the four is thin.)
    if (player.position !== slot && atSlot < atHome - 1) continue;
    const seatBonus =
      player.position === slot ? 8 : player.secondaryPosition === slot ? 5 : 0;
    const score =
      starterSeatScore(player) * fit +
      seatBonus +
      Math.min(rotationTarget(player), 34) * 0.05;
    if (score > bestScore) {
      best = player;
      bestScore = score;
    }
  }

  // Natural listing keeps the job only when nobody clearly better can cover.
  if (natural[0] && rotationTarget(natural[0]) >= 12) {
    const naturalScore =
      starterSeatScore(natural[0]) + 8 + Math.min(rotationTarget(natural[0]), 34) * 0.05;
    if (!best || naturalScore + 1.5 >= bestScore) return natural[0];
  }
  return best ?? natural[0];
}

export type MinutePlan = {
  minutes: Record<string, number>;
  /** Spot each player is staffing in this book (may differ from listed position). */
  coverSlot: Record<string, GmPosition>;
};

/** Typical NBA night: five starters and a deep bench (~11 bodies). */
export const DEFAULT_ROTATION_DEPTH = 10 as const;

export type MinutePlanOptions = {
  starters?: Partial<Record<GmPosition, string | null>>;
  /** Bodies that get minutes. 6–13. Default 11. */
  depth?: number;
};

/** Clamp and normalize a rotation-depth preference. */
export function clampRotationDepth(
  depth?: number | null
): 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 {
  const n = Math.round(depth ?? DEFAULT_ROTATION_DEPTH);
  if (n <= 6) return 6;
  if (n === 7) return 7;
  if (n === 8) return 8;
  if (n === 9) return 9;
  if (n === 10) return 10;
  if (n === 11) return 11;
  if (n === 12) return 12;
  return 13;
}

/** Starter / bench caps that keep 240 honest for a given rotation size. */
function depthCaps(depth: number): {
  pool: number;
  starterMin: number;
  starterMax: number;
  backupMin: number;
  backupMax: number;
  thirdMax: number;
} {
  const pool = clampRotationDepth(depth);
  if (pool === 6) {
    return { pool, starterMin: 32, starterMax: 44, backupMin: 16, backupMax: 28, thirdMax: 8 };
  }
  if (pool === 7) {
    return { pool, starterMin: 30, starterMax: 41, backupMin: 14, backupMax: 24, thirdMax: 10 };
  }
  if (pool === 8) {
    return { pool, starterMin: 28, starterMax: 40, backupMin: 12, backupMax: 22, thirdMax: 12 };
  }
  if (pool === 9) {
    return { pool, starterMin: 27, starterMax: 38, backupMin: 8, backupMax: 24, thirdMax: 12 };
  }
  if (pool === 10) {
    return { pool, starterMin: 25, starterMax: 38, backupMin: 6, backupMax: 22, thirdMax: 12 };
  }
  if (pool === 11) {
    return { pool, starterMin: 22, starterMax: 32, backupMin: 8, backupMax: 16, thirdMax: 12 };
  }
  if (pool === 12) {
    return { pool, starterMin: 20, starterMax: 30, backupMin: 6, backupMax: 14, thirdMax: 10 };
  }
  return { pool, starterMin: 18, starterMax: 28, backupMin: 5, backupMax: 12, thirdMax: 10 };
}

function canCover(player: GmPlayer, slot: GmPosition): boolean {
  return (
    player.position === slot ||
    player.secondaryPosition === slot ||
    slotAccepts(slot, player.position)
  );
}

function coveredMinutes(
  coverSlot: Record<string, GmPosition>,
  out: Record<string, number>,
  slot: GmPosition
): number {
  let sum = 0;
  for (const [id, at] of Object.entries(coverSlot)) {
    if (at === slot) sum += out[id] ?? 0;
  }
  return sum;
}

/**
 * Build the night's body pool: named starters first, one backup per spot when
 * depth allows, then the best remaining wish until `depth` is reached.
 */
function rotationPool(
  roster: GmPlayer[],
  starters: Partial<Record<GmPosition, string | null>> | undefined,
  depth: number
): GmPlayer[] {
  const caps = depthCaps(depth);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const pool: GmPlayer[] = [];
  const used = new Set<string>();
  const take = (player: GmPlayer | undefined) => {
    if (!player || used.has(player.id) || pool.length >= caps.pool) return;
    pool.push(player);
    used.add(player.id);
  };
  for (const slot of FILL_ORDER) {
    const id = starters?.[slot];
    if (id) take(byId.get(id));
  }
  // Reserve genuine backups for the starting seats. A forward's inferred
  // secondary listing cannot fill two different backup jobs at once.
  const backupSeats = [...FILL_ORDER].sort((a, b) =>
    pool.filter(p => roleFit(p, a) >= 0.94).length - pool.filter(p => roleFit(p, b) >= 0.94).length || FILL_ORDER.indexOf(a) - FILL_ORDER.indexOf(b)
  );
  for (const slot of backupSeats) {
    if (pool.length >= caps.pool) break;
    const ranked = roster.filter(p => !used.has(p.id) && roleFit(p, slot) >= 0.84).sort((a, b) => {
      const score = (p: GmPlayer) => rotationTarget(p) * 0.8 + overallOf(p) * 0.12 + roleFit(p, slot) * 12;
      return score(b) - score(a);
    });
    take(ranked[0]);
  }
  for (const player of [...roster].sort(byWish)) {
    if (pool.length >= caps.pool) break;
    take(player);
  }
  return pool;
}

function resolveMinutePlanOptions(
  arg?: Partial<Record<GmPosition, string | null>> | MinutePlanOptions,
  depth?: number
): MinutePlanOptions {
  if (!arg) return { depth };
  const asOpts = arg as MinutePlanOptions;
  const looksLikeOptions =
    Object.prototype.hasOwnProperty.call(arg, "depth") ||
    Object.prototype.hasOwnProperty.call(arg, "starters");
  if (looksLikeOptions) {
    return { starters: asOpts.starters, depth: asOpts.depth ?? depth };
  }
  return {
    starters: arg as Partial<Record<GmPosition, string | null>>,
    depth,
  };
}

/**
 * Minutes for a roster that has to cover five spots inside a depth cap.
 * Starters keep the bulk; the depth setting decides how many backups eat
 * the rest. Bodies outside the pool get 0. `coverSlot` keeps the bars honest
 * when a SG slides to SF.
 */
export function positionalMinutePlan(
  players: GmPlayer[],
  startersOrOptions?: Partial<Record<GmPosition, string | null>> | MinutePlanOptions,
  maybeDepth?: number
): MinutePlan {
  const options = resolveMinutePlanOptions(startersOrOptions, maybeDepth);
  const out: Record<string, number> = {};
  const coverSlot: Record<string, GmPosition> = {};
  for (const player of players) out[player.id] = 0;
  const roster = players.filter((player) => rotationTarget(player) > 0);
  const caps = depthCaps(options.depth ?? DEFAULT_ROTATION_DEPTH);
  if (roster.length < 5) {
    for (const player of roster) {
      out[player.id] = clamp(rotationTarget(player), 0, caps.starterMax);
      coverSlot[player.id] = player.position;
    }
    return {
      minutes: scaleMinutes(
        out,
        roster.reduce((sum, player) => sum + (out[player.id] ?? 0), 0),
        caps.starterMax
      ),
      coverSlot,
    };
  }

  const pool = rotationPool(roster, options.starters, caps.pool);
  const poolIds = new Set(pool.map((player) => player.id));
  const used = new Set<string>();
  const chosenStarters: Partial<Record<GmPosition, GmPlayer>> = {};

  for (const slot of FILL_ORDER) {
    const chosen = options.starters?.[slot];
    const named = chosen
      ? pool.find((player) => player.id === chosen && !used.has(player.id))
      : undefined;
    const namedFits = named && canCover(named, slot);
    const fit =
      (namedFits ? named : undefined) ??
      pickForSlot(slot, pool, used);
    if (!fit) continue;
    chosenStarters[slot] = fit;
    used.add(fit.id);
    coverSlot[fit.id] = slot;
    const wish = rotationTarget(fit);
    const base = STARTER_MINUTES[slot] + (9 - caps.pool) * 1.2;
    // Real MPG wins. A 19-minute specialist does not jump to a 32-minute floor
    // just because the auto chart parked him in the starting five.
    const blended = wish >= 26 ? wish * 0.55 + base * 0.45 : wish * 0.82 + base * 0.18;
    const low = wish >= 26 ? caps.starterMin : Math.max(14, Math.min(wish + 2, caps.starterMin));
    out[fit.id] = clamp(blended, low, Math.min(caps.starterMax, MAX_PLAYER_MINUTES));
  }

  let spare = 0;
  const backupOrder = [...FILL_ORDER].sort(
    (a, b) =>
      (chosenStarters[a] ? (out[chosenStarters[a]!.id] ?? 0) : 0) -
        (chosenStarters[b] ? (out[chosenStarters[b]!.id] ?? 0) : 0) ||
      FILL_ORDER.indexOf(a) - FILL_ORDER.indexOf(b)
  );
  for (const slot of backupOrder) {
    const starter = chosenStarters[slot];
    const open = pool.filter((player) => !used.has(player.id));
    const natural = open.filter((player) => player.position === slot).sort(byWish);
    const secondary = open
      .filter((player) => player.secondaryPosition === slot && player.position !== slot)
      .sort(byWish);
    const slider = open
      .filter(
        (player) =>
          player.position !== slot &&
          player.secondaryPosition !== slot &&
          slotAccepts(slot, player.position)
      )
      .sort(byWish);
    const backup = natural[0] ?? secondary[0] ?? slider[0];
    const room = Math.max(0, 48 - (starter ? (out[starter.id] ?? 0) : 0));
    if (!backup || room < 4) {
      // Orphan starter with real starter minutes: nudge up. Low-MPG
      // chart fillers stay near their wish so stars keep the lead.
      if (starter) {
        const wish = rotationTarget(starter);
        if (wish >= 26 && (out[starter.id] ?? 0) < 36) {
          const bump = Math.min(10, 38 - (out[starter.id] ?? 0));
          out[starter.id] = (out[starter.id] ?? 0) + bump;
        }
      }
      spare += BACKUP_MINUTES[slot];
      continue;
    }
    const wish = rotationTarget(backup);
    const give = Math.min(
      room,
      clamp(wish * 0.3 + BACKUP_MINUTES[slot] * 0.7, caps.backupMin, caps.backupMax)
    );
    out[backup.id] = (out[backup.id] ?? 0) + give;
    coverSlot[backup.id] = slot;
    used.add(backup.id);
    spare += Math.max(0, room - give);
  }

  // Leftover pool seats (third string) fill the thinnest legal spots.
  const extras = pool.filter((player) => !used.has(player.id)).sort(byWish);
  for (const player of extras) {
    if (spare < 4) break;
    const thin = FILL_ORDER.map((slot) => ({
      slot,
      covered: coveredMinutes(coverSlot, out, slot),
      can: canCover(player, slot),
    }))
      .filter((row) => row.can && row.covered < 46)
      .sort((a, b) => a.covered - b.covered)[0];
    if (!thin) continue;
    const room = Math.max(0, caps.thirdMax - (out[player.id] ?? 0));
    const give = Math.min(spare, room, 46 - thin.covered, caps.thirdMax);
    if (give < 4) continue;
    out[player.id] = (out[player.id] ?? 0) + give;
    coverSlot[player.id] = thin.slot;
    used.add(player.id);
    spare -= give;
  }

  // Unused spare prefers players still under their wish, then higher-wish stars.
  // Thin-spot fill alone was pumping 21-MPG orphans up to the starter max.
  if (spare >= 2) {
    const seated = pool.filter((player) => (out[player.id] ?? 0) > 0).sort((a, b) => {
      const aWish = rotationTarget(a);
      const bWish = rotationTarget(b);
      const aGap = aWish - (out[a.id] ?? 0);
      const bGap = bWish - (out[b.id] ?? 0);
      const aSlot = coverSlot[a.id]!;
      const bSlot = coverSlot[b.id]!;
      return (
        (bGap > 0 ? 1 : 0) - (aGap > 0 ? 1 : 0) ||
        bGap - aGap ||
        bWish - aWish ||
        coveredMinutes(coverSlot, out, aSlot) - coveredMinutes(coverSlot, out, bSlot) ||
        (out[a.id] ?? 0) - (out[b.id] ?? 0)
      );
    });
    for (const player of seated) {
      if (spare < 2) break;
      const slot = coverSlot[player.id];
      if (!slot) continue;
      const wish = rotationTarget(player);
      const softCap = minuteSoftCap(wish, caps.starterMax, false);
      const spotRoom = Math.max(0, 50 - coveredMinutes(coverSlot, out, slot));
      const playerRoom = Math.max(0, softCap - (out[player.id] ?? 0));
      const give = Math.min(spare, spotRoom, playerRoom, 4);
      if (give < 1) continue;
      out[player.id] = (out[player.id] ?? 0) + give;
      spare -= give;
    }
  }

  // Zero anyone outside the depth pool (injured already filtered).
  for (const player of players) {
    if (!poolIds.has(player.id)) {
      out[player.id] = 0;
      delete coverSlot[player.id];
    }
  }

  const sum = Object.values(out).reduce((total, minutes) => total + minutes, 0);
  const playerCap = maxMinutesForDepth(caps.pool);
  const scaled = scaleMinutes(out, sum, Math.min(caps.starterMax, playerCap), playerCap);
  // Shallow books leave some spots starter-only. Nudge minutes across spots
  // so the bars stay near 48 instead of 33/52 — without turning role orphans
  // into ironmen past their wish.
  const wishOf: Record<string, number> = {};
  for (const player of pool) wishOf[player.id] = rotationTarget(player);
  equalizePositionMinutes(
    scaled,
    coverSlot,
    Math.min(caps.starterMax, playerCap),
    wishOf
  );
  return { minutes: scaled, coverSlot };
}

/**
 * Soft individual ceiling from wish. High-MPG stars keep the chart cap;
 * role players stay near their book so spare/equalize cannot flatline everyone.
 */
function minuteSoftCap(wish: number, maxCap: number, orphan: boolean): number {
  if (wish >= 28) {
    return orphan ? Math.min(MAX_PLAYER_MINUTES, Math.max(maxCap, 36)) : maxCap;
  }
  const cushion = wish >= 24 ? 8 : 6;
  const soft = Math.min(maxCap, wish + cushion);
  if (!orphan) return soft;
  return Math.min(maxCap, Math.max(soft, Math.min(wish + 10, 30)));
}

/**
 * Move a few minutes from fat spots to thin ones without blowing individual caps.
 * Keeps the depth pool honest when a backup seat could not be filled.
 */
function equalizePositionMinutes(
  out: Record<string, number>,
  coverSlot: Record<string, GmPosition>,
  maxCap: number,
  wishOf: Record<string, number> = {}
): void {
  for (let pass = 0; pass < 24; pass++) {
    const rows = FILL_ORDER.map((slot) => ({
      slot,
      total: coveredMinutes(coverSlot, out, slot),
      ids: Object.entries(coverSlot)
        .filter(([, at]) => at === slot)
        .map(([id]) => id),
    }));
    const low = [...rows].sort((a, b) => a.total - b.total)[0];
    const high = [...rows].sort((a, b) => b.total - a.total)[0];
    if (!low || !high || high.total - low.total <= 6) return;
    // Prefer taking from a backup on the fat spot, giving to the lead on the thin spot.
    const donor = [...high.ids].sort((a, b) => (out[a] ?? 0) - (out[b] ?? 0)).find(
      (id) => (out[id] ?? 0) > 10
    );
    const receiver = [...low.ids].sort((a, b) => (out[b] ?? 0) - (out[a] ?? 0))[0];
    if (!donor || !receiver) return;
    const wish = wishOf[receiver] ?? maxCap;
    const receiverCap = minuteSoftCap(wish, maxCap, low.ids.length === 1);
    if ((out[receiver] ?? 0) >= receiverCap) {
      // This thin lead is already at their soft cap — try the next-fattest donor path
      // by skipping this pass's only receiver (stop rather than overshoot).
      return;
    }
    out[donor] = (out[donor] ?? 0) - 1;
    out[receiver] = (out[receiver] ?? 0) + 1;
  }
}

/** Minutes only (back-compat). Prefer `positionalMinutePlan` when bars need cover slots. */
export function positionalMinuteTargets(
  players: GmPlayer[],
  starters?: Partial<Record<GmPosition, string | null>>,
  depth?: number
): Record<string, number> {
  return positionalMinutePlan(players, { starters, depth }).minutes;
}

function scaleMinutes(
  out: Record<string, number>,
  sum: number,
  maxCap = MAX_PLAYER_MINUTES,
  hardCap = MAX_PLAYER_MINUTES
): Record<string, number> {
  if (sum <= 0) return out;
  const cap = Math.min(maxCap, hardCap);
  const scale = 240 / sum;
  const next: Record<string, number> = {};
  let used = 0;
  const ids = Object.keys(out);
  for (const id of ids) {
    const minutes = Math.round((out[id] ?? 0) * scale);
    next[id] = Math.min(minutes, cap);
    used += next[id]!;
  }
  let left = 240 - used;
  // Keep the pre-scale ranking: leftover goes to the top of the book first,
  // cuts come off the bottom. Filling the short end first was flattening stars
  // into the same bucket as role starters.
  const byIntent = [...ids]
    .filter((id) => (next[id] ?? 0) > 0)
    .sort(
      (a, b) =>
        (out[b] ?? 0) - (out[a] ?? 0) || (next[b] ?? 0) - (next[a] ?? 0)
    );
  let guard = 0;
  while (left !== 0 && byIntent.length && guard < 260) {
    guard += 1;
    let moved = false;
    const order = left > 0 ? byIntent : [...byIntent].reverse();
    for (const id of order) {
      if (left === 0) break;
      if (left > 0) {
        const room = Math.max(0, cap - (next[id] ?? 0));
        if (room <= 0) continue;
        next[id] = (next[id] ?? 0) + 1;
        left -= 1;
        moved = true;
      } else {
        if ((next[id] ?? 0) <= 0) continue;
        next[id] = (next[id] ?? 0) - 1;
        left += 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return next;
}

function isSidelined(player: GmPlayer): boolean {
  return Boolean(player.injury && player.injury.gamesRemaining > 0);
}

export function autoSetLineup(team: GmTeam, players: GmPlayer[]): GmTeam {
  const all = players.filter((p) => p.teamId === team.id);
  // Injured bodies leave the depth chart so minutes redistribute tonight.
  const roster = all.filter((p) => !isSidelined(p)).sort(byWish);
  const starters = bestStartingFive(team, roster);
  const used = new Set(Object.values(starters).filter((id): id is string => Boolean(id)));
  const depth = clampRotationDepth(team.coaching?.rotationDepth);
  const plan = positionalMinutePlan(roster, { starters, depth });
  const minutes: Record<string, number> = { ...plan.minutes };
  for (const player of all) {
    if (isSidelined(player)) minutes[player.id] = 0;
  }
  const benchOrder = roster
    .filter((p) => !used.has(p.id))
    .sort(
      (a, b) =>
        (minutes[b.id] ?? 0) - (minutes[a.id] ?? 0) || byWish(a, b)
    )
    .map((p) => p.id);
  return {
    ...team,
    starters,
    benchOrder,
    coaching: {
      offense: team.coaching?.offense ?? "balanced",
      defense: team.coaching?.defense ?? "balanced",
      tempo: team.coaching?.tempo ?? "normal",
      playThrough: team.coaching?.playThrough ?? [null, null],
      ...team.coaching,
      rotationMode: "auto",
      shifts: undefined,
      positionMinutes: undefined,
      minutes,
      coverSlot: plan.coverSlot,
      rotationDepth: depth,
    },
  };
}

