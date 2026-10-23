import { NextResponse } from "next/server";

import { jsonError, jsonOk } from "@/app/api/_lib/http";
import type { StatDetectiveRow } from "@/data/runtime/stat-detective-windows";

export const dynamic = "force-dynamic";

function slimRow(row: StatDetectiveRow): StatDetectiveRow {
  return {
    playerId: row.playerId,
    playerName: row.playerName,
    teamAbbr: row.teamAbbr,
    windowPpg: Math.round(row.windowPpg * 10) / 10,
    baselinePpg: Math.round(row.baselinePpg * 10) / 10,
    deltaPpg: Math.round(row.deltaPpg * 10) / 10,
    windowMpg: Math.round(row.windowMpg * 10) / 10,
    baselineMpg: Math.round(row.baselineMpg * 10) / 10,
    windowTs: row.windowTs ?? null,
    baselineTs: row.baselineTs ?? null,
    deltaTs: row.deltaTs,
    windowRpg: row.windowRpg ?? null,
    baselineRpg: row.baselineRpg ?? null,
    deltaRpg: row.deltaRpg ?? null,
  };
}

/** Hot & Cold columns for the homepage (last-5 scoring window). */
export async function GET() {
  try {
    const { statDetectiveSeason, statDetectiveWindow } = await import(
      "@/data/runtime/stat-detective-windows"
    );
    const season = statDetectiveSeason();
    const window = statDetectiveWindow("last5");
    const response = jsonOk({
      season,
      risers: window.risers.slice(0, 4).map(slimRow),
      fallers: window.fallers.slice(0, 4).map(slimRow),
      empty: !season || !window.risers.length,
    });
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=120, stale-while-revalidate=1800"
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}
