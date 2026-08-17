import { NextResponse } from "next/server";

import { fetchDrblBoardProvenance } from "@/data/providers/nba/drbl-loader";

/**
 * Development / diagnostics: board provenance for the live precomputed artifact.
 * GET /api/drbl/provenance?season=2025-26
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") ?? "2025-26";
  const provenance = await fetchDrblBoardProvenance(season);
  if (!provenance) {
    return NextResponse.json(
      { error: "No DRBL artifact for season", season },
      { status: 404 }
    );
  }
  return NextResponse.json(provenance);
}
