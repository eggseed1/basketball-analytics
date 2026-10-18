import type { WorkersAi } from "./env";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ModelTurn = {
  content: string;
  toolCalls: ToolCall[];
  neurons: number;
  /** Cut off by the token limit, or raw chat-template tokens leaked into the reply. */
  malformed: boolean;
};

export const ASK_AGENT_MODEL = "@cf/openai/gpt-oss-120b";
// Workers AI defaults to 256, which reasoning alone can use up.
const MAX_OUTPUT_TOKENS = 2048;

type ChatCompletion = {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; tool_calls?: ToolCall[] | null };
  }>;
  usage?: { neurons?: number };
};

function validArguments(raw: string): boolean {
  try {
    JSON.parse(raw || "{}");
    return true;
  } catch {
    return false;
  }
}

/** One chat-completions round trip through the Workers AI binding. */
export async function callModel(ai: WorkersAi, messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelTurn> {
  const response = (await ai.run(ASK_AGENT_MODEL, {
    messages,
    ...(tools.length ? { tools } : {}),
    max_tokens: MAX_OUTPUT_TOKENS,
  })) as ChatCompletion;
  const choice = response.choices?.[0];
  const message = choice?.message;
  const toolCalls = (message?.tool_calls ?? []).filter((c) => c?.function?.name);
  const content = (message?.content ?? "").trim();
  return {
    content,
    toolCalls: toolCalls.map((c, i) => ({ ...c, id: c.id || `call_${i}` })),
    neurons: response.usage?.neurons ?? 0,
    malformed:
      choice?.finish_reason === "length" ||
      content.includes("<|") ||
      toolCalls.some((c) => !validArguments(c.function.arguments)),
  };
}
