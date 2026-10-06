/**
 * Deterministic recent-game insight candidates → ranked cards for homepage.
 * Pure: no I/O. Feed slate games + player lines + optional season baselines.
 */

export type RecentInsightCategory =
  | "PLAYER · ABOVE HIS NORM"
  | "PLAYER · BIG NIGHT"
  | "PLAYER · SCORING"
  | "PLAYER · PLAYMAKING"
  | "PLAYER · REBOUNDING"
  | "PLAYER · DEFENSE"
  | "PLAYER · EFFICIENCY"
  | "TEAM · OFFENSE"
  | "TEAM · DEFENSE"
  | "TEAM · MARGIN"
  | "GAME · CLUTCH"
  | "GAME · SCORING"
  | "GAME · PACE"
  | "TREND · LAST 5"
  | "TREND · STREAK";

/** Which number the card is about; drives what the visual emphasizes. */
export type RecentInsightFocus =
  | "surprise"
  | "points"
  | "efficiency"
  | "rebounds"
  | "assists"
  | "stocks"
  | "triple_double"
  | "margin"
  | "comeback"
  | "clutch"
  | "combined"
  | "overtime"
  | "trend";

/** Box-score line behind a player card. Counts only; nothing derived is stored. */
export type RecentInsightStatLine = {
  playerName: string;
  teamAbbr: string;
  opponentAbbr: string;
  result: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  seasonPpg?: number | null;
  baseline?: PlayerBaseline | null;
  /** The stat a surprise card is about. */
  surpriseStat?: SurpriseStat;
};

/** Per-game averages from one full season, used to judge a single game. */
export type PlayerBaseline = {
  season: string;
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  threePm: number;
};

export type SurpriseStat = "points" | "rebounds" | "assists" | "threePm";

export type RecentInsightGameSide = {
  teamId: string;
  abbr: string;
  score: number;
  /** Points per period (Q1..Q4, then OT). Absent when the feed had none. */
  periods?: number[];
};

export type RecentInsightGame = {
  away: RecentInsightGameSide;
  home: RecentInsightGameSide;
};

export type RecentInsightTrendPoint = {
  gameDate: string;
  opponentAbbr: string;
  points: number;
};

export type RecentInsight = {
  id: string;
  category: RecentInsightCategory;
  headline: string;
  description: string;
  /** Scoreline + date label, e.g. "NYK 94, SA 90 · Jun 14". */
  context: string;
  gameId?: string;
  playerId?: string;
  teamId?: string;
  gameDate: string;
  focus?: RecentInsightFocus;
  line?: RecentInsightStatLine;
  game?: RecentInsightGame;
  /** Chronological, oldest first. */
  trend?: RecentInsightTrendPoint[];
  /** Higher = more interesting. */
  priority: number;
  /** Soft diversity bucket for selection. */
  bucket:
    | "surprise"
    | "player"
    | "team"
    | "game"
    | "efficiency"
    | "support"
    | "trend";
};

export type SlateGameInput = {
  id: string;
  season: string;
  gameDate: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeScore: number;
  awayScore: number;
  homePeriodScores?: number[];
  awayPeriodScores?: number[];
  gameType?: string;
  period?: number;
};

export type SlatePlayerLine = {
  gameId: string;
  gameDate: string;
  /** ESPN athlete id for /players routes when known. */
  profileId: string;
  playerName: string;
  teamId: string;
  teamAbbr: string;
  opponentAbbr: string;
  homeAway: "home" | "away";
  result: "W" | "L" | string;
  minutesNum: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  /** Season PPG when known (for context). */
  seasonPpg?: number | null;
  /** Full-season per-game averages; absent for rookies and thin samples. */
  baseline?: PlayerBaseline | null;
};

export type RecentInsightsBuildOptions = {
  games: SlateGameInput[];
  lines: SlatePlayerLine[];
  /** Optional rolling lines keyed by profileId (chronological oldest→newest). */
  recentByPlayer?: Map<string, SlatePlayerLine[]>;
  /** Soft max cards (default 6). */
  limit?: number;
  /** Reference "today" YYYY-MM-DD for date language helpers (unused in engine). */
  asOfDate?: string;
};

