import { NextResponse } from "next/server";

import { getSentimentBuildHealth } from "@/data/queries/team-sentiment";
import { loadSentimentSnapshot } from "@/sentiment/load-curated";

export const dynamic = "force-dynamic";

/** Lightweight snapshot health for internal tooling / deploy checks. */
export async function GET() {
  const health = getSentimentBuildHealth();
  const snapshot = loadSentimentSnapshot();
  return NextResponse.json({
    ...health,
    builtAt: snapshot?.meta.builtAt ?? null,
    observationBatchIds: snapshot?.meta.observationBatchIds ?? [],
  });
}
