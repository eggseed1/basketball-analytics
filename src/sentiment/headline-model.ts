/**
 * Headline tone toward one named player, rated by Llama 3.3 70B on Workers AI.
 *
 * Checked against 127 labeled headlines in
 * data/sentiment/eval/v1/media-headline-vs-article-2026-10.json: 69% agreement
 * overall, 71% on the half never used for tuning, and no rating of the opposite
 * sign. The word list scored 46% and 51% on the same sets. The labels came from
 * the coding agent, not a human panel. The prompt below is the one that was
 * evaluated, so changing it means re-running that check.
 *
 * Node-only (ingest scripts). Needs CLOUDFLARE_AI_TOKEN with Workers AI access
 * and CLOUDFLARE_ACCOUNT_ID.
 */

export const HEADLINE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const HEADLINE_MODEL_VERSION = "headline-llama33-70b-v1";

export const HEADLINE_MODEL_SYSTEM = [
  "You rate the tone of an NBA news headline toward one named player. Answer with only -1, 0 or 1.",
  "1: positive toward the player, or good news for them.",
  "-1: negative toward the player, or bad news for them.",
  "0: neutral or mixed, or the player is only mentioned in passing or not at all.",
].join("\n");

export type HeadlineTone = -1 | 0 | 1;

export function parseHeadlineTone(text: string): HeadlineTone | null {
  const match = text.trim().match(/^(-1|0|1)(?![0-9.])/);
  return match ? (Number(match[1]) as HeadlineTone) : null;
}

export class HeadlineModelError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** One rating. Throws HeadlineModelError on HTTP failure; null when the answer isn't -1, 0 or 1. */
export async function rateHeadlineTone(options: {
  accountId: string;
  token: string;
  playerName: string;
  title: string;
}): Promise<HeadlineTone | null> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/run/${HEADLINE_MODEL}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: HEADLINE_MODEL_SYSTEM },
          { role: "user", content: `Player: ${options.playerName}\nHeadline: ${options.title}` },
        ],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HeadlineModelError(`HTTP ${response.status} ${body.slice(0, 200)}`, response.status);
  }
  const json = (await response.json()) as {
    result?: { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  };
  // `response` arrives as a number when the answer parses as JSON ("-1" -> -1).
  const answer = json.result?.choices?.[0]?.message?.content ?? json.result?.response;
  if (typeof answer === "number") return parseHeadlineTone(String(answer));
  return typeof answer === "string" ? parseHeadlineTone(answer) : null;
}
