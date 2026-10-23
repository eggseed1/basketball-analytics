import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { loadPlayerCareerGameLogs } from "@/data/queries/player-career-game-logs";
import { NextResponse } from "next/server";

/**
 * Compact career game logs for the player Career / Overview Games chart.
 * Kept off the page SSR payload; the board hydrates this after first paint.
 *
 * Query: seasons=2024-25,2025-26 (optional; omit = all seasons with baked logs
 * resolved via the seasons list the client already has from the career table).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const { searchParams } = new URL(request.url);
    const seasons = String(searchParams.get("seasons") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}$/.test(s));

    if (!seasons.length) {
      throw new Error(
        "seasons is required (comma-separated YYYY-YY), e.g. ?seasons=2024-25,2025-26"
      );
    }
    if (seasons.length > 40) {
      throw new Error("seasons list is too long (max 40)");
    }

    const games = await loadPlayerCareerGameLogs(playerId, seasons);
    const response = jsonOk({
      playerId,
      count: games.length,
      games,
    });
    // Daily product data — edge may cache; browsers revalidate.
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=900, stale-while-revalidate=21600"
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}
