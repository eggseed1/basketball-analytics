/**
 * Countdown until a fixed scheduled tip-off timestamp.
 * Client-safe: measures wall-clock to tipOffAt — does NOT simulate game clocks.
 */

export type CountdownPhase =
  | "future"
  | "tomorrow"
  | "starting_soon"
  | "start_passed"
  | "invalid";

export type CountdownResult = {
  phase: CountdownPhase;
  /** Primary user-facing line, e.g. "Starts in 1h 42m". */
  primary: string;
  /** Absolute local tip time, e.g. "7:30 PM EDT". */
  absoluteLocal: string | null;
  msRemaining: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseTipOffMs(tipOffAt: string | null | undefined): number | null {
  if (!tipOffAt?.trim()) return null;
  const ms = Date.parse(tipOffAt);
  return Number.isFinite(ms) ? ms : null;
}

export function formatTipOffAbsolute(
  tipOffAt: string,
  timeZone?: string
): string | null {
  const ms = parseTipOffMs(tipOffAt);
  if (ms == null) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: undefined,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isTomorrowLocal(now: Date, tip: Date): boolean {
  const n = new Date(now);
  n.setHours(0, 0, 0, 0);
  const t = new Date(tip);
  t.setHours(0, 0, 0, 0);
  const diff = t.getTime() - n.getTime();
  return diff === 24 * 60 * 60 * 1000;
}

/**
 * Format countdown from `now` to tip-off.
 * When remaining ≤ 0 → start_passed (never “Final” / “Live”).
 */
export function formatGameCountdown(
  tipOffAt: string | null | undefined,
  nowMs: number = Date.now(),
  timeZone?: string
): CountdownResult {
  const tipMs = parseTipOffMs(tipOffAt);
  if (tipMs == null) {
    return {
      phase: "invalid",
      primary: "Tip-off time unavailable",
      absoluteLocal: null,
      msRemaining: NaN,
    };
  }

  const absoluteLocal = formatTipOffAbsolute(tipOffAt!, timeZone);
  const remaining = tipMs - nowMs;

  if (remaining <= 0) {
    return {
      phase: "start_passed",
      primary: "Scheduled start time passed",
      absoluteLocal,
      msRemaining: remaining,
    };
  }

  const tip = new Date(tipMs);
  const now = new Date(nowMs);
  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days >= 1 || remaining > 24 * 60 * 60 * 1000) {
    if (isTomorrowLocal(now, tip) || (days === 1 && !isSameLocalDay(now, tip))) {
      return {
        phase: "tomorrow",
        primary: `Starts tomorrow at ${absoluteLocal ?? "tip-off"}`,
        absoluteLocal,
        msRemaining: remaining,
      };
    }
    try {
      const when = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        ...(timeZone ? { timeZone } : {}),
      }).format(tip);
      return {
        phase: "future",
        primary: `Starts ${when}`,
        absoluteLocal,
        msRemaining: remaining,
      };
    } catch {
      return {
        phase: "future",
        primary: `Starts in ${days}d ${hours}h`,
        absoluteLocal,
        msRemaining: remaining,
      };
    }
  }

  if (totalSec < 60) {
    return {
      phase: "starting_soon",
      primary: `Starts in ${seconds}s`,
      absoluteLocal,
      msRemaining: remaining,
    };
  }
  if (totalSec < 3600) {
    return {
      phase: "starting_soon",
      primary: `Starts in ${minutes}m`,
      absoluteLocal,
      msRemaining: remaining,
    };
  }

  return {
    phase: "future",
    primary: `Starts in ${hours}h ${pad(minutes)}m`.replace(
      / 00m$/,
      ""
    ).replace(/h $/, "h"),
    absoluteLocal,
    msRemaining: remaining,
  };
}
