import { NextResponse } from "next/server";

import { toCareerBands } from "@/analytics/career-bands";
import { computeCareerResume } from "@/analytics/career-resume";
import { jsonError } from "@/app/api/_lib/http";
import { getPlayerCareerSeasonsCached } from "@/data/queries";

/** Peak / Prime / Longevity bands for one career, sized for the Learn chart. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const career = await getPlayerCareerSeasonsCached(playerId);
    const playerName = career.find((r) => r.playerName)?.playerName ?? playerId;
    const bands = toCareerBands(computeCareerResume({ playerId, playerName, career }));
    const empty = career.length === 0 || bands.seasons.length === 0;
    return NextResponse.json(bands, {
      headers: {
        // Cold career misses must not stick in CDN for a day.
        "Cache-Control": empty
          ? "no-store"
          : "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
