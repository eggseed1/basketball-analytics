import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { createRealSeasonLeague } from "@/gm/seed/create-real-season-league";
import { FRANCHISES } from "@/gm/seed/franchises";
import { parseSeasonParam } from "@/data/providers/historical/season-range";

/**
 * POST /api/gm/league
 * Body: { userTeamId: string, season?: "2024-25" }
 * Returns Franchise Lab league + historical snapshot for MyLeague.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      userTeamId?: string;
      season?: string;
      seed?: number;
    };

    const userTeamId = (body.userTeamId ?? "bos").toLowerCase();
    if (!FRANCHISES.some((f) => f.id === userTeamId)) {
      throw new Error(`Unknown franchise "${userTeamId}"`);
    }

    const season = body.season
      ? parseSeasonParam(body.season)
      : undefined;

    const result = await createRealSeasonLeague({
      userTeamId,
      season,
      seed: body.seed,
    });

    return jsonOk({
      league: result.league,
      snapshot: result.snapshot,
      seasonCanonical: result.seasonCanonical,
      source: "espn+darko+lebron",
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  return jsonOk({
    service: "gm-league-seed",
    description:
      "POST with { userTeamId, season? } to build a Franchise Lab save from real NBA player seasons.",
  });
}
