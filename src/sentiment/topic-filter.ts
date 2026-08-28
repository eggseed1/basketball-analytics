import type { TrackedPlayerSentimentRow } from "@/sentiment/curated-types";

export function playerMatchesSentimentTopic(
  row: TrackedPlayerSentimentRow,
  topic: string,
  minShare = 0.05
): boolean {
  const needle = topic.trim().toLowerCase();
  if (!needle) return true;
  for (const lane of [row.fan, row.media]) {
    if (!lane?.topicBreakdown) continue;
    for (const [key, share] of Object.entries(lane.topicBreakdown)) {
      if (key.toLowerCase().includes(needle) && share >= minShare) return true;
    }
  }
  return false;
}
