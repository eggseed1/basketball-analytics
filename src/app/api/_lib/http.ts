import { NextResponse } from "next/server";
import { BallDontLieError } from "@/data/providers/balldontlie/client";

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function jsonError(error: unknown, fallbackStatus = 500) {
  if (error instanceof BallDontLieError) {
    return NextResponse.json(
      {
        error: error.message,
        status: error.status,
        path: error.path,
        hint:
          error.status === 401
            ? "Add BALLDONTLIE_API_KEY to .env.local (free key unlocks historical games; paid tiers unlock box scores + advanced)."
            : undefined,
      },
      { status: error.status === 401 ? 401 : error.status === 429 ? 429 : 502 }
    );
  }

  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  const status =
    message.includes("Invalid season") || message.includes("required")
      ? 400
      : fallbackStatus;

  return NextResponse.json({ error: message }, { status });
}

export function optionalInt(
  value: string | null,
  fallback?: number
): number | undefined {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Expected integer, got "${value}"`);
  }
  return Math.trunc(n);
}
