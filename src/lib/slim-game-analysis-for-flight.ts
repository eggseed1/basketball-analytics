/**
 * Shrink Game Lab RSC/Flight props. Analysis still runs server-side in full;
 * only the serialized client payload is trimmed.
 */
import type { GameAnalysisSummary } from "@/analytics/game-lab";
import type { ScoreTimelinePoint } from "@/lib/history/score-flow";

const EMPTY_HIGHLIGHTS = {
  scoring: [] as never[],
  allAround: [] as never[],
  plusMinus: [] as never[],
  vsSeason: [] as never[],
};

/** Keep chart shape without shipping every scoring event in HTML. */
export function downsampleScoreTimelineForFlight(
  points: ScoreTimelinePoint[],
  maxPoints = 48
): ScoreTimelinePoint[] {
  if (points.length <= maxPoints) return points;
  const required = new Set<number>([0, points.length - 1]);
  let maxHomeIdx = 0;
  let maxAwayIdx = 0;
  for (let i = 0; i < points.length; i++) {
    const m = points[i]!.margin;
    if (m > points[maxHomeIdx]!.margin) maxHomeIdx = i;
    if (m < points[maxAwayIdx]!.margin) maxAwayIdx = i;
  }
  required.add(maxHomeIdx);
  required.add(maxAwayIdx);

  const stride = (points.length - 1) / (maxPoints - 1);
  const keep = new Set(required);
  for (let i = 0; i < maxPoints; i++) {
    keep.add(Math.round(i * stride));
  }
  // Cap: prefer required indices, then fill evenly from the rest.
  const sorted = [...keep]
    .filter((i) => i >= 0 && i < points.length)
    .sort((a, b) => a - b);
  if (sorted.length <= maxPoints) {
    return sorted.map((i) => points[i]!);
  }
  const pinned = [...required].sort((a, b) => a - b);
  const extras = sorted.filter((i) => !required.has(i));
  const slots = Math.max(0, maxPoints - pinned.length);
  const picked: number[] = [];
  if (slots > 0 && extras.length) {
    const step = extras.length / slots;
    for (let i = 0; i < slots; i++) {
      picked.push(extras[Math.min(extras.length - 1, Math.floor(i * step))]!);
    }
  }
  return [...new Set([...pinned, ...picked])]
    .sort((a, b) => a - b)
    .map((i) => points[i]!);
}

export function slimGameAnalysisForFlight(
  analysis: GameAnalysisSummary,
  options?: { downsampleTimeline?: boolean }
): GameAnalysisSummary {
  let timeline = analysis.flow.timeline;
  if (options?.downsampleTimeline) {
    timeline = downsampleScoreTimelineForFlight(timeline).map((p) => {
      // Hover play text comes from client PBP; drop null/string names from Flight.
      const { scorerName: _, ...rest } = p;
      return rest;
    });
  }

  return {
    ...analysis,
    // UI never reads these on GameLabView (box tables / highlights are unused).
    playerHighlights: EMPTY_HIGHLIGHTS,
    boxScoreContext: {
      season: analysis.season,
      gameId: analysis.gameId,
      byPlayerId: {},
      teams: [],
    },
    flow: {
      ...analysis.flow,
      timeline,
    },
  };
}
