/**
 * ASK DRBL query wrapper — one entry for the /ask route.
 */

import {
  runAskDrbl,
  type AskDrblResult,
  type RunAskDrblOptions,
} from "@/query-engine";

export type { AskDrblResult };

export async function getAskDrblAnswer(
  query: string,
  options: RunAskDrblOptions = {}
): Promise<AskDrblResult> {
  return runAskDrbl(query, options);
}
