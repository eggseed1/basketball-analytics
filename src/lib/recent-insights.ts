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
  | "GAME · COMEBACK"
  | "GAME · RUN"
  | "GAME · SEESAW"
  | "GAME · LATE WINNER"
  | "PLAYER · TAKEOVER"
  | "TEAM · BIG QUARTER"
  | "TEAM · SHOOTING"
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
  | "trend"
  | "deficit"
  | "run"
  | "seesaw"
  | "late_winner"
  | "takeover"
  | "quarter"
  | "threes";

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

/** The moment a game card is about, drawn on its margin chart. */
export type RecentInsightFlowMark =
  | { kind: "point"; t: number; margin: number; label: string }
  | { kind: "span"; t0: number; t1: number; label: string }
  | { kind: "goahead"; t: number; margin: number; label: string };

export type RecentInsightFlow = {
  /** [seconds since tip-off, home minus away] after each scoring play, from [0, 0]. */
  path: [number, number][];
  periods: number;
  mark?: RecentInsightFlowMark;
};

export type RecentInsightGame = {
  away: RecentInsightGameSide;
  home: RecentInsightGameSide;
  /** Only from play logs that add up to the official final. */
  flow?: RecentInsightFlow;
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
  /** The card's big number, when the engine already knows it. */
  hero?: { value: string; label: string };
  /** A player's points in each period, from the play log (takeover cards). */
  periodPoints?: number[];
  /** 0-based period the card is about. */
  focusPeriod?: number;
  /** Who made the team's threes, most first (shooting cards). */
  contributors?: { name: string; value: number }[];
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
  /** Scoring plays, only when the play log adds up to the official final. */
  flow?: SlateGameFlow;
};

/** One scoring play from a play log that matches the official final. */
export type SlateFlowPlay = {
  /** Seconds since tip-off. */
  t: number;
  period: number;
  /** Time left in the period, "m:ss". */
  clock: string;
  home: number;
  away: number;
  side: "home" | "away";
  points: number;
  scorerId?: string | null;
  scorerName?: string | null;
  /** False when the feed logged this play late under someone else's clock. */
  clockKnown?: boolean;
};

export type SlateGameFlow = {
  plays: SlateFlowPlay[];
  periods: number;
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

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function periodsOf(raw?: number[]): number[] | undefined {
  if (!raw?.length || raw.some((n) => !Number.isFinite(n))) return undefined;
  return raw;
}

function gameOf(g: SlateGameInput, mark?: RecentInsightFlowMark): RecentInsightGame {
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
    ...(g.flow
      ? {
          flow: {
            path: [[0, 0], ...g.flow.plays.map((p): [number, number] => [p.t, p.home - p.away])],
            periods: g.flow.periods,
            ...(mark ? { mark } : {}),
          },
        }
      : {}),
  };
}

const QUARTER_WORDS = ["first", "second", "third", "fourth"];

/** "third quarter", "overtime", "second overtime". */
function periodName(period: number, periods: number): string {
  if (period <= 4) return `${QUARTER_WORDS[period - 1]} quarter`;
  if (periods === 5) return "overtime";
  return `${QUARTER_WORDS[period - 5] ?? `${period - 4}th`} overtime`;
}

/** "Q3", "OT", "2OT" for a 1-based period. */
export function shortPeriodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

function gameSeconds(periods: number): number {
  return 4 * 720 + Math.max(0, periods - 4) * 300;
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
    if (insight.playerId && insight.game?.flow) {
      const { flow: _flow, ...game } = insight.game;
      insight = { ...insight, game };
    }
    candidates.push(insight);
  };

  // —— Game stories from the play log ——
  for (const g of games) {
    for (const story of flowStories(g, lines)) push(story);
  }
  for (const g of games) {
    const quarter = bigQuarter(g);
    if (quarter) push(quarter);
    const threes = hotThrees(g, lines);
    if (threes) push(threes);
  }

  // —— Player performances ——
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

/**
 * Nights far above the player's own per-game norm, one per player, most
 * surprising first. Players without a full-season baseline never appear.
 */
