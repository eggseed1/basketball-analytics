import { NextResponse, type NextRequest } from "next/server";

import { legacyStandingsRedirect } from "@/lib/standings-routes";

export function GET(req: NextRequest) {
  return NextResponse.redirect(legacyStandingsRedirect(req.url, "/standings", "bracket"));
}
