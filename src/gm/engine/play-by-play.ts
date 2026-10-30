import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import type { GmBoxPlayerLine, GmBoxScore } from "@/gm/types";
import { createRng } from "@/gm/engine/rng";
import { elapsedSeconds } from "@/lib/games/court-events";

/**
 * A simulated play-by-play for a finished GM box, in the same shape the game
 * page shot chart reads. Spots are generated for the chart. Field goals, threes,
 * free throws, rebounds, assists, blocks, steals and turnovers match the box.
 * The last scoreboard line is the box score.
 */

type Side = "home" | "away";

interface PlayerRef {
  id: string;
  name: string;
  side: Side;
  team: string;
}

interface Shot {
  player: PlayerRef;
  three: boolean;
  made: boolean;
  assist: PlayerRef | null;
  block: PlayerRef | null;
}

interface FreeThrow {
  player: PlayerRef;
  made: boolean;
  n: number;
  of: number;
}

type Item =
  | { kind: "shot"; shot: Shot }
  | { kind: "tov"; player: PlayerRef; steal: PlayerRef | null }
  | { kind: "ft"; ft: FreeThrow };

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(rng: () => number, list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = next[i]!;
    next[i] = next[j]!;
    next[j] = swap;
  }
  return next;
}

function clockOf(elapsed: number): { period: number; clockSeconds: number; clock: string } {
  const t = Math.max(0, Math.min(2879, Math.round(elapsed)));
  const period = Math.floor(t / 720) + 1;
  const clockSeconds = 720 - (t % 720);
  return {
    period,
    clockSeconds,
    clock: `${Math.floor(clockSeconds / 60)}:${String(clockSeconds % 60).padStart(2, "0")}`,
  };
}

const THREE_R = 23.75;
const CORNER_X = 22;
const CORNER_Y = Math.sqrt(THREE_R * THREE_R - CORNER_X * CORNER_X);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Unit normal. Box-Muller so spot jitter is a cloud, not a grid. */
function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Feet from the attacked rim. x is across the lane, y is out toward half court.
 * Threes follow the NBA arc (not a flat depth band). Twos scatter by zone
 * instead of sitting on a few horizontal lines — a flat y band becomes a
 * vertical column once the full-court chart maps depth to the long axis.
 */
