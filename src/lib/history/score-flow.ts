/**
 * Historical descriptive event types + score-flow engines (P18A).
 * Deterministic. No DRBL. No lineup reconstruction.
 */

export type HistoryEventType =
  | "MADE_SHOT"
  | "MISSED_SHOT"
  | "FREE_THROW"
  | "REBOUND"
  | "TURNOVER"
  | "FOUL"
  | "SUBSTITUTION"
  | "TIMEOUT"
  | "JUMP_BALL"
  | "PERIOD_START"
  | "PERIOD_END"
  | "OTHER";

export interface RawHistoryAction {
  actionNumber?: number;
  clock?: string;
  period?: number;
  teamId?: number | string;
  personId?: number | string;
  playerName?: string;
  playerNameI?: string;
  description?: string;
  actionType?: string;
  subType?: string;
  shotResult?: string;
  isFieldGoal?: number;
  scoreHome?: string | number;
  scoreAway?: string | number;
  shotValue?: number;
  pointsTotal?: number;
  actionId?: number;
  xLegacy?: number;
  yLegacy?: number;
  shotDistance?: number;
}

export interface HistoryEvent {
  eventIndex: number;
  period: number;
  clock: string;
  clockSeconds: number;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  eventType: HistoryEventType;
  description: string;
  points: number;
  homeScore: number;
  awayScore: number;
  assistPlayerId: string | null;
  secondaryPlayerId: string | null;
  sourceEventId: string;
}

export interface ScoreTimelinePoint {
  period: number;
  clock: string;
  elapsedGameTime: number;
  homeScore: number;
  awayScore: number;
  margin: number;
  scoringTeamId: string;
  scorerId: string | null;
  points: number;
  eventIndex: number;
}

export interface StrictScoringRun {
  teamId: string;
  points: number;
  startEventIndex: number;
  endEventIndex: number;
  startPeriod: number;
  startClock: string;
  endPeriod: number;
  endClock: string;
  scoreBefore: { home: number; away: number };
  scoreAfter: { home: number; away: number };
  scorerIds: string[];
}

export interface GameFlowStats {
  largestHomeLead: number;
  largestAwayLead: number;
  largestDeficitOvercomeByWinner: number;
  leadChanges: number;
  ties: number;
  largestStrictRunHome: StrictScoringRun | null;
  largestStrictRunAway: StrictScoringRun | null;
  runs: StrictScoringRun[];
}

export function parsePlayClockToSeconds(clock: string): number {
  const match = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
    String(clock ?? "").trim()
  );
  if (!match) {
    const m = /^(\d+):(\d{2})$/.exec(String(clock ?? "").trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    return 0;
  }
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2] ?? 0);
  return minutes * 60 + seconds;
}

