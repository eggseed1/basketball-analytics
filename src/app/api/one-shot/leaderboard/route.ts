import { NextResponse } from "next/server";

import { readAllTime, submitAllTime } from "@/one-shot/all-time-store";

export const dynamic = "force-dynamic";

function boardJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  return boardJson(await readAllTime());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return boardJson({ error: "Expected a finished life." }, 400);
  }
  const result = await submitAllTime(body);
  if (!result.ok) return boardJson({ error: result.error, unavailable: result.unavailable ?? false }, result.status);
  return boardJson({ entries: result.entries, rank: result.rank });
}
