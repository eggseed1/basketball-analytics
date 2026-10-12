/**
 * ASK DRBL query wrapper - one entry for the /ask route.
 */

import { cache } from "react";

import {
  runAskDrbl,
  type AskDrblResult,
  type RunAskDrblOptions,
} from "@/query-engine";

export type { AskDrblResult };

// Keyed on a string so generateMetadata and the page share one run per request.
const cachedAnswer = cache(
  (query: string, optionsKey: string): Promise<AskDrblResult> =>
    runAskDrbl(query, JSON.parse(optionsKey) as RunAskDrblOptions)
);

export async function getAskDrblAnswer(
  query: string,
  options: RunAskDrblOptions = {}
): Promise<AskDrblResult> {
  return cachedAnswer(query, JSON.stringify(options));
}
