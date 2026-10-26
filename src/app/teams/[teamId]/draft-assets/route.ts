import { NextResponse, type NextRequest } from "next/server";

import { teamSalaryHref } from "@/lib/team-destination";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await context.params;
  return NextResponse.redirect(new URL(teamSalaryHref(teamId, "picks"), req.url));
}
