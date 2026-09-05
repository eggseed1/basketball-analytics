import { NextResponse } from "next/server";

import { getRuntimePolicySnapshot } from "@/data/providers/nba/runtime-policy";

export const dynamic = "force-dynamic";

/** Deploy / ops check: paid Workers should report fullEdgeProduct=true. */
export async function GET() {
  const policy = getRuntimePolicySnapshot();
  return NextResponse.json({
    ok: policy.fullEdgeProduct && !policy.slimEdgeProduct,
    policy,
  });
}
