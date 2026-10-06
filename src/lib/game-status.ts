/**
 * Canonical NBA game status - provider-normalized, never inferred from 0-0.
 *
 * Mapping docs: docs/game-status-and-watch.md
 */

export type GameStatusKind =
  | "scheduled"
  | "pregame"
  | "in_progress"
  | "halftime"
  | "period_break"
  | "final"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "delayed"
  | "unknown";

/** Structured broadcast row from provider - service/discovery only. */
export type GameBroadcastOption = {
  id: string;
  /** Display name, e.g. ESPN, NBC, YES Network. */
  label: string;
  market: "national" | "local" | "unknown";
  medium: "tv" | "streaming" | "radio" | "unknown";
  /** Official watch URL when provider supplies one - never invent. */
  watchUrl?: string | null;
  source: "espn";
};

export type EspnStatusTypeInput = {
  state?: string | null;
  completed?: boolean | null;
  name?: string | null;
  description?: string | null;
  shortDetail?: string | null;
  detail?: string | null;
  id?: string | null;
};

export type EspnLiveClockInput = {
  period?: number | null;
  displayClock?: string | null;
  clock?: number | null;
};

/**
 * Normalize ESPN competition/event status.type → canonical GameStatusKind.
 * Never maps scheduled 0-0 to final. Unknown provider names → unknown.
 */
export function normalizeEspnStatusType(
  statusType: EspnStatusTypeInput | null | undefined,
  scores?: { home: number; away: number }
): GameStatusKind {
  if (!statusType) return "unknown";

  const name = (statusType.name ?? "").toUpperCase();
  const description = (statusType.description ?? "").toLowerCase();
  const state = (statusType.state ?? "").toLowerCase();
  const bothZero =
    scores != null &&
    scores.home === 0 &&
    scores.away === 0;

  // Explicit ESPN status names first (most reliable).
  if (
    name.includes("POSTPONE") ||
    description.includes("postponed")
  ) {
    return "postponed";
  }
  if (
    name.includes("CANCEL") ||
    description.includes("cancel")
  ) {
    return "cancelled";
  }
  if (name.includes("SUSPEND") || description.includes("suspend")) {
    return "suspended";
  }
  if (name.includes("DELAY") || description.includes("delay")) {
    return "delayed";
  }
  if (name.includes("HALFTIME") || description.includes("halftime")) {
    return "halftime";
  }
  if (
    name.includes("END_PERIOD") ||
    name.includes("END_OF_PERIOD") ||
    description.includes("end of")
  ) {
    return "period_break";
  }
  if (
    name.includes("STATUS_SCHEDULED") ||
    name === "STATUS_PRE_GAME" ||
    name.includes("PREGAME") ||
    name.includes("PRE_GAME")
  ) {
    return name.includes("PRE") ? "pregame" : "scheduled";
  }
  if (
    name.includes("STATUS_IN_PROGRESS") ||
    name.includes("IN_PROGRESS") ||
    name.includes("STATUS_FIRST_HALF") ||
    name.includes("STATUS_SECOND_HALF")
  ) {
    return "in_progress";
  }
  if (name.includes("STATUS_FINAL") || name === "STATUS_FULL_TIME") {
    // Never treat 0-0 as a completed final - ESPN occasionally marks empty
    // events completed. Prefer unknown over inventing FINAL / TIED.
    if (bothZero) return "unknown";
    return "final";
  }

  // State fallbacks
  if (state === "in") return "in_progress";
  if (state === "pre") {
    if (description.includes("delay")) return "delayed";
    return "scheduled";
  }
  if (state === "post" || statusType.completed) {
    // Critical regression guard: completed/post + 0-0 is NOT automatically final.
    if (bothZero) {
      if (
        description.includes("postpon") ||
        description.includes("cancel") ||
        description.includes("suspend")
      ) {
        // Already handled above; keep unknown-ish terminal without calling it final.
        return description.includes("cancel")
          ? "cancelled"
          : description.includes("suspend")
            ? "suspended"
            : "postponed";
      }
      // Prefer scheduled over inventing FINAL 0-0.
      return "scheduled";
    }
    return "final";
  }

  return "unknown";
}

export function isLiveLikeStatus(status: GameStatusKind | undefined): boolean {
  return (
    status === "in_progress" ||
    status === "halftime" ||
    status === "period_break"
  );
}

export function isPreTipStatus(status: GameStatusKind | undefined): boolean {
  return (
    status === "scheduled" ||
    status === "pregame" ||
    status === "delayed" ||
    status == null
  );
}

export function isFinalStatus(status: GameStatusKind | undefined): boolean {
  return status === "final";
}

