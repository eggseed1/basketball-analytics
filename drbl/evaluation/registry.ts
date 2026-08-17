/**
 * Experiment registry + comparison guards (M16b).
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { EVALUATION_PROTOCOL_VERSION } from "./protocol";

export interface ExperimentRecord {
  experimentId: string;
  timestamp: string;
  gitCommit: string;
  dirtyStatus: boolean;
  evaluationProtocolVersion: string;
  trainSplitHash: string;
  validationSplitHash: string;
  reservedTestSplitHash: string;
  modelVersion: string;
  modelComponents: string[];
  targetVersion: string;
  fusionVersion: string;
  posteriorVersion: string;
  m6Status: string;
  eligibilityVersion: string;
  metrics?: Record<string, unknown>;
  resultArtifacts?: string[];
  reservedTestAccessed: boolean;
  notes?: string;
}

export const REGISTRY_PATH = path.join(
  process.cwd(),
  "reports",
  "experiments",
  "registry.jsonl"
);

export async function appendExperiment(
  record: ExperimentRecord
): Promise<void> {
  await mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
  await appendFile(REGISTRY_PATH, JSON.stringify(record) + "\n", "utf8");
}

export async function readRegistry(): Promise<ExperimentRecord[]> {
  try {
    const text = await readFile(REGISTRY_PATH, "utf8");
    return text
      .trim()
      .split(/\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ExperimentRecord);
  } catch {
    return [];
  }
}

export class ComparisonInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComparisonInvalidError";
  }
}

export function assertComparableExperiments(
  a: ExperimentRecord,
  b: ExperimentRecord,
  options: { allowOverride?: boolean } = {}
): void {
  if (options.allowOverride) return;
  const checks: Array<[string, unknown, unknown]> = [
    ["evaluationProtocolVersion", a.evaluationProtocolVersion, b.evaluationProtocolVersion],
    ["trainSplitHash", a.trainSplitHash, b.trainSplitHash],
    ["validationSplitHash", a.validationSplitHash, b.validationSplitHash],
    ["targetVersion", a.targetVersion, b.targetVersion],
    ["eligibilityVersion", a.eligibilityVersion, b.eligibilityVersion],
  ];
  for (const [name, va, vb] of checks) {
    if (va !== vb) {
      throw new ComparisonInvalidError(
        `COMPARISON_INVALID: ${name} differs (${String(va)} vs ${String(vb)})`
      );
    }
  }
}

export function compareExperiments(
  a: ExperimentRecord,
  b: ExperimentRecord,
  options: { allowOverride?: boolean } = {}
): {
  status: "OK" | "COMPARISON_INVALID";
  message: string;
  a: ExperimentRecord;
  b: ExperimentRecord;
} {
  try {
    assertComparableExperiments(a, b, options);
    return {
      status: "OK",
      message: `Comparable under ${EVALUATION_PROTOCOL_VERSION}`,
      a,
      b,
    };
  } catch (e) {
    return {
      status: "COMPARISON_INVALID",
      message: e instanceof Error ? e.message : String(e),
      a,
      b,
    };
  }
}

/** Future M16c candidate IDs (not executed). */
export const M16C_CANDIDATE_IDS = [
  "m16c-p-only",
  "m16c-ln-only",
  "m16c-b-only",
  "m16c-p-ln",
  "m16c-p-b",
  "m16c-ln-b",
  "m16c-p-ln-b",
] as const;
