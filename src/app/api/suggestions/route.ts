import { NextResponse } from "next/server";

import { addSuggestion, readSuggestions, suggestionsReadAllowed } from "@/lib/suggestions-store";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const key = request.headers.get("x-suggestions-key");
  if (!suggestionsReadAllowed(key)) return json({ error: "Not found." }, 404);
  const board = await readSuggestions();
  if (board.unavailable) return json({ error: "Suggestions are not reachable right now." }, 503);
  return json({ notes: board.notes });
}

export async function POST(request: Request) {
  let body: { text?: unknown; page?: unknown; company?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Send the note as text." }, 400);
  }
  if (typeof body.company === "string" && body.company.trim()) return json({ ok: true });
  const result = await addSuggestion({ text: body.text, page: body.page });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true });
}
