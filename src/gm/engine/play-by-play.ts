import type { PlayByPlayEvent } from "@/data/types/play-by-play";
import type { GmBoxPlayerLine, GmBoxScore } from "@/gm/types";
import { createRng } from "@/gm/engine/rng";

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

/** Feet from the attacked rim. x is across the lane, y is out toward half court. */
function spot(three: boolean, rng: () => number): { x: number; y: number } {
  if (three) {
    if (rng() < 0.22) {
      const dir = rng() < 0.5 ? -1 : 1;
      return { x: dir * (22 + rng()), y: 3 + rng() * 4 };
    }
    return { x: (rng() - 0.5) * 30, y: 23.2 + rng() * 2.4 };
  }
  const roll = rng();
  if (roll < 0.46) {
    const angle = rng() * Math.PI;
    const radius = 0.6 + rng() * 2.8;
    return { x: Math.cos(angle) * radius, y: Math.abs(Math.sin(angle) * radius) + 0.5 };
  }
  if (roll < 0.74) return { x: (rng() - 0.5) * 12, y: 6 + rng() * 6 };
  return { x: (rng() - 0.5) * 24, y: 15 + rng() * 6 };
}

export function boxToPlayByPlay(box: GmBoxScore): PlayByPlayEvent[] {
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
    const where = spot(shot.three, rng);
    const dist = Math.max(1, Math.round(where.y + 4));
    const verb = shot.made ? "makes" : "misses";
    const look = shot.three ? `${dist}-foot three pointer` : dist < 6 ? "layup" : `${dist}-foot jumper`;
    let description = `${shot.player.name} ${verb} a ${look}`;
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
  let scored = events.reduce((sum, event) => sum + (event.teamId === team ? event.points : 0), 0);
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
