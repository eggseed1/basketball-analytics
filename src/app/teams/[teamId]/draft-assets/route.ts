import { NextResponse, type NextRequest } from "next/server";

import { teamSalaryHref } from "@/lib/team-destination";

export async function GET(req: NextRequest, ctx: RouteContext<"/teams/[teamId]/draft-assets">) {
  const { teamId } = await ctx.params;
  return NextResponse.redirect(new URL(teamSalaryHref(teamId, "picks"), req.url));
}