function tsPct(pts: number, fga: number, fta: number): number | null {
  const denom = 2 * (fga + 0.44 * fta);
  if (!(denom > 0) || !Number.isFinite(pts)) return null;
  return pts / denom;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatNum(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function scoreline(g: SlateGameInput): string {
  return `${g.awayTeamAbbr} ${g.awayScore}, ${g.homeTeamAbbr} ${g.homeScore}`;
}

function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}`;
}

function contextFor(g: SlateGameInput): string {
  return `${scoreline(g)} · ${formatShortDate(g.gameDate)}`;
}

function statLineOf(line: SlatePlayerLine): RecentInsightStatLine {
  return {
    playerName: line.playerName,
    teamAbbr: line.teamAbbr,
    opponentAbbr: line.opponentAbbr,
    result: line.result,
    minutes: line.minutesNum,
    points: line.points,
    rebounds: line.rebounds,
    assists: line.assists,
    steals: line.steals,
    blocks: line.blocks,
    fgm: line.fgm,
    fga: line.fga,
    threePm: line.threePm,
    threePa: line.threePa,
    ftm: line.ftm,
    fta: line.fta,
    seasonPpg: line.seasonPpg ?? null,
    baseline: line.baseline ?? null,
  };
}

/** A baseline needs this many games before one night is judged against it. */
const MIN_BASELINE_GAMES = 20;

const SURPRISE_RULES: Array<{
  stat: SurpriseStat;
  label: string;
  word: string;
  /** Low averages are floored so a 1-to-4 jump doesn't read as 300%. */
  floor: number;
  minDiff: number;
  minValue: number;
}> = [
  { stat: "points", label: "PTS", word: "points", floor: 6, minDiff: 10, minValue: 18 },
  { stat: "rebounds", label: "REB", word: "rebounds", floor: 3, minDiff: 7, minValue: 11 },
  { stat: "assists", label: "AST", word: "assists", floor: 2, minDiff: 6, minValue: 9 },
  { stat: "threePm", label: "3PM", word: "threes", floor: 1, minDiff: 4, minValue: 5 },
];

export function surpriseRule(stat: SurpriseStat) {
  return SURPRISE_RULES.find((r) => r.stat === stat)!;
}

/** The stat furthest above the player's own norm, scaled by that norm. */
function biggestSurprise(line: SlatePlayerLine) {
  const base = line.baseline;
  if (!base || base.games < MIN_BASELINE_GAMES) return null;
  let best: { rule: (typeof SURPRISE_RULES)[number]; value: number; avg: number; score: number } | null =
    null;
  for (const rule of SURPRISE_RULES) {
    const value = line[rule.stat];
    const avg = base[rule.stat];
    if (!Number.isFinite(value) || !Number.isFinite(avg)) continue;
    const diff = value - avg;
    if (diff < rule.minDiff || value < rule.minValue) continue;
    const score = diff / Math.max(avg, rule.floor);
    if (!best || score > best.score) best = { rule, value, avg, score };
  }
  return best;
}

function periodsOf(raw?: number[]): number[] | undefined {
  if (!raw?.length || raw.some((n) => !Number.isFinite(n))) return undefined;
  return raw;
}

function gameOf(g: SlateGameInput): RecentInsightGame {
  const home = periodsOf(g.homePeriodScores);
  const away = periodsOf(g.awayPeriodScores);
  const paired = home && away && home.length === away.length;
  return {
    away: {
      teamId: g.awayTeamId,
      abbr: g.awayTeamAbbr,
      score: g.awayScore,
      periods: paired ? away : undefined,
    },
    home: {
      teamId: g.homeTeamId,
      abbr: g.homeTeamAbbr,
      score: g.homeScore,
      periods: paired ? home : undefined,
    },
  };
}

function winnerLoser(g: SlateGameInput): {
  winnerId: string;
  winnerAbbr: string;
  loserId: string;
  loserAbbr: string;
  margin: number;
} {
  const homeWins = g.homeScore > g.awayScore;
  return {
    winnerId: homeWins ? g.homeTeamId : g.awayTeamId,
    winnerAbbr: homeWins ? g.homeTeamAbbr : g.awayTeamAbbr,
    loserId: homeWins ? g.awayTeamId : g.homeTeamId,
    loserAbbr: homeWins ? g.awayTeamAbbr : g.homeTeamAbbr,
    margin: Math.abs(g.homeScore - g.awayScore),
  };
}

function isOt(g: SlateGameInput): boolean {
  if (g.period != null && g.period > 4) return true;
  const hp = g.homePeriodScores?.length ?? 0;
  const ap = g.awayPeriodScores?.length ?? 0;
  return Math.max(hp, ap) > 4;
}

/** Rough comeback: trailed after 3 periods, won. */
function q3Comeback(g: SlateGameInput): number | null {
  const h = g.homePeriodScores;
  const a = g.awayPeriodScores;
  if (!h || !a || h.length < 3 || a.length < 3) return null;
  const homeAfter3 = h[0]! + h[1]! + h[2]!;
  const awayAfter3 = a[0]! + a[1]! + a[2]!;
  const homeWins = g.homeScore > g.awayScore;
  if (homeWins && homeAfter3 < awayAfter3) return awayAfter3 - homeAfter3;
  if (!homeWins && awayAfter3 < homeAfter3) return homeAfter3 - awayAfter3;
  return null;
}

function doubleDoubleParts(line: SlatePlayerLine): number {
  let n = 0;
  if (line.points >= 10) n += 1;
  if (line.rebounds >= 10) n += 1;
  if (line.assists >= 10) n += 1;
  if (line.steals >= 10) n += 1;
  if (line.blocks >= 10) n += 1;
  return n;
}

function isTripleDouble(line: SlatePlayerLine): boolean {
  return doubleDoubleParts(line) >= 3;
}

function isNearTripleDouble(line: SlatePlayerLine): boolean {
  if (isTripleDouble(line)) return false;
  const vals = [line.points, line.rebounds, line.assists].sort((a, b) => b - a);
  return vals[0]! >= 10 && vals[1]! >= 10 && vals[2]! >= 8;
}

/**
 * Generate + rank recent insights. Dedupes related player/game stories.
 */
export function buildRecentInsights(
  options: RecentInsightsBuildOptions
): RecentInsight[] {
  const limit = options.limit ?? 6;
  const games = options.games.filter(
    (g) =>
      Number.isFinite(g.homeScore) &&
      Number.isFinite(g.awayScore) &&
      (g.homeScore > 0 || g.awayScore > 0)
  );
  if (!games.length) return [];

  const gameById = new Map(games.map((g) => [g.id, g]));
  const lines = options.lines.filter((l) => gameById.has(l.gameId));
  const candidates: RecentInsight[] = [];
  const push = (insight: RecentInsight) => {
    if (!insight.headline.trim() || !insight.description.trim()) return;
    candidates.push(insight);
  };

  // —— Player performances ——
  // Nights far above the player's own norm, the least predictable stories on a slate.
  for (const line of lines) {
    const hit = biggestSurprise(line);
    if (!hit) continue;
    const g = gameById.get(line.gameId)!;
    const base = line.baseline!;
    const diff = hit.value - hit.avg;
    const minutesJump = line.minutesNum - base.minutes >= 10;
    push({
      id: `surprise-${line.gameId}-${line.profileId}`,
      category: "PLAYER · ABOVE HIS NORM",
      headline: `${line.playerName} · ${hit.value} ${hit.rule.label}`,
      description:
        `${hit.value} ${hit.rule.word}, ${formatNum(diff, 0)} more than his ${formatNum(hit.avg, 1)} a game in ${base.season}.` +
        (minutesJump
          ? ` Played ${Math.round(line.minutesNum)} minutes after averaging ${formatNum(base.minutes, 0)}.`
          : ""),
      context: contextFor(g),
      gameId: g.id,
      playerId: line.profileId,
      teamId: line.teamId,
      gameDate: g.gameDate,
      priority: 70 + Math.min(25, hit.score * 8),
      bucket: "surprise",
      focus: "surprise",
      line: { ...statLineOf(line), surpriseStat: hit.rule.stat },
      game: gameOf(g),
    });
  }

  for (const line of lines) {
    if (line.points < 40) continue;
    const g = gameById.get(line.gameId)!;
    const ts = tsPct(line.points, line.fga, line.fta);
    push({
      id: `pts40-${line.gameId}-${line.profileId}`,
      category: "PLAYER · BIG NIGHT",
      headline: `${line.playerName} · ${line.points} PTS`,
      description: (() => {
        const avg =
          line.baseline && line.baseline.games >= MIN_BASELINE_GAMES
            ? { ppg: line.baseline.points, season: line.baseline.season }
            : null;
        return (
          `${line.points} points${ts != null ? ` at ${formatPct(ts)} true shooting` : ""}` +
          (avg && line.points > avg.ppg
            ? `, ${formatNum(line.points - avg.ppg, 0)} more than his ${formatNum(avg.ppg, 1)} a game in ${avg.season}.`
            : ".")
        );
      })(),
      context: contextFor(g),
      gameId: g.id,
      playerId: line.profileId,
      teamId: line.teamId,
      gameDate: g.gameDate,
      priority: line.points >= 50 ? 85 : 70,
      bucket: "player",
      focus: "points",
      line: statLineOf(line),
      game: gameOf(g),
    });
  }

  for (const line of lines) {
    if (!isTripleDouble(line)) continue;
    const g = gameById.get(line.gameId)!;
    push({
      id: `td-${line.gameId}-${line.profileId}`,
      category: "PLAYER · PLAYMAKING",
      headline: `${line.playerName} · Triple-double`,
      description: `Finished with ${line.points} PTS, ${line.rebounds} REB and ${line.assists} AST against ${line.opponentAbbr}.`,
      context: contextFor(g),
      gameId: g.id,
      playerId: line.profileId,
      teamId: line.teamId,
      gameDate: g.gameDate,
      priority: 78 + Math.min(10, line.points + line.rebounds + line.assists - 30),
      bucket: "support",
      focus: "triple_double",
      line: statLineOf(line),
      game: gameOf(g),
    });
  }

  for (const line of lines) {
    if (!isNearTripleDouble(line)) continue;
    const g = gameById.get(line.gameId)!;
    push({
      id: `near-td-${line.gameId}-${line.profileId}`,
      category: "PLAYER · PLAYMAKING",
      headline: `${line.playerName} · Near triple-double`,
      description: `${line.points} PTS / ${line.rebounds} REB / ${line.assists} AST, one category shy of a triple-double.`,
      context: contextFor(g),
      gameId: g.id,
      playerId: line.profileId,
      teamId: line.teamId,
      gameDate: g.gameDate,
      priority: 55,
      bucket: "support",
      focus: "triple_double",
      line: statLineOf(line),
      game: gameOf(g),
    });
  }

  const efficient = lines
    .map((line) => ({
      line,
      ts: tsPct(line.points, line.fga, line.fta),
    }))
    .filter(
      (x) =>
        x.ts != null &&
        x.ts >= 0.68 &&
        x.line.fga >= 15 &&
        x.line.points >= 25 &&
        x.line.minutesNum >= 24
    )
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  if (efficient[0]) {
    const { line, ts } = efficient[0];
    const g = gameById.get(line.gameId)!;
    push({
      id: `eff-${line.gameId}-${line.profileId}`,
      category: "PLAYER · EFFICIENCY",
      headline: `${line.playerName} · ${formatPct(ts!)} TS`,
      description: `${line.points} points on ${line.fgm}/${line.fga} FG, very efficient for ${line.fga} shot attempts.`,
      context: contextFor(g),
      gameId: g.id,
      playerId: line.profileId,
      teamId: line.teamId,
      gameDate: g.gameDate,
      priority: 62 + Math.min(15, ((ts ?? 0) - 0.68) * 100),
      bucket: "efficiency",
      focus: "efficiency",
      line: statLineOf(line),
      game: gameOf(g),
    });
  }

  const byAst = [...lines].sort((a, b) => b.assists - a.assists);
  if (byAst[0] && byAst[0].assists >= 12) {
    const line = byAst[0];
    const g = gameById.get(line.gameId)!;
    push({
      id: `ast-${line.gameId}-${line.profileId}`,
      category: "PLAYER · PLAYMAKING",
      headline: `${line.playerName} · ${line.assists} AST`,
      description: `Slate-high assist total with ${line.points} points and ${line.rebounds} boards.`,
      context: contextFor(g),
      gameId: g.id,
      playerId: line.profileId,
      teamId: line.teamId,
      gameDate: g.gameDate,
      priority: 50 + Math.min(15, line.assists - 12),
      bucket: "support",
      focus: "assists",
      line: statLineOf(line),
      game: gameOf(g),
    });
  }

  const byReb = [...lines].sort((a, b) => b.rebounds - a.rebounds);
  if (byReb[0] && byReb[0].rebounds >= 15) {
    const line = byReb[0];
    const g = gameById.get(line.gameId)!;
    push({
      id: `reb-${line.gameId}-${line.profileId}`,
      category: "PLAYER · REBOUNDING",
      headline: `${line.playerName} · ${line.rebounds} REB`,
      description: `Slate-high rebound total with ${line.points} points and ${line.assists} assists.`,
      context: contextFor(g),
      gameId: g.id,
      playerId: line.profileId,
      teamId: line.teamId,
      gameDate: g.gameDate,
      priority: 48 + Math.min(12, line.rebounds - 15),
      bucket: "support",
      focus: "rebounds",
      line: statLineOf(line),
      game: gameOf(g),
    });
  }

  // —— Team / game ——
  const byMargin = [...games].sort(
    (a, b) =>
      Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore)
  );
  if (byMargin[0]) {
    const g = byMargin[0];
    const { winnerAbbr, winnerId, margin } = winnerLoser(g);
    if (margin >= 15) {
      push({
        id: `margin-${g.id}`,
        category: "TEAM · MARGIN",
        headline: `${winnerAbbr} · +${margin}`,
        description: `Largest margin of victory from the ${formatShortDate(g.gameDate)} slate.`,
        context: contextFor(g),
        gameId: g.id,
        teamId: winnerId,
        gameDate: g.gameDate,
        priority: 45 + Math.min(25, margin - 15),
        bucket: "team",
        focus: "margin",
        game: gameOf(g),
      });
    }
  }

  const byClose = [...games].sort(
    (a, b) =>
      Math.abs(a.homeScore - a.awayScore) - Math.abs(b.homeScore - b.awayScore)
  );
  if (byClose[0]) {
    const g = byClose[0];
    const margin = Math.abs(g.homeScore - g.awayScore);
    if (margin <= 5) {
      push({
        id: `clutch-${g.id}`,
        category: "GAME · CLUTCH",
        headline: scoreline(g),
        description:
          margin === 0
            ? "Tied after regulation."
            : margin === 1
              ? "Closest finish of the slate, decided by one point."
              : `One of the tightest finishes (${margin}-point margin).`,
        context: `${formatShortDate(g.gameDate)}${isOt(g) ? " · OT" : ""}`,
        gameId: g.id,
        gameDate: g.gameDate,
        priority: 72 - margin * 4 + (isOt(g) ? 12 : 0),
        bucket: "game",
        focus: "clutch",
        game: gameOf(g),
      });
    }
  }

  for (const g of games) {
    if (!isOt(g)) continue;
    push({
      id: `ot-${g.id}`,
      category: "GAME · PACE",
      headline: `${g.awayTeamAbbr} @ ${g.homeTeamAbbr} · OT`,
      description: `Needed overtime. Final: ${scoreline(g)}.`,
      context: contextFor(g),
      gameId: g.id,
      gameDate: g.gameDate,
      priority: 58,
      bucket: "game",
      focus: "overtime",
      game: gameOf(g),
    });
  }

  for (const g of games) {
    const deficit = q3Comeback(g);
    if (deficit == null || deficit < 8) continue;
    const { winnerAbbr, winnerId, margin } = winnerLoser(g);
    push({
      id: `comeback-${g.id}`,
      category: "TEAM · MARGIN",
      headline: `${winnerAbbr} · erased ${deficit}`,
      description: `Trailed by ${deficit} after three quarters and won by ${margin}${isOt(g) ? " in overtime" : ""}.`,
      context: contextFor(g),
      gameId: g.id,
      teamId: winnerId,
      gameDate: g.gameDate,
      priority: 68 + Math.min(15, deficit - 8),
      bucket: "team",
      focus: "comeback",
      game: gameOf(g),
    });
  }

  // —— Trends (minority) ——
  if (options.recentByPlayer) {
    for (const [profileId, hist] of options.recentByPlayer) {
      if (hist.length < 5) continue;
      const last5 = hist.slice(-5);
      const ppg =
        last5.reduce((s, r) => s + r.points, 0) / Math.max(1, last5.length);
      if (ppg < 32) continue;
      const name = last5.at(-1)?.playerName;
      const last = last5.at(-1);
      if (!name || !last) continue;
      // Only if they appeared on this slate
      if (!lines.some((l) => l.profileId === profileId)) continue;
      const g = gameById.get(last.gameId);
      push({
        id: `trend5-${profileId}`,
        category: "TREND · LAST 5",
        headline: `${name} · ${formatNum(ppg, 1)} PPG`,
        description: `Averaging ${formatNum(ppg, 1)} points over his last five games.`,
        context: g
          ? contextFor(g)
          : `${formatShortDate(last.gameDate)} · last 5`,
        gameId: last.gameId,
        playerId: profileId,
        teamId: last.teamId,
        gameDate: last.gameDate,
        priority: 42 + Math.min(20, ppg - 32),
        bucket: "trend",
        focus: "trend",
        line: statLineOf(last),
        trend: last5.map((r) => ({
          gameDate: r.gameDate,
          opponentAbbr: r.opponentAbbr,
          points: r.points,
        })),
      });
    }
  }

  return selectDiverseInsights(candidates, limit);
}

function selectDiverseInsights(
  candidates: RecentInsight[],
  limit: number
): RecentInsight[] {
  const sorted = [...candidates].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
  );
  const out: RecentInsight[] = [];
  const usedPlayers = new Set<string>();
  const usedGames = new Set<string>();
  const usedBuckets = new Map<string, number>();
  const softBucketCap = 2;

  const tryAdd = (c: RecentInsight, enforceDiversity: boolean) => {
    if (out.length >= limit) return;
    if (out.some((x) => x.id === c.id)) return;
    // One card per player; the highest-priority story wins.
    if (c.playerId && usedPlayers.has(c.playerId)) return;
    // One game-level story per game (a comeback and a close finish are the same game).
    const gameLevel = (x: RecentInsight) => x.bucket === "game" || x.bucket === "team";
    if (
      c.gameId &&
      gameLevel(c) &&
      out.some((x) => x.gameId === c.gameId && gameLevel(x))
    ) {
      return;
    }
    if (enforceDiversity) {
      const n = usedBuckets.get(c.bucket) ?? 0;
      if (n >= softBucketCap) return;
    }
    out.push(c);
    if (c.playerId) usedPlayers.add(c.playerId);
    if (c.gameId) usedGames.add(c.gameId);
    usedBuckets.set(c.bucket, (usedBuckets.get(c.bucket) ?? 0) + 1);
  };

  for (const c of sorted) tryAdd(c, true);
  for (const c of sorted) tryAdd(c, false);
  return out;
}

/** Human date eyebrow helper for UI. */
export function recentInsightDateLabel(
  gameDate: string,
  asOfDate: string
): string | null {
  if (gameDate === asOfDate) return "TODAY";
  const asOf = new Date(`${asOfDate}T12:00:00Z`);
  const game = new Date(`${gameDate}T12:00:00Z`);
  if (!Number.isFinite(asOf.getTime()) || !Number.isFinite(game.getTime())) {
    return null;
  }
  const diffDays = Math.round(
    (asOf.getTime() - game.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays === 1) return "LAST NIGHT";
  return null;
}