function spot(three: boolean, rng: () => number): { x: number; y: number } {
  if (three) {
    // Corners are about a quarter of modern threes.
    if (rng() < 0.26) {
      const dir = rng() < 0.5 ? -1 : 1;
      const x = dir * (CORNER_X + 0.15 + rng() * 1.1 + gauss(rng) * 0.25);
      const y = 0.6 + rng() * (CORNER_Y - 0.4) + gauss(rng) * 0.4;
      return {
        x: clamp(x, -24.6, 24.6),
        y: clamp(y, 0.35, CORNER_Y + 1.1),
      };
    }
    // Above the break: sample the arc, then push a little past the line.
    const a0 = Math.atan2(CORNER_Y, CORNER_X);
    const a1 = Math.PI - a0;
    let t = rng();
    const mix = rng();
    if (mix < 0.32) t = 0.5 + (rng() - 0.5) * 0.28; // top of key
    else if (mix < 0.72) t = rng() < 0.5 ? rng() * 0.32 : 0.68 + rng() * 0.32; // wings
    const angle = a0 + t * (a1 - a0);
    const deep = rng() < 0.14 ? rng() * 2.8 : 0;
    const r = clamp(THREE_R + 0.4 + Math.abs(gauss(rng)) * 0.9 + deep, THREE_R + 0.2, 28.5);
    return {
      x: clamp(Math.cos(angle) * r + gauss(rng) * 0.65, -24.6, 24.6),
      y: clamp(Math.sin(angle) * r + gauss(rng) * 0.55, CORNER_Y - 0.8, 31),
    };
  }

  const roll = rng();
  // At the rim.
  if (roll < 0.44) {
    const angle = (rng() - 0.5) * Math.PI * 1.2;
    const radius = Math.abs(gauss(rng)) * 1.45 + rng() * 1.25;
    return {
      x: clamp(Math.cos(angle) * radius + gauss(rng) * 0.35, -5.2, 5.2),
      y: clamp(Math.abs(Math.sin(angle) * radius) + 0.25 + rng() * 0.9, 0.15, 5.8),
    };
  }
  // Paint and short mid.
  if (roll < 0.72) {
    const angle = rng() * Math.PI;
    const radius = 4.2 + rng() * 7 + gauss(rng) * 0.7;
    return {
      x: clamp(Math.cos(angle) * radius * 0.9 + gauss(rng) * 0.9, -9.5, 9.5),
      y: clamp(Math.sin(angle) * radius + 1.2 + gauss(rng) * 0.8, 1.8, 14.5),
    };
  }
  // Elbows.
  if (rng() < 0.38) {
    const dir = rng() < 0.5 ? -1 : 1;
    return {
      x: clamp(dir * (3.5 + rng() * 6.5) + gauss(rng) * 0.9, -12, 12),
      y: clamp(11.5 + rng() * 5.5 + gauss(rng) * 0.8, 8, 19),
    };
  }
  // Wing / baseline mid.
  if (rng() < 0.55) {
    const dir = rng() < 0.5 ? -1 : 1;
    return {
      x: clamp(dir * (9 + rng() * 11) + gauss(rng) * 1.0, -21, 21),
      y: clamp(3.5 + rng() * 12 + gauss(rng) * 0.9, 1.5, 18),
    };
  }
  // Long two just inside the arc.
  const a0 = Math.atan2(CORNER_Y, CORNER_X);
  const angle = a0 + rng() * (Math.PI - 2 * a0);
  const r = 15.5 + rng() * 6.8;
  return {
    x: clamp(Math.cos(angle) * r + gauss(rng) * 0.8, -20.5, 20.5),
    y: clamp(Math.sin(angle) * r + gauss(rng) * 0.7, 5.5, THREE_R - 0.6),
  };
}