export function buildAboveNormNights(
  options: Pick<RecentInsightsBuildOptions, "games" | "lines">,
  limit = 5
): RecentInsight[] {
  const gameById = new Map(
    options.games
      .filter((g) => g.homeScore > 0 || g.awayScore > 0)
      .map((g) => [g.id, g])
  );
  const out: RecentInsight[] = [];
  for (const line of options.lines) {
    const g = gameById.get(line.gameId);
    const hit = g ? biggestSurprise(line) : null;
    if (!g || !hit) continue;
    const base = line.baseline!;
    const diff = hit.value - hit.avg;
    const minutesJump = line.minutesNum - base.minutes >= 10;
    out.push({
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
    });
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .filter((x) => (seen.has(x.playerId!) ? false : (seen.add(x.playerId!), true)))
    .slice(0, limit);
}

function winnerSide(g: SlateGameInput): "home" | "away" | null {
  if (g.homeScore === g.awayScore) return null;
  return g.homeScore > g.awayScore ? "home" : "away";
}

function abbrOf(g: SlateGameInput, side: "home" | "away"): string {
  return side === "home" ? g.homeTeamAbbr : g.awayTeamAbbr;
}

function teamIdOf(g: SlateGameInput, side: "home" | "away"): string {
  return side === "home" ? g.homeTeamId : g.awayTeamId;
}

function otTail(g: SlateGameInput): string {
  return isOt(g) ? " in overtime" : "";
}

/**
 * Comebacks, runs, lead swings, late go-ahead plays and one-quarter scoring
 * bursts, read off the scoring plays. Nothing here runs without a play log
 * that adds up to the final score.
 */
function flowStories(g: SlateGameInput, lines: SlatePlayerLine[]): RecentInsight[] {
  const flow = g.flow;
  const winner = winnerSide(g);
  if (!flow?.plays.length || !winner) return [];
  const plays = flow.plays;
  const loser = winner === "home" ? "away" : "home";
  const W = abbrOf(g, winner);
  const L = abbrOf(g, loser);
  const margin = Math.abs(g.homeScore - g.awayScore);
  const marginOf = (i: number) => (i < 0 ? 0 : plays[i]!.home - plays[i]!.away);
  const forSide = (side: "home" | "away", i: number) =>
    side === "home" ? marginOf(i) : -marginOf(i);
  const base = { context: contextFor(g), gameId: g.id, gameDate: g.gameDate };
  const out: RecentInsight[] = [];

  // Biggest hole the winner climbed out of.
  let low = 0;
  let lowAt = -1;
  plays.forEach((_, i) => {
    const m = forSide(winner, i);
    if (m < low) {
      low = m;
      lowAt = i;
    }
  });
  if (-low >= 12) {
    const p = plays[lowAt]!;
    out.push({
      ...base,
      id: `deficit-${g.id}`,
      category: "GAME · COMEBACK",
      headline: `${W} · erased ${-low}`,
      description: `${W} trailed by ${-low} ${p.clockKnown === false ? "in" : `with ${p.clock} left in`} the ${periodName(p.period, flow.periods)} and won by ${margin}${otTail(g)}.`,
      teamId: teamIdOf(g, winner),
      priority: 72 + Math.min(20, (-low - 12) * 1.5),
      bucket: "game",
      focus: "deficit",
      hero: { value: `−${-low}`, label: "Biggest deficit" },
      game: gameOf(g, { kind: "point", t: p.t, margin: marginOf(lowAt), label: `${W} down ${-low}` }),
    });
  }

  // Longest stretch of unanswered points.
  let best: { side: "home" | "away"; points: number; start: number; end: number } | null = null;
  for (let i = 0; i < plays.length; ) {
    let j = i;
    let pts = 0;
    while (j < plays.length && plays[j]!.side === plays[i]!.side) pts += plays[j++]!.points;
    if (!best || pts > best.points) best = { side: plays[i]!.side, points: pts, start: i, end: j - 1 };
    i = j;
  }
  if (best && best.points >= 14) {
    const team = abbrOf(g, best.side);
    const a = plays[best.start]!;
    const b = plays[best.end]!;
    const before = forSide(best.side, best.start - 1);
    const after = forSide(best.side, best.end);
    const timed = plays.slice(best.start, best.end + 1).every((p) => p.clockKnown !== false);
    const when = !timed
      ? a.period === b.period
        ? `in the ${periodName(a.period, flow.periods)}`
        : `from the ${periodName(a.period, flow.periods)} into the ${periodName(b.period, flow.periods)}`
      : a.period === b.period
        ? `between ${a.clock} and ${b.clock} left in the ${periodName(a.period, flow.periods)}`
        : `from ${a.clock} left in the ${periodName(a.period, flow.periods)} to ${b.clock} left in the ${periodName(b.period, flow.periods)}`;
    const swing =
      before < 0
        ? after > 0
          ? `turning a ${-before}-point deficit into a ${after}-point lead`
          : after === 0
            ? `erasing a ${-before}-point deficit`
            : `cutting a ${-before}-point deficit to ${-after}`
        : before === 0
          ? `breaking a tie to lead by ${after}`
          : `stretching a ${before}-point lead to ${after}`;
    out.push({
      ...base,
      id: `run-${g.id}`,
      category: "GAME · RUN",
      headline: `${team} · ${best.points}-0 run`,
      description:
        `${team} scored ${best.points} straight ${when}, ${swing}.` +
        (best.side === loser ? ` ${team} still lost by ${margin}${otTail(g)}.` : ""),
      teamId: teamIdOf(g, best.side),
      priority: 60 + Math.min(25, (best.points - 14) * 2.5),
      bucket: "game",
      focus: "run",
      hero: { value: `${best.points}-0`, label: "Run" },
      game: gameOf(g, { kind: "span", t0: a.t, t1: b.t, label: `${best.points}-0 ${team}` }),
    });
  }

  // Lead changes and ties.
  let leadChanges = 0;
  let ties = 0;
  let leader = 0;
  let maxLead = 0;
  plays.forEach((_, i) => {
    const m = marginOf(i);
    const sign = Math.sign(m);
    if (sign !== 0 && leader !== 0 && sign !== leader) leadChanges += 1;
    if (sign === 0 && marginOf(i - 1) !== 0) ties += 1;
    if (sign !== 0) leader = sign;
    maxLead = Math.max(maxLead, Math.abs(m));
  });
  if (leadChanges >= 14) {
    out.push({
      ...base,
      id: `seesaw-${g.id}`,
      category: "GAME · SEESAW",
      headline: `${g.awayTeamAbbr} @ ${g.homeTeamAbbr} · ${leadChanges} lead changes`,
      description:
        `${leadChanges} lead changes and ${ties} ties.` +
        (maxLead <= 10
          ? ` Neither team led by more than ${maxLead}.`
          : ` The biggest lead was ${maxLead}.`) +
        ` ${W} won by ${margin}${otTail(g)}.`,
      teamId: teamIdOf(g, winner),
      priority: 56 + Math.min(20, (leadChanges - 14) * 2),
      bucket: "game",
      focus: "seesaw",
      hero: { value: String(leadChanges), label: "Lead changes" },
      game: gameOf(g),
    });
  }

  // When the winner went ahead for good.
  let lastLevel = -1;
  plays.forEach((_, i) => {
    if (forSide(winner, i) <= 0) lastLevel = i;
  });
  const goAhead = lastLevel + 1;
  const linesById = new Map(lines.filter((l) => l.gameId === g.id).map((l) => [l.profileId, l]));
  const ahead = plays[goAhead];
  if (lastLevel >= 0 && ahead && margin <= 5) {
    const timed = ahead.clockKnown !== false;
    const left = gameSeconds(flow.periods) - ahead.t;
    const lastShot = goAhead === plays.length - 1;
    if (lastShot || (timed && left <= 60)) {
      const before = plays[lastLevel]!;
      const level = before.home === before.away;
      const shot = ahead.points === 3 ? "three" : ahead.points === 1 ? "free throw" : "basket";
      const scorer = ahead.scorerName ?? (ahead.scorerId ? linesById.get(ahead.scorerId)?.playerName : null);
      const who = scorer ? `${scorer}'s ${shot}` : `${W}'s ${shot}`;
      const state = level
        ? `broke a ${before.home}-${before.away} tie`
        : `turned a ${Math.abs(before.home - before.away)}-point deficit into the lead`;
      const when = timed ? ` with ${ahead.clock} left${ahead.period > 4 ? ` in ${periodName(ahead.period, flow.periods)}` : ""}` : "";
      out.push({
        ...base,
        id: `late-${g.id}`,
        category: "GAME · LATE WINNER",
        headline: `${W} · ${lastShot ? "won on the last score" : `ahead for good with ${ahead.clock} left`}`,
        description: lastShot
          ? `${who} ${state}${when}, and nobody scored again. ${W} won by ${margin}${otTail(g)}.`
          : `${who} ${state}${when}, and ${W} never trailed again. ${W} won by ${margin}${otTail(g)}.`,
        teamId: teamIdOf(g, winner),
        priority: (lastShot ? 86 : 80 + Math.round((60 - left) / 10)) + (ahead.period > 4 ? 4 : 0),
        bucket: "game",
        focus: "late_winner",
        hero: timed
          ? { value: ahead.clock, label: "Left at the go-ahead" }
          : { value: `${before.away}-${before.home}`, label: level ? "Tied before the winner" : "Score before the winner" },
        game: gameOf(g, {
          kind: "goahead",
          t: ahead.t,
          margin: marginOf(goAhead),
          label: timed ? ahead.clock : "Winner",
        }),
      });
    }
  }

  // One player's big quarter, only when the log credits every one of his points.
  const byPlayer = new Map<string, number[]>();
  for (const p of plays) {
    if (!p.scorerId || !linesById.has(p.scorerId)) continue;
    const arr = byPlayer.get(p.scorerId) ?? Array.from({ length: flow.periods }, () => 0);
    arr[p.period - 1] = (arr[p.period - 1] ?? 0) + p.points;
    byPlayer.set(p.scorerId, arr);
  }
  let burst: {
    line: SlatePlayerLine;
    periodPoints: number[];
    period: number;
    points: number;
    score: number;
  } | null = null;
  for (const [id, periodPoints] of byPlayer) {
    const line = linesById.get(id)!;
    if (sum(periodPoints) !== line.points) continue;
    for (let i = 0; i < periodPoints.length; i++) {
      const pts = periodPoints[i]!;
      // A late burst only counts lower when the game was still in reach.
      const firstPlay = plays.findIndex((p) => p.period === i + 1);
      const late = i >= 3 && firstPlay >= 0 && Math.abs(marginOf(firstPlay - 1)) <= 8;
      if (pts < (late ? 12 : 15)) continue;
      const score = pts + (late ? 4 : 0);
      if (!burst || score > burst.score) burst = { line, periodPoints, period: i, points: pts, score };
    }
  }
  if (burst) {
    const { line, periodPoints, period, points } = burst;
    const side = line.teamId === g.homeTeamId ? "home" : "away";
    const mine = (side === "home" ? g.homePeriodScores : g.awayPeriodScores)?.[period];
    const theirs = (side === "home" ? g.awayPeriodScores : g.homePeriodScores)?.[period];
    const quarter =
      mine == null || theirs == null
        ? "."
        : mine > theirs
          ? `, when ${line.teamAbbr} won the period ${mine}-${theirs}.`
          : mine < theirs
            ? `, though ${line.opponentAbbr} won the period ${theirs}-${mine}.`
            : `, in a period that ended tied at ${mine}.`;
    out.push({
      ...base,
      id: `takeover-${g.id}-${line.profileId}`,
      category: "PLAYER · TAKEOVER",
      headline: `${line.playerName} · ${points} in the ${periodName(period + 1, flow.periods)}`,
      description: `${points} of his ${line.points} points came in the ${periodName(period + 1, flow.periods)}${quarter}`,
      playerId: line.profileId,
      teamId: line.teamId,
      priority: Math.min(92, 62 + (points - 12) * 2 + (period >= 3 ? 6 : 0)),
      bucket: "player",
      focus: "takeover",
      hero: { value: String(points), label: `PTS in ${shortPeriodLabel(period + 1)}` },
      line: statLineOf(line),
      periodPoints,
      focusPeriod: period,
    });
  }

  return out;
}

/** A team's huge quarter, from the line score alone. */
function bigQuarter(g: SlateGameInput): RecentInsight | null {
  const home = periodsOf(g.homePeriodScores);
  const away = periodsOf(g.awayPeriodScores);
  if (!home || !away || home.length !== away.length) return null;
  if (sum(home) !== g.homeScore || sum(away) !== g.awayScore) return null;
  let best: { side: "home" | "away"; i: number; pts: number; diff: number; score: number } | null = null;
  for (let i = 0; i < Math.min(4, home.length); i++) {
    for (const side of ["home", "away"] as const) {
      const pts = side === "home" ? home[i]! : away[i]!;
      const diff = pts - (side === "home" ? away[i]! : home[i]!);
      if (pts < 44 && diff < 20) continue;
      const score = Math.max(0, pts - 44) * 2 + Math.max(0, diff - 20) * 1.5 + pts / 10;
      if (!best || score > best.score) best = { side, i, pts, diff, score };
    }
  }
  if (!best) return null;
  const team = abbrOf(g, best.side);
  const won = winnerSide(g) === best.side;
  const margin = Math.abs(g.homeScore - g.awayScore);
  const quarter = periodName(best.i + 1, home.length);
  return {
    id: `quarter-${g.id}`,
    category: "TEAM · BIG QUARTER",
    headline: `${team} · ${best.pts} in the ${quarter}`,
    description:
      `${team} scored ${best.pts} in the ${quarter}` +
      (best.diff > 0
        ? ` and won it by ${best.diff}.`
        : best.diff < 0
          ? ` and still lost it by ${-best.diff}.`
          : ".") +
      (margin ? ` ${team} ${won ? "won" : "lost"} by ${margin}${otTail(g)}.` : ""),
    context: contextFor(g),
    gameId: g.id,
    teamId: teamIdOf(g, best.side),
    gameDate: g.gameDate,
    priority: Math.min(80, 50 + best.score),
    bucket: "team",
    focus: "quarter",
    hero: { value: String(best.pts), label: `PTS in ${shortPeriodLabel(best.i + 1)}` },
    focusPeriod: best.i,
    game: gameOf(g),
  };
}

/** A team that made 20 or more threes, with who made them. */
function hotThrees(g: SlateGameInput, lines: SlatePlayerLine[]): RecentInsight | null {
  let best: RecentInsight | null = null;
  for (const side of ["home", "away"] as const) {
    const teamId = teamIdOf(g, side);
    const mine = lines.filter((l) => l.gameId === g.id && l.teamId === teamId);
    const made = mine.reduce((s, l) => s + l.threePm, 0);
    const att = mine.reduce((s, l) => s + l.threePa, 0);
    if (made < 20 || !(att > 0)) continue;
    const contributors = mine
      .filter((l) => l.threePm > 0)
      .sort((a, b) => b.threePm - a.threePm)
      .map((l) => ({ name: l.playerName, value: l.threePm }));
    const top = contributors[0]!;
    const team = abbrOf(g, side);
    const won = winnerSide(g) === side;
    const insight: RecentInsight = {
      id: `threes-${g.id}-${teamId}`,
      category: "TEAM · SHOOTING",
      headline: `${team} · ${made} threes`,
      description:
        `${team} went ${made} of ${att} from three (${Math.round((made / att) * 100)}%) and ${won ? "won" : "lost"}. ` +
        `${top.name} made ${top.value} of them.`,
      context: contextFor(g),
      gameId: g.id,
      teamId,
      gameDate: g.gameDate,
      priority: Math.min(80, 52 + (made - 20) * 3),
      bucket: "team",
      focus: "threes",
      hero: { value: String(made), label: "Threes made" },
      contributors: contributors.slice(0, 6),
      game: gameOf(g),
    };
    if (!best || insight.priority > best.priority) best = insight;
  }
  return best;
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
  // Game stories are the point of the section, so they get one more slot.
  const capFor = (bucket: string) => (bucket === "game" ? 3 : 2);

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
      if (n >= capFor(c.bucket)) return;
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
