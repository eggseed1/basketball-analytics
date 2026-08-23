import { jsonError, jsonOk, optionalInt } from "@/app/api/_lib/http";
import { fetchAnalyticsNews } from "@/data/providers/insights/analytics-news";

/**
 * Analytics / NBA news desk for the homepage.
 * Query: limit?, fresh=1 (bypass Next fetch cache and re-pull RSS).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = optionalInt(searchParams.get("limit"), 6) ?? 6;
    const fresh = searchParams.get("fresh") === "1";

    const articles = await fetchAnalyticsNews({
      limit: Math.min(Math.max(limit, 1), 12),
      fresh,
      signal: request.signal,
    });

    return jsonOk({
      retrievedAt: new Date().toISOString(),
      count: articles.length,
      data: articles,
      fresh,
    });
  } catch (error) {
    return jsonError(error);
  }
}