export function formatPlayClock(clockSeconds: number): string {
  const total = Math.max(0, Math.floor(clockSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function mapActionType(action: RawHistoryAction): HistoryEventType {
  const t = String(action.actionType ?? "")
    .trim()
    .toLowerCase();
  const sub = String(action.subType ?? "")
    .trim()
    .toLowerCase();
  const desc = String(action.description ?? "");

  if (t === "period") {
    if (sub === "start" || /start of/i.test(desc)) return "PERIOD_START";
    if (sub === "end" || /end of/i.test(desc)) return "PERIOD_END";
    return "OTHER";
  }
  if (t === "made shot") return "MADE_SHOT";
  if (t === "missed shot") return "MISSED_SHOT";
  if (t === "free throw") return "FREE_THROW";
  if (t === "rebound") return "REBOUND";
  if (t === "turnover") return "TURNOVER";
  if (t === "foul") return "FOUL";
  if (t === "substitution") return "SUBSTITUTION";
  if (t === "timeout") return "TIMEOUT";
  if (t === "jump ball") return "JUMP_BALL";
  return "OTHER";
}

function asNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asId(v: unknown): string | null {
  const n = asNum(v);
  if (!n) return null;
  return String(n);
}

function parseAssistId(description: string): string | null {
  // Descriptions use names, not IDs — leave null; product links via description text.
  void description;
  return null;
}

function isMadeFreeThrow(action: RawHistoryAction): boolean {
  const desc = String(action.description ?? "");
  if (/^MISS\b/i.test(desc) || /\bMISS\b/i.test(desc)) return false;
  if (String(action.shotResult ?? "") === "Missed") return false;
  return true;
}

function isScoringAction(action: RawHistoryAction): boolean {
  const t = String(action.actionType ?? "").toLowerCase();
  if (t === "made shot") return true;
  if (t === "free throw") return isMadeFreeThrow(action);
  return false;
}

function pointsForScoringAction(
  action: RawHistoryAction,
  homeBefore: number,
  awayBefore: number
): { home: number; away: number; points: number; scoringTeamId: string | null } {
  const h = asNum(action.scoreHome);
  const a = asNum(action.scoreAway);
  const teamId = asId(action.teamId);
  if (h + a >= homeBefore + awayBefore && (h !== homeBefore || a !== awayBefore)) {
    return {
      home: h,
      away: a,
      points: h - homeBefore + (a - awayBefore),
      scoringTeamId:
        h > homeBefore ? "HOME" : a > awayBefore ? "AWAY" : teamId,
    };
  }
  const shotValue = asNum(action.shotValue);
  let pts = shotValue;
  if (!pts) {
    const t = String(action.actionType ?? "").toLowerCase();
    if (t === "free throw") pts = 1;
    else if (/3pt|3-pt|three/i.test(String(action.subType ?? ""))) pts = 3;
    else pts = 2;
  }
  // Prefer team location when absolute scores unusable
  // Without home/away team ids here, use score fields if one side moved in description PTS
  const m = /\((\d+)\s*PTS\)/i.exec(String(action.description ?? ""));
  if (m) pts = Number(m[1]) >= 1 && Number(m[1]) <= 3 ? pts : pts;
  void m;
  return {
    home: homeBefore,
    away: awayBefore,
    points: pts,
    scoringTeamId: teamId,
  };
}

/**
 * Normalize raw actions into compact history events with running scores.
 * Non-scoring rows with bogus 0-0 score tags keep prior running totals.
 */
export function normalizeHistoryEvents(
  actions: RawHistoryAction[],
  opts: { homeTeamId: string; awayTeamId: string; gameId: string }
): HistoryEvent[] {
  let home = 0;
  let away = 0;
  const out: HistoryEvent[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const eventType = mapActionType(action);
    let points = 0;
    let scoringTeamResolved: string | null = null;

    if (isScoringAction(action)) {
      const scored = pointsForScoringAction(action, home, away);
      if (
        scored.home !== home ||
        scored.away !== away ||
        (scored.points > 0 &&
          scored.home === home &&
          scored.away === away &&
          scored.scoringTeamId)
      ) {
        if (scored.home !== home || scored.away !== away) {
          home = scored.home;
          away = scored.away;
          points = scored.points;
        } else if (scored.scoringTeamId === opts.homeTeamId) {
          home += scored.points;
          points = scored.points;
        } else if (scored.scoringTeamId === opts.awayTeamId) {
          away += scored.points;
          points = scored.points;
        } else {
          // Unknown team — try location via score fields failing; skip point add
          points = 0;
        }
        scoringTeamResolved = scored.scoringTeamId;
      } else {
        home = scored.home;
        away = scored.away;
        points = scored.points;
        scoringTeamResolved = scored.scoringTeamId;
      }
      void scoringTeamResolved;
    }

    const clockSeconds = parsePlayClockToSeconds(String(action.clock ?? ""));
    out.push({
      eventIndex: i,
      period: asNum(action.period) || 1,
      clock: formatPlayClock(clockSeconds),
      clockSeconds,
      teamId: asId(action.teamId),
      playerId: asId(action.personId),
      playerName:
        String(action.playerNameI || action.playerName || "").trim() || null,
      eventType,
      description: String(action.description ?? ""),
      points,
      homeScore: home,
      awayScore: away,
      assistPlayerId: parseAssistId(String(action.description ?? "")),
      secondaryPlayerId: null,
      sourceEventId: String(
        action.actionId ?? action.actionNumber ?? i
      ),
    });
  }

  return out;
}

function periodLengthSeconds(period: number): number {
  return period <= 4 ? 12 * 60 : 5 * 60;
}

export function elapsedGameTimeSeconds(
  period: number,
  clockSecondsRemaining: number
): number {
  let elapsed = 0;
  for (let p = 1; p < period; p++) elapsed += periodLengthSeconds(p);
  const len = periodLengthSeconds(period);
  return elapsed + Math.max(0, len - clockSecondsRemaining);
}

export function buildScoreTimeline(
  events: HistoryEvent[],
  opts: { homeTeamId: string; awayTeamId: string }
): ScoreTimelinePoint[] {
  const points: ScoreTimelinePoint[] = [];
  let prevH = 0;
  let prevA = 0;
  for (const e of events) {
    if (e.points <= 0) continue;
    if (e.homeScore === prevH && e.awayScore === prevA) continue;
    const dh = e.homeScore - prevH;
    const da = e.awayScore - prevA;
    const scoringTeamId =
      dh > 0 ? opts.homeTeamId : da > 0 ? opts.awayTeamId : e.teamId ?? "";
    points.push({
      period: e.period,
      clock: e.clock,
      elapsedGameTime: elapsedGameTimeSeconds(e.period, e.clockSeconds),
      homeScore: e.homeScore,
      awayScore: e.awayScore,
      margin: e.homeScore - e.awayScore,
      scoringTeamId,
      scorerId: e.playerId,
      points: dh + da,
      eventIndex: e.eventIndex,
    });
    prevH = e.homeScore;
    prevA = e.awayScore;
  }
  return points;
}

/**
 * Lead change: home lead ↔ away lead.
 * home→tie→away = 1 lead change. Opening 0-0 is not a tie.
 */
export function countLeadChangesAndTies(
  timeline: ScoreTimelinePoint[]
): { leadChanges: number; ties: number } {
  let leadChanges = 0;
  let ties = 0;
  let prevLead: -1 | 0 | 1 = 0; // before tip: tied 0-0, not counted as tie event

  for (const p of timeline) {
    const lead: -1 | 0 | 1 =
      p.margin > 0 ? 1 : p.margin < 0 ? -1 : 0;
    if (lead === 0 && (p.homeScore > 0 || p.awayScore > 0)) {
      ties += 1;
    }
    if (prevLead !== 0 && lead !== 0 && lead !== prevLead) {
      leadChanges += 1;
    }
    // home → tie → away: when we leave a non-zero lead into opposite via tie,
    // count happens when opposite lead appears (prevLead updated through 0)
    if (lead !== 0) prevLead = lead;
    else if (p.homeScore > 0 || p.awayScore > 0) {
      // stay: prevLead remembered so next opposite counts as one change
    }
  }
  return { leadChanges, ties };
}

export function computeLargestLeads(timeline: ScoreTimelinePoint[]): {
  largestHomeLead: number;
  largestAwayLead: number;
} {
  let largestHomeLead = 0;
  let largestAwayLead = 0;
  for (const p of timeline) {
    if (p.margin > largestHomeLead) largestHomeLead = p.margin;
    if (-p.margin > largestAwayLead) largestAwayLead = -p.margin;
  }
  return { largestHomeLead, largestAwayLead };
}

/**
 * Maximum deficit experienced by eventual winner (0 if never trailed).
 */
export function largestDeficitOvercomeByWinner(
  timeline: ScoreTimelinePoint[],
  winnerIsHome: boolean
): number {
  let maxDeficit = 0;
  for (const p of timeline) {
    const deficit = winnerIsHome ? -p.margin : p.margin;
    if (deficit > maxDeficit) maxDeficit = deficit;
  }
  return maxDeficit;
}

export function findStrictRuns(
  timeline: ScoreTimelinePoint[],
  opts: { homeTeamId: string; awayTeamId: string }
): StrictScoringRun[] {
  const runs: StrictScoringRun[] = [];
  let current: StrictScoringRun | null = null;

  for (const p of timeline) {
    const teamId = p.scoringTeamId;
    if (!teamId) continue;
    if (!current || current.teamId !== teamId) {
      if (current) runs.push(current);
      const beforeHome: number =
        p.homeScore - (teamId === opts.homeTeamId ? p.points : 0);
      const beforeAway: number =
        p.awayScore - (teamId === opts.awayTeamId ? p.points : 0);
      current = {
        teamId,
        points: p.points,
        startEventIndex: p.eventIndex,
        endEventIndex: p.eventIndex,
        startPeriod: p.period,
        startClock: p.clock,
        endPeriod: p.period,
        endClock: p.clock,
        scoreBefore: { home: beforeHome, away: beforeAway },
        scoreAfter: { home: p.homeScore, away: p.awayScore },
        scorerIds: p.scorerId ? [p.scorerId] : [],
      };
    } else {
      current.points += p.points;
      current.endEventIndex = p.eventIndex;
      current.endPeriod = p.period;
      current.endClock = p.clock;
      current.scoreAfter = { home: p.homeScore, away: p.awayScore };
      if (p.scorerId && !current.scorerIds.includes(p.scorerId)) {
        current.scorerIds.push(p.scorerId);
      }
    }
  }
  if (current) runs.push(current);
  return runs;
}

export function computeGameFlowStats(
  timeline: ScoreTimelinePoint[],
  opts: {
    homeTeamId: string;
    awayTeamId: string;
    winnerTeamId: string;
  }
): GameFlowStats {
  const { leadChanges, ties } = countLeadChangesAndTies(timeline);
  const { largestHomeLead, largestAwayLead } = computeLargestLeads(timeline);
  const winnerIsHome = opts.winnerTeamId === opts.homeTeamId;
  const runs = findStrictRuns(timeline, opts);
  const homeRuns = runs.filter((r) => r.teamId === opts.homeTeamId);
  const awayRuns = runs.filter((r) => r.teamId === opts.awayTeamId);
  const best = (arr: StrictScoringRun[]) =>
    arr.reduce<StrictScoringRun | null>(
      (best, r) => (!best || r.points > best.points ? r : best),
      null
    );

  return {
    largestHomeLead,
    largestAwayLead,
    largestDeficitOvercomeByWinner: largestDeficitOvercomeByWinner(
      timeline,
      winnerIsHome
    ),
    leadChanges,
    ties,
    largestStrictRunHome: best(homeRuns),
    largestStrictRunAway: best(awayRuns),
    runs,
  };
}

export function validateTimelineFinalScore(
  timeline: ScoreTimelinePoint[],
  officialHome: number,
  officialAway: number
): boolean {
  if (!timeline.length) {
    return officialHome === 0 && officialAway === 0;
  }
  const last = timeline[timeline.length - 1]!;
  return last.homeScore === officialHome && last.awayScore === officialAway;
}
