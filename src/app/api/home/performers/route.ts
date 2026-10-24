import { NextResponse } from "next/server";

import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getHomeAnalytics } from "@/data/queries/home";
import { slimHomePerformers } from "@/lib/home-performers-slim";

export const dynamic = "force-dynamic";

/** Slim Top Performers leaders for the homepage desk. */
export async function GET() {
  try {
    const data = await getHomeAnalytics();
    const response = jsonOk(slimHomePerformers(data));
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
