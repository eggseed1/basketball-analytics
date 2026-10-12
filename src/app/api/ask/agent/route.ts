import { runAskAgent, type AskAgentEvent, type AskAgentTurn } from "@/ask-agent/agent";
import { askAgentEnabled, askAgentEnv } from "@/ask-agent/env";

export const dynamic = "force-dynamic";

const MAX_QUESTION = 500;
const MAX_TURN = 4000;

function readTurns(value: unknown): AskAgentTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is AskAgentTurn =>
        !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string"
    )
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_TURN) }));
}

/** Streams the agent's steps and answer as newline-delimited JSON events. */
export async function POST(request: Request) {
  if (!askAgentEnabled()) return Response.json({ error: "Not found" }, { status: 404 });

  let body: { question?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON with a question." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Ask a question." }, { status: 400 });
  if (question.length > MAX_QUESTION) {
    return Response.json({ error: `Keep questions under ${MAX_QUESTION} characters.` }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AskAgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      await runAskAgent({ question, history: readTurns(body.history), env: askAgentEnv(), emit });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
