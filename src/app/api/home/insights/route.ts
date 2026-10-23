import { NextResponse } from "next/server";

import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { stripInsightFlowsForHome } from "@/lib/home-insights-slim";

export const dynamic = "force-dynamic";

/** Recent insights + above-norm nights for the homepage desk. */
export async function GET() {
  try {
    const { getLiveRecentInsights } = await import(
      "@/data/queries/recent-insights-live"
    );
    const live = await getLiveRecentInsights();
    if (live) {
      const response = jsonOk({
        insights: stripInsightFlowsForHome(live.insights),
        aboveNorm: live.aboveNorm,
        empty: live.insights.length === 0,
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
    }

    const [
      { getBundledRecentInsights },
      { getBundledAboveNorm },
    ] = await Promise.all([
      import("@/data/runtime/recent-insights-snapshot"),
      import("@/data/runtime/recent-insights-snapshot"),
    ]);
    const insights = stripInsightFlowsForHome(getBundledRecentInsights());
    const response = jsonOk({
      insights,
      aboveNorm: getBundledAboveNorm(),
      empty: insights.length === 0,
    });
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}
