import type { GameSummary } from "@/data/types";
import { parseTipOffMs } from "@/lib/game-countdown";
import { isFinalStatus, isLiveLikeStatus } from "@/lib/game-status";

export const SCORE_DELAY_KEY = "drbl-score-delay-v1";

export const SCORE_DELAY_OPTIONS: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 0, label: "Off" },
  { seconds: 15, label: "15 sec" },
  { seconds: 30, label: "30 sec" },
  { seconds: 60, label: "1 min" },
  { seconds: 120, label: "2 min" },
  { seconds: 300, label: "5 min" },
];

const ALLOWED = new Set(SCORE_DELAY_OPTIONS.map((o) => o.seconds));

export function parseScoreDelay(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && ALLOWED.has(n) ? n : 0;
}

export function scoreDelayLabel(seconds: number): string {
  return SCORE_DELAY_OPTIONS.find((o) => o.seconds === seconds)?.label ?? "Off";
}

/** Sets `data-score-delay` on <html> before paint so live scores never flash. */
export const SCORE_DELAY_BOOT_SCRIPT = `(function(){
  try {
    var d = Number(localStorage.getItem("${SCORE_DELAY_KEY}"));
    if ([${[...ALLOWED].filter(Boolean).join(",")}].indexOf(d) >= 0) document.documentElement.setAttribute("data-score-delay", String(d));
  } catch (e) {}
})();`;

const listeners = new Set<() => void>();

export function readScoreDelay(): number {
  try {
    return parseScoreDelay(window.localStorage.getItem(SCORE_DELAY_KEY));
  } catch {
    return 0;
  }
}

export function writeScoreDelay(seconds: number): void {
  const value = parseScoreDelay(String(seconds));
  try {
    if (value) window.localStorage.setItem(SCORE_DELAY_KEY, String(value));
    else window.localStorage.removeItem(SCORE_DELAY_KEY);
  } catch {}
  syncScoreDelayAttribute(value);
  listeners.forEach((fn) => fn());
}

function syncScoreDelayAttribute(seconds: number) {
  const root = document.documentElement;
  if (seconds) root.setAttribute("data-score-delay", String(seconds));
  else root.removeAttribute("data-score-delay");
}

export function subscribeScoreDelay(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SCORE_DELAY_KEY) return;
    syncScoreDelayAttribute(readScoreDelay());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** A game that ended this recently may still be live on a delayed broadcast. */
const RECENT_TIP_MS = 4 * 60 * 60 * 1000;

/** Whether a game seen for the first time could spoil a delayed viewer. */
export function needsScoreMask(
  game: Pick<GameSummary, "status" | "tipOffAt">,
  now: number
): boolean {
  if (isLiveLikeStatus(game.status)) return true;
  if (!isFinalStatus(game.status) && game.status !== "suspended") return false;
  const tip = parseTipOffMs(game.tipOffAt);
  return tip != null && now - tip < RECENT_TIP_MS;
}

export type Snapshot<T> = { at: number; value: T };

/**
 * Inserts a timestamped value in time order. Data fetched earlier can arrive
 * later (a server render shown on delay), so this is not always an append.
 */
export function insertSnapshot<T>(
  list: Snapshot<T>[] | undefined,
  value: T,
  at: number,
  same: (a: T, b: T) => boolean = Object.is
): Snapshot<T>[] {
  if (!list?.length) return [{ at, value }];
  let i = list.length;
  while (i > 0 && list[i - 1].at > at) i--;
  if (i > 0 && same(list[i - 1].value, value)) return list;
  return [...list.slice(0, i), { at, value }, ...list.slice(i)];
}

/**
 * The newest snapshot at least `delayMs` old, if any, plus the earliest one
 * held. `list` comes back pruned to the due snapshot and anything newer.
 */
export function pickDue<T>(
  list: Snapshot<T>[],
  now: number,
  delayMs: number
): { due: Snapshot<T> | null; earliest: Snapshot<T> | null; list: Snapshot<T>[]; nextAt: number | null } {
  const cutoff = now - delayMs;
  let due = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].at <= cutoff) due = i;
    else break;
  }
  const pending = list[due + 1];
  return {
    due: due >= 0 ? list[due] : null,
    earliest: list[0] ?? null,
    list: due > 0 ? list.slice(due) : list,
    nextAt: pending ? pending.at + delayMs : null,
  };
}

export type ScoreSnapshot = Snapshot<GameSummary>;

function progressKey(g: GameSummary): string {
  return [
    g.status,
    g.period,
    g.displayClock,
    g.statusDetail,
    g.awayScore,
    g.homeScore,
    g.awayRecord,
    g.homeRecord,
    g.awayPeriodScores?.join("."),
    g.homePeriodScores?.join("."),
  ].join("|");
}

/** Records a timestamped snapshot when anything a viewer could see has changed. */
export function recordSnapshot(
  list: ScoreSnapshot[] | undefined,
  game: GameSummary,
  at: number
): ScoreSnapshot[] {
  return insertSnapshot(list, game, at, (a, b) => progressKey(a) === progressKey(b));
}

/** The game as it stood `delayMs` ago, or null when the viewer should see nothing yet. */
export function pickDelayed(
  list: ScoreSnapshot[],
  now: number,
  delayMs: number
): { game: GameSummary | null; list: ScoreSnapshot[]; nextAt: number | null } {
  const { due, earliest, list: kept, nextAt } = pickDue(list, now, delayMs);
  if (due) return { game: due.value, list: kept, nextAt };
  if (!earliest) return { game: null, list: kept, nextAt: null };
  return {
    game: needsScoreMask(earliest.value, earliest.at) ? null : earliest.value,
    list: kept,
    nextAt,
  };
}

export const SCORE_DELAY_MASK_DETAIL = "Score delayed";

/** Stand-in shown until a delayed snapshot is due. Scores are NaN so every card hides them. */
export function maskGame(game: GameSummary): GameSummary {
  return {
    ...game,
    status: "in_progress",
    period: undefined,
    displayClock: undefined,
    statusDetail: SCORE_DELAY_MASK_DETAIL,
    homeScore: Number.NaN,
    awayScore: Number.NaN,
    homePeriodScores: undefined,
    awayPeriodScores: undefined,
    homeRecord: undefined,
    awayRecord: undefined,
  };
}