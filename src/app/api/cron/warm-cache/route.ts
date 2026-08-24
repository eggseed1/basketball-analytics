import { NextResponse } from "next/server";

import { warmProductionCaches } from "@/data/cache/warm-production-caches";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron entry — warms shared ESPN scoreboard + player career caches.
 *
 * Auth: Authorization: Bearer $CRON_SECRET (or ?secret=).
 * Configure CRON_SECRET in the Vercel project env.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error: "CRON_SECRET is not configured",
        hint: "Set CRON_SECRET in Vercel env to enable the cache warmer.",
      },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret")?.trim() ?? "";
  if (bearer !== secret && querySecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await warmProductionCaches();
  return NextResponse.json(report, { status: report.ok ? 200 : 207 });
}