export function boxToPlayByPlay(box: GmBoxScore): PlayByPlayEvent[] {
  if (box.events) return box.events;
  const rng = createRng(hash(box.id));
  const home = box.homeTeamId.toUpperCase();
  const away = box.awayTeamId.toUpperCase();
  const bySide = {
    home: box.players.filter((line) => line.teamId === box.homeTeamId),
    away: box.players.filter((line) => line.teamId === box.awayTeamId),
  };
  const teamOf = (side: Side) => (side === "home" ? home : away);
  const ref = (line: GmBoxPlayerLine, side: Side): PlayerRef => ({
    id: line.playerId,
    name: line.playerName,
    side,
    team: teamOf(side),
  });

  const shots: Record<Side, Shot[]> = { home: [], away: [] };
  const ftTokens: Record<Side, { player: PlayerRef; made: boolean }[]> = { home: [], away: [] };
  const orebs: Record<Side, PlayerRef[]> = { home: [], away: [] };
  const drebs: Record<Side, PlayerRef[]> = { home: [], away: [] };
  const assists: Record<Side, PlayerRef[]> = { home: [], away: [] };
  const blocks: Record<Side, PlayerRef[]> = { home: [], away: [] };
  const turnovers: Record<Side, PlayerRef[]> = { home: [], away: [] };
  const steals: Record<Side, PlayerRef[]> = { home: [], away: [] };
  const roster: Record<Side, PlayerRef[]> = { home: [], away: [] };

  for (const side of ["home", "away"] as const) {
    for (const line of bySide[side]) {
      const player = ref(line, side);
      if (line.minutes > 0 || line.fga > 0 || line.fta > 0) roster[side].push(player);
      const twosMade = Math.max(0, line.fgm - line.tpm);
      const twosMiss = Math.max(0, line.fga - line.tpa - twosMade);
      for (let i = 0; i < twosMade; i++) shots[side].push({ player, three: false, made: true, assist: null, block: null });
      for (let i = 0; i < twosMiss; i++) shots[side].push({ player, three: false, made: false, assist: null, block: null });
      for (let i = 0; i < line.tpm; i++) shots[side].push({ player, three: true, made: true, assist: null, block: null });
      for (let i = 0; i < Math.max(0, line.tpa - line.tpm); i++) shots[side].push({ player, three: true, made: false, assist: null, block: null });
      for (let i = 0; i < line.ftm; i++) ftTokens[side].push({ player, made: true });
      for (let i = 0; i < Math.max(0, line.fta - line.ftm); i++) ftTokens[side].push({ player, made: false });
      const offensive = Math.min(line.rebounds, Math.round(line.rebounds * 0.28));
      for (let i = 0; i < offensive; i++) orebs[side].push(player);
      for (let i = 0; i < line.rebounds - offensive; i++) drebs[side].push(player);
      for (let i = 0; i < line.assists; i++) assists[side].push(player);
      for (let i = 0; i < line.blocks; i++) blocks[side].push(player);
      for (let i = 0; i < line.turnovers; i++) turnovers[side].push(player);
      for (let i = 0; i < line.steals; i++) steals[side].push(player);
    }
    for (const key of [shots, ftTokens, orebs, drebs, assists, blocks, turnovers, steals] as const) {
      key[side] = shuffle(rng, key[side] as never) as never;
    }
    for (const shot of shots[side]) {
      if (!shot.made) continue;
      const index = assists[side].findIndex((player) => player.id !== shot.player.id);
      if (index >= 0) shot.assist = assists[side].splice(index, 1)[0] ?? null;
    }
  }

  for (const side of ["home", "away"] as const) {
    const other: Side = side === "home" ? "away" : "home";
    const misses = shots[side].filter((shot) => !shot.made);
    for (const shot of misses) {
      if (blocks[other].length) shot.block = blocks[other].pop()!;
    }
  }

  const ftSets = (side: Side): FreeThrow[][] => {
    const sets: FreeThrow[][] = [];
    const byPlayer = new Map<string, { player: PlayerRef; made: boolean }[]>();
    for (const token of ftTokens[side]) {
      const list = byPlayer.get(token.player.id) ?? [];
      list.push(token);
      byPlayer.set(token.player.id, list);
    }
    for (const queue of byPlayer.values()) {
      let i = 0;
      while (i < queue.length) {
        const of = Math.min(2, queue.length - i);
        const set: FreeThrow[] = [];
        for (let n = 1; n <= of; n++) {
          const token = queue[i]!;
          set.push({ player: token.player, made: token.made, n, of });
          i += 1;
        }
        sets.push(set);
      }
    }
    return sets;
  };

  const items: Item[] = [];
  const bag: Record<Side, Item[]> = {
    home: shuffle(rng, [
      ...turnovers.home.map((player) => ({ kind: "tov" as const, player, steal: steals.away.pop() ?? null })),
      ...shots.home.map((shot) => ({ kind: "shot" as const, shot })),
    ]),
    away: shuffle(rng, [
      ...turnovers.away.map((player) => ({ kind: "tov" as const, player, steal: steals.home.pop() ?? null })),
      ...shots.away.map((shot) => ({ kind: "shot" as const, shot })),
    ]),
  };
  let side: Side = rng() < 0.5 ? "home" : "away";
  let guard = 0;
  while ((bag.home.length || bag.away.length) && guard < 4000) {
    guard += 1;
    const item = bag[side].pop();
    if (item) items.push(item);
    side = side === "home" ? "away" : "home";
  }

  const spliceSets = (sets: FreeThrow[][], at: Side) => {
    if (!sets.length) return;
    const slots: number[] = [];
    items.forEach((item, index) => {
      if (item.kind === "shot" && item.shot.player.side === at) slots.push(index + 1);
    });
    if (!slots.length) slots.push(items.length);
    sets.forEach((set, index) => {
      const atIndex = slots[Math.min(slots.length - 1, index)] ?? items.length;
      const chunk = set.map((ft) => ({ kind: "ft" as const, ft }));
      items.splice(atIndex, 0, ...chunk);
      for (let s = 0; s < slots.length; s++) if (slots[s]! >= atIndex) slots[s]! += chunk.length;
    });
  };
  spliceSets(ftSets("home"), "home");
  spliceSets(ftSets("away"), "away");

  const events: PlayByPlayEvent[] = [];
  let n = 0;
  const push = (
    partial: Omit<
      PlayByPlayEvent,
      "id" | "gameId" | "actionNumber" | "orderNumber" | "period" | "clockSeconds" | "clock" | "scoreHome" | "scoreAway"
    >
  ) => {
    n += 1;
    events.push({
      id: `${box.id}:${n}`,
      gameId: box.gameId,
      actionNumber: n,
      orderNumber: n,
      period: 1,
      clockSeconds: 720,
      clock: "12:00",
      scoreHome: 0,
      scoreAway: 0,
      wallMs: null,
      ...partial,
    });
  };

  const other = (s: Side): Side => (s === "home" ? "away" : "home");
  const foulerFor = (offense: Side): PlayerRef | null => {
    const list = roster[other(offense)];
    return list[Math.floor(rng() * list.length)] ?? null;
  };

  /** Side that just won the ball in transition (steal / DREB). Next FG can be "running". */
  let breakFor: Side | null = null;
  let breakKind: "steal" | "dreb" | null = null;

  for (const item of items) {
    if (item.kind === "tov") {
      const stolen = item.steal;
      push({
        actionType: "turnover",
        subType: stolen ? "steal" : "bad pass",
        description: stolen
          ? `${item.player.name} turnover (${stolen.name} steals)`
          : `${item.player.name} bad pass turnover`,
        teamId: item.player.team,
        teamTricode: item.player.team,
        playerId: item.player.id,
        playerName: item.player.name,
        secondPlayerId: stolen?.id ?? null,
        shotResult: null,
        isFieldGoal: false,
        points: 0,
        locX: (rng() - 0.5) * 16,
        locY: 28 + rng() * 8,
      });
      if (stolen) {
        breakFor = stolen.side;
        breakKind = "steal";
      } else {
        breakFor = null;
        breakKind = null;
      }
      continue;
    }
    if (item.kind === "ft") {
      const { ft } = item;
      if (ft.n === 1) {
        const fouler = foulerFor(ft.player.side);
        if (fouler) {
          const where = spot(false, rng);
          push({
            actionType: "foul",
            subType: "shooting",
            description: `${fouler.name} shooting foul`,
            teamId: fouler.team,
            teamTricode: fouler.team,
            playerId: fouler.id,
            playerName: fouler.name,
            secondPlayerId: ft.player.id,
            shotResult: null,
            isFieldGoal: false,
            points: 0,
            locX: where.x,
            locY: where.y,
          });
        }
      }
      push({
        actionType: "freethrow",
        subType: ft.made ? "made" : "missed",
        description: `${ft.player.name} ${ft.made ? "makes" : "misses"} free throw ${ft.n} of ${ft.of}`,
        teamId: ft.player.team,
        teamTricode: ft.player.team,
        playerId: ft.player.id,
        playerName: ft.player.name,
        secondPlayerId: null,
        shotResult: ft.made ? "Made" : "Missed",
        isFieldGoal: false,
        points: ft.made ? 1 : 0,
        locX: null,
        locY: null,
      });
      continue;
    }

    const shot = item.shot;
    const running =
      breakFor === shot.player.side &&
      rng() < (breakKind === "steal" ? 0.72 : breakKind === "dreb" ? 0.4 : 0);
    breakFor = null;
    breakKind = null;
    // Transition looks live near the rim more often than a set jumper.
    let where = spot(shot.three, rng);
    if (running && !shot.three && rng() < 0.7) {
      where = {
        x: clamp(gauss(rng) * 2.2, -5, 5),
        y: clamp(1.2 + Math.abs(gauss(rng)) * 1.8, 0.5, 6),
      };
    }
    const dist = Math.max(1, Math.round(Math.hypot(where.x, where.y)));
    const verb = shot.made ? "makes" : "misses";
    const look = shot.three
      ? `${dist}-foot three pointer`
      : dist < 6
        ? "layup"
        : `${dist}-foot jumper`;
    let description = `${shot.player.name} ${verb} a ${running ? "running " : ""}${look}`;
    if (shot.assist) description += ` (${shot.assist.name} assists)`;
    if (shot.block) description += ` (${shot.block.name} blocks)`;
    push({
      actionType: shot.three ? "3pt" : "2pt",
      subType: shot.made ? "made" : "missed",
      description,
      teamId: shot.player.team,
      teamTricode: shot.player.team,
      playerId: shot.player.id,
      playerName: shot.player.name,
      secondPlayerId: shot.assist?.id ?? shot.block?.id ?? null,
      shotResult: shot.made ? "Made" : "Missed",
      isFieldGoal: true,
      points: shot.made ? (shot.three ? 3 : 2) : 0,
      locX: where.x,
      locY: where.y,
    });
    if (!shot.made) {
      const board = orebs[shot.player.side].pop() ?? drebs[other(shot.player.side)].pop() ?? null;
      if (board) {
        const offensive = board.side === shot.player.side;
        push({
          actionType: "rebound",
          subType: offensive ? "offensive" : "defensive",
          description: `${board.name} ${offensive ? "offensive" : "defensive"} rebound`,
          teamId: board.team,
          teamTricode: board.team,
          playerId: board.id,
          playerName: board.name,
          secondPlayerId: null,
          shotResult: null,
          isFieldGoal: false,
          points: 0,
          locX: null,
          locY: null,
        });
        if (offensive) {
          breakFor = null;
          breakKind = null;
        } else {
          breakFor = board.side;
          breakKind = "dreb";
        }
      }
    }
  }

  for (const side of ["home", "away"] as const) {
    for (const player of [...orebs[side], ...drebs[side]]) {
      push({
        actionType: "rebound",
        subType: "defensive",
        description: `${player.name} defensive rebound`,
        teamId: player.team,
        teamTricode: player.team,
        playerId: player.id,
        playerName: player.name,
        secondPlayerId: null,
        shotResult: null,
        isFieldGoal: false,
        points: 0,
        locX: null,
        locY: null,
      });
    }
  }

  const span = Math.max(1, events.length);
  events.forEach((event, index) => {
    const placed = clockOf(12 + (index / span) * 2840);
    event.period = placed.period;
    event.clockSeconds = placed.clockSeconds;
    event.clock = placed.clock;
  });

  settle(events, home, box.homeScore);
  settle(events, away, box.awayScore);
  let homeScore = 0;
  let awayScore = 0;
  for (const event of events) {
    if (event.teamId === home) homeScore += event.points;
    else if (event.teamId === away) awayScore += event.points;
    event.scoreHome = homeScore;
    event.scoreAway = awayScore;
  }
  return events;
}