export function isTerminalNonFinalStatus(
  status: GameStatusKind | undefined
): boolean {
  return (
    status === "postponed" ||
    status === "cancelled" ||
    status === "suspended"
  );
}

function progressStage(status: GameStatusKind | undefined): number {
  if (status === "final" || isTerminalNonFinalStatus(status)) return 2;
  if (isLiveLikeStatus(status)) return 1;
  return 0;
}

function clockSeconds(clock: string | null | undefined): number | null {
  const text = clock?.trim() ?? "";
  const mmss = /^(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(text);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const secs = /^(\d{1,2}(?:\.\d+)?)$/.exec(text);
  return secs ? Number(secs[1]) : null;
}

/** Game seconds played at `period` with `remaining` seconds left (12-min quarters, 5-min OT). */
export function elapsedGameSeconds(period: number, remaining: number): number {
  if (period <= 4) return (period - 1) * 720 + (720 - remaining);
  return 2880 + (period - 5) * 300 + (300 - remaining);
}

/** Same as {@link elapsedGameSeconds}, from a display clock such as "6:26". */
export function elapsedFromDisplayClock(
  period: number | null | undefined,
  clock: string | null | undefined
): number | null {
  const remaining = clockSeconds(clock);
  if (!period || remaining == null) return null;
  return elapsedGameSeconds(period, remaining);
}

/**
 * Orders two snapshots of one game by how far along they are: status stage,
 * then period, then game clock. Positive means `a` is further along. Upstream
 * feeds lag each other by minutes, so callers keep the further snapshot
 * instead of letting a slower feed rewind the score.
 */
export function compareGameProgress(
  a: { status?: GameStatusKind; period?: number | null; displayClock?: string | null },
  b: { status?: GameStatusKind; period?: number | null; displayClock?: string | null }
): number {
  const stage = progressStage(a.status) - progressStage(b.status);
  if (stage !== 0 || progressStage(a.status) !== 1) return stage;
  const period = (a.period ?? 0) - (b.period ?? 0);
  if (period !== 0) return period;
  if (a.status === "in_progress" && b.status !== "in_progress") return -1;
  if (b.status === "in_progress" && a.status !== "in_progress") return 1;
  const ca = clockSeconds(a.displayClock);
  const cb = clockSeconds(b.displayClock);
  if (ca == null || cb == null) return 0;
  return cb - ca;
}

/** Whether scoreboard UI should show numeric scores. */
export function shouldDisplayScores(options: {
  status?: GameStatusKind;
  homeScore: number;
  awayScore: number;
}): boolean {
  const { status, homeScore, awayScore } = options;
  if (isLiveLikeStatus(status) || status === "final" || status === "suspended") {
    return true;
  }
  if (isPreTipStatus(status) || isTerminalNonFinalStatus(status)) {
    return false;
  }
  // unknown: only if a real score exists
  return homeScore > 0 || awayScore > 0;
}

export function statusHeadline(status: GameStatusKind | undefined): string {
  switch (status) {
    case "scheduled":
    case "pregame":
      return "Scheduled";
    case "in_progress":
      return "Live";
    case "halftime":
      return "Halftime";
    case "period_break":
      return "Period break";
    case "final":
      return "Final";
    case "postponed":
      return "Postponed";
    case "cancelled":
      return "Cancelled";
    case "suspended":
      return "Suspended";
    case "delayed":
      return "Delayed";
    case "unknown":
    default:
      return "Status unavailable";
  }
}

export function periodClockLabel(options: {
  status?: GameStatusKind;
  period?: number | null;
  displayClock?: string | null;
  statusDetail?: string | null;
}): string | null {
  const { status, period, displayClock, statusDetail } = options;
  if (status === "halftime") return "Halftime";
  if (status === "period_break") {
    if (period != null && period > 0) return `End of Q${period}`;
    return "Between periods";
  }
  if (isLiveLikeStatus(status)) {
    const periodLabel =
      period == null
        ? null
        : period <= 4
          ? `Q${period}`
          : `OT${period - 4}`;
    const clock = displayClock?.trim();
    if (periodLabel && clock && clock !== "0.0" && clock !== "0:00") {
      return `${periodLabel} · ${clock}`;
    }
    if (periodLabel) return periodLabel;
    if (clock) return clock;
  }
  if (statusDetail?.trim()) {
    // Prefer short live detail when no structured clock.
    const tip = statusDetail.split(" - ").slice(1).join(" - ").trim();
    if (isLiveLikeStatus(status) && !tip) return statusDetail;
  }
  return null;
}
