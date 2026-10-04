import type {
  GamePlayByPlay,
  PlayByPlayEvent,
} from "@/data/types/play-by-play";
import { normalizeNbaLegacyCoords } from "@/lib/shots/court-geometry";

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Parse NBA ISO-ish clock `PT11M43.00S` → seconds remaining in period. */
export function parsePlayClockToSeconds(clock: string): number {
  const match = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(clock.trim());
  if (!match) return 0;
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

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Feet from the attacked rim. The ESPN adapter emits feet for any located
 * play; NBA feeds give tenths of a foot, used here for field goals only.
 */
function playSpot(
  action: Record<string, unknown>,
  isFieldGoal: boolean
): { locX: number | null; locY: number | null } {
  const fx = finiteOrNull(action.locX);
  const fy = finiteOrNull(action.locY);
  if (fx != null && fy != null) return { locX: fx, locY: fy };
  if (!isFieldGoal) return { locX: null, locY: null };
  const legacy = normalizeNbaLegacyCoords(action.xLegacy, action.yLegacy);
  return { locX: legacy?.x ?? null, locY: legacy?.y ?? null };
}

function pointsFromAction(
  actionType: string,
  shotResult: string | null
): number {
  if (shotResult !== "Made") return 0;
  const t = actionType.toLowerCase();
  if (t === "3pt") return 3;
  if (t === "2pt") return 2;
  if (t === "freethrow") return 1;
  return 0;
}

/**
 * Map normalized `game.actions` into canonical PlayByPlayEvent[]. NBA CDN,
 * playbyplayv3, and the ESPN adapter all produce this same action shape.
 */
export function transformNbaPlayByPlay(
  gameId: string,
  raw: unknown,
  source: "cdn" | "stats" | "espn" | "sample"
): GamePlayByPlay {
  const root = raw as {
    game?: { actions?: Array<Record<string, unknown>> };
  };
  const actions = root.game?.actions;
  if (!Array.isArray(actions)) {
    return { gameId, source, events: [] };
  }

  const events: PlayByPlayEvent[] = actions
    .map((action) => {
      const actionType = asString(action.actionType) || "unknown";
      const shotResultRaw = asString(action.shotResult);
      const shotResult =
        shotResultRaw === "Made" || shotResultRaw === "Missed"
          ? shotResultRaw
          : null;
      const personId = asNumber(action.personId);
      const secondPersonId =
        asNumber(action.secondPersonId) ||
        asNumber(action.assistPersonId) ||
        asNumber(action.blockPersonId) ||
        asNumber(action.stealPersonId);
      const teamIdRaw = asString(action.teamId).trim();
      const clockRaw = asString(action.clock);
      const clockSeconds = parsePlayClockToSeconds(clockRaw);
      const actionNumber = asNumber(action.actionNumber);
      const isFieldGoal = asNumber(action.isFieldGoal) === 1;

      return {
        id: `${gameId}-${actionNumber}`,
        gameId,
        actionNumber,
        orderNumber:
          asNumber(action.orderNumber) || actionNumber,
        period: asNumber(action.period),
        clockSeconds,
        clock: formatPlayClock(clockSeconds),
        actionType,
        subType: asString(action.subType),
        description: asString(action.description),
        teamId: teamIdRaw || null,
        teamTricode: asString(action.teamTricode) || null,
        playerId: personId ? String(personId) : null,
        secondPlayerId: secondPersonId ? String(secondPersonId) : null,
        playerName:
          asString(action.playerNameI) ||
          asString(action.playerName) ||
          null,
        scoreHome: asNumber(action.scoreHome),
        scoreAway: asNumber(action.scoreAway),
        shotResult,
        isFieldGoal,
        points:
          asNumber(action.points) || pointsFromAction(actionType, shotResult),
        ...playSpot(action, isFieldGoal),
      } satisfies PlayByPlayEvent;
    })
    .filter((e) => e.description.trim().length > 0 || e.actionType === "period")
    .sort(
      (a, b) =>
        a.period - b.period ||
        a.orderNumber - b.orderNumber ||
        a.actionNumber - b.actionNumber
    );

  return { gameId, source, events };
}
