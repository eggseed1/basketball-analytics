import { NextResponse, type NextRequest } from "next/server";

import { legacyStandingsRedirect, STANDINGS_VISUALIZATIONS_PATH } from "@/lib/standings-routes";

export function GET(req: NextRequest) {
  return NextResponse.redirect(
    legacyStandingsRedirect(req.url, STANDINGS_VISUALIZATIONS_PATH)
  );
}