/** The box score can differ from made shots by a point or two. Fold that into the last baskets. */
function settle(events: PlayByPlayEvent[], team: string, target: number) {
  const scored = events.reduce((sum, event) => sum + (event.teamId === team ? event.points : 0), 0);
  let delta = target - scored;
  for (let i = events.length - 1; i >= 0 && delta !== 0; i--) {
    const event = events[i]!;
    if (event.teamId !== team || event.points <= 0) continue;
    if (delta > 0) {
      event.points += delta;
      delta = 0;
    } else {
      const take = Math.min(event.points, -delta);
      event.points -= take;
      delta += take;
    }
  }
}

const REGULATION_SECONDS = 2880;

/**
 * Box lines as of a replay cutoff (game seconds). `null` returns the finished box.
 * Counting stats come from the PBP tape; minutes scale with clock.
 */
export function linesAtCutoff(
  box: GmBoxScore,
  events: PlayByPlayEvent[],
  cutoff: number | null
): GmBoxPlayerLine[] {
  if (cutoff == null) return box.players.map((line) => ({ ...line }));

  type Acc = {
    points: number;
    assists: number;
    rebounds: number;
    steals: number;
    blocks: number;
    turnovers: number;
    fgm: number;
    fga: number;
    tpm: number;
    tpa: number;
    ftm: number;
    fta: number;
  };
  const empty = (): Acc => ({
    points: 0,
    assists: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
  });
  const byId = new Map<string, Acc>();
  const plusMinus = new Map<string, number>();
  for (const line of box.players) byId.set(line.playerId, empty());

  for (const event of events) {
    const t = elapsedSeconds(event.period, event.clockSeconds);
    if (t > cutoff) continue;
    if (box.stints && event.points > 0) {
      const stint = box.stints.find(s => t >= s.start && t < s.end);
      if (stint) {
        const homeScored = (event.teamTricode ?? event.teamId ?? "").toLowerCase() === box.homeTeamId.toLowerCase();
        for (const id of stint.home) plusMinus.set(id, (plusMinus.get(id) ?? 0) + (homeScored ? event.points : -event.points));
        for (const id of stint.away) plusMinus.set(id, (plusMinus.get(id) ?? 0) + (homeScored ? -event.points : event.points));
      }
    }
    const id = event.playerId;
    if (!id) continue;
    const acc = byId.get(id) ?? empty();
    byId.set(id, acc);

    if (event.actionType === "turnover") {
      acc.turnovers += 1;
      if (event.secondPlayerId && /\bsteals\b/i.test(event.description ?? "")) {
        const stl = byId.get(event.secondPlayerId) ?? empty();
        byId.set(event.secondPlayerId, stl);
        stl.steals += 1;
      }
      continue;
    }
    if (event.actionType === "rebound") {
      acc.rebounds += 1;
      continue;
    }
    if (event.actionType === "freethrow") {
      acc.fta += 1;
      if (event.shotResult === "Made") {
        acc.ftm += 1;
        acc.points += event.points || 1;
      }
      continue;
    }
    if (event.isFieldGoal) {
      acc.fga += 1;
      if (event.actionType === "3pt") acc.tpa += 1;
      if (event.shotResult === "Made") {
        acc.fgm += 1;
        if (event.actionType === "3pt") acc.tpm += 1;
        acc.points += event.points || (event.actionType === "3pt" ? 3 : 2);
        if (event.secondPlayerId && /\bassists\b/i.test(event.description ?? "")) {
          const a = byId.get(event.secondPlayerId) ?? empty();
          byId.set(event.secondPlayerId, a);
          a.assists += 1;
        }
      } else if (event.secondPlayerId && /\bblocks\b/i.test(event.description ?? "")) {
        const b = byId.get(event.secondPlayerId) ?? empty();
        byId.set(event.secondPlayerId, b);
        b.blocks += 1;
      }
    }
  }

  const frac = Math.min(1, Math.max(0, cutoff / REGULATION_SECONDS));
  return box.players.map((line) => {
    const acc = byId.get(line.playerId) ?? empty();
    const den = 2 * (acc.fga + 0.44 * acc.fta);
    return {
      ...line,
      minutes: box.stints ? Math.round(box.stints.reduce((n, stint) => n + (stint.home.includes(line.playerId) || stint.away.includes(line.playerId) ? Math.max(0, Math.min(cutoff, stint.end) - stint.start) / 60 : 0), 0) * 10) / 10 : Math.round(line.minutes * frac * 10) / 10,
      points: acc.points,
      assists: acc.assists,
      rebounds: acc.rebounds,
      steals: acc.steals,
      blocks: acc.blocks,
      turnovers: acc.turnovers,
      fgm: acc.fgm,
      fga: acc.fga,
      tpm: acc.tpm,
      tpa: acc.tpa,
      ftm: acc.ftm,
      fta: acc.fta,
      trueShootingPct: den > 0 ? acc.points / den : 0,
      usagePct: 0,
      gameScore: 0,
      plusMinus: plusMinus.get(line.playerId) ?? 0,
    };
  });
}

