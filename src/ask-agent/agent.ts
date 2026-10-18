import { DAILY_NEURON_CAP, neuronsUsedToday, recordNeurons } from "./budget";
import type { AskAgentEnv } from "./env";
import { checkGrounding, type GroundingResult } from "./grounding";
import { callModel, type ChatMessage } from "./model";
import { presentAskAnswer } from "./present";
import { askAgentSystemPrompt } from "./prompt";
import { ASK_AGENT_TOOL_SPECS, runTool, toolLabel, toolMessageContent } from "./tools";

export type AskAgentTurn = { role: "user" | "assistant"; content: string };

export type AskAgentEvent =
  | { type: "step"; id: string; label: string }
  | { type: "step_done"; id: string; ok: boolean; summary: string; sql?: string }
  | { type: "answer"; text: string; links: Array<{ label: string; href: string }>; grounding: GroundingResult }
  | { type: "usage"; neurons: number; usedToday: number; cap: number }
  | { type: "error"; message: string };

const MAX_STEPS = 8;
const MAX_HISTORY_TURNS = 6;
const MAX_RETRIES = 2;

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function runAskAgent(options: {
  question: string;
  history: AskAgentTurn[];
  env: AskAgentEnv;
  emit: (event: AskAgentEvent) => void;
  today?: string;
}): Promise<void> {
  const { env, emit } = options;
  if (!env.AI) {
    emit({ type: "error", message: "The model isn't connected in this environment." });
    return;
  }
  const usedAtStart = await neuronsUsedToday(env.PAGE_CACHE);
  if (usedAtStart >= DAILY_NEURON_CAP) {
    emit({ type: "error", message: "Ask DRBL has used today's free allowance. It resets at midnight UTC." });
    return;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: askAgentSystemPrompt(options.today ?? new Date().toISOString().slice(0, 10)) },
    ...options.history.slice(-MAX_HISTORY_TURNS).map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: "user", content: options.question },
  ];
  const measure = { ready: false };
  const toolOutputs: unknown[] = [];
  const links = new Map<string, string>();
  let neurons = 0;
  let usedToday = usedAtStart;
  let retries = 0;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const lastStep = step === MAX_STEPS - 1;
      if (lastStep) {
        messages.push({
          role: "user",
          content:
            "Stop querying. Answer from the rows you already have. If they do not settle the question, say what they do settle and what is missing.",
        });
      }
      const turn = await callModel(env.AI, messages, lastStep ? [] : ASK_AGENT_TOOL_SPECS);
      neurons += turn.neurons;
      usedToday = await recordNeurons(env.PAGE_CACHE, turn.neurons);

      if (turn.malformed) {
        if (retries++ < MAX_RETRIES) continue;
        emit({ type: "error", message: "The model's reply came back garbled. Try asking again." });
        return;
      }

      if (!turn.toolCalls.length || lastStep) {
        const text = presentAskAnswer(turn.content || "I couldn't put an answer together from the data.");
        emit({
          type: "answer",
          text,
          links: [...links].map(([href, label]) => ({ label, href })),
          grounding: checkGrounding(text, toolOutputs, options.question),
        });
        return;
      }

      messages.push({ role: "assistant", content: turn.content, tool_calls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        const id = `${step}-${call.id}`;
        emit({ type: "step", id, label: toolLabel(call.function.name, parseArgs(call.function.arguments)) });
        const output = await runTool(call.function.name, call.function.arguments, {
          db: env.ASK_DB,
          question: options.question,
          measure,
        });
        toolOutputs.push(output.data);
        for (const link of output.links ?? []) if (!links.has(link.href)) links.set(link.href, link.label);
        emit({ type: "step_done", id, ok: output.ok, summary: output.summary, sql: output.sql });
        messages.push({ role: "tool", tool_call_id: call.id, content: toolMessageContent(output) });
      }

      if (usedToday >= DAILY_NEURON_CAP) {
        emit({ type: "error", message: "Ask DRBL hit today's free allowance mid-answer. It resets at midnight UTC." });
        return;
      }
    }
  } catch (error) {
    emit({ type: "error", message: error instanceof Error ? error.message : "Something went wrong." });
  } finally {
    emit({ type: "usage", neurons: Math.round(neurons * 10) / 10, usedToday: Math.round(usedToday), cap: DAILY_NEURON_CAP });
  }
}
