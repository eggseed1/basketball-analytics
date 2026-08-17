/**
 * Chronological evaluation splits (M16b).
 * Immutable game membership + hashes. No model math.
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  type SplitName,
} from "./protocol";

export interface SplitGame {
  season: string;
  gameId: string;
  date: string;
  homeTeamId?: string;
  awayTeamId?: string;
  quarantined?: boolean;
}

export interface SplitBundle {
  evaluationProtocolVersion: string;
  design: string;
  rationale: string;
  train: SplitGame[];
  validation: SplitGame[];
  reservedTest: SplitGame[];
  trainSplitHash: string;
  validationSplitHash: string;
  reservedTestSplitHash: string;
  protocolHash: string;
}

export function hashGames(games: SplitGame[]): string {
  const payload = games
    .map((g) => `${g.season}|${g.gameId}|${g.date}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

export function assertNoOverlap(bundle: SplitBundle): void {
  const sets: Array<[SplitName, SplitGame[]]> = [
    ["TRAIN", bundle.train],
    ["VALIDATION", bundle.validation],
    ["RESERVED_TEST", bundle.reservedTest],
  ];
  const seen = new Map<string, SplitName>();
  for (const [name, games] of sets) {
    for (const g of games) {
      const key = `${g.season}:${g.gameId}`;
      const prev = seen.get(key);
      if (prev) {
        throw new Error(`SPLIT_OVERLAP: ${key} in ${prev} and ${name}`);
      }
      seen.set(key, name);
    }
  }
}

export function assertChronology(bundle: SplitBundle): void {
  const maxDate = (gs: SplitGame[]) =>
    gs.reduce((m, g) => (g.date > m ? g.date : m), "");
  const minDate = (gs: SplitGame[]) =>
    gs.reduce((m, g) => (m === "" || g.date < m ? g.date : m), "");

  const trainMax = maxDate(bundle.train);
  const valMin = minDate(bundle.validation);
  const valMax = maxDate(bundle.validation);
  const testMin = minDate(bundle.reservedTest);

  if (trainMax && valMin && !(trainMax < valMin)) {
    throw new Error(
      `CHRONOLOGY: max(TRAIN.date)=${trainMax} not < min(VALIDATION.date)=${valMin}`
    );
  }
  if (valMax && testMin && !(valMax < testMin)) {
    throw new Error(
      `CHRONOLOGY: max(VALIDATION.date)=${valMax} not < min(RESERVED_TEST.date)=${testMin}`
    );
  }
}

async function listSeasonGames(season: string): Promise<SplitGame[]> {
  const root = path.join(process.cwd(), "data", "drbl", "normalized", season);
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
  const out: SplitGame[] = [];
  for (const gameId of dirs) {
    try {
      const box = JSON.parse(
        await readFile(path.join(root, gameId, "box.json"), "utf8")
      ) as {
        gameDate?: string;
        homeTeamId?: string;
        awayTeamId?: string;
      };
      let quarantined = false;
      try {
        const rec = JSON.parse(
          await readFile(path.join(root, gameId, "reconcile.json"), "utf8")
        ) as { quarantined?: boolean };
        quarantined = !!rec.quarantined;
      } catch {
        /* optional */
      }
      out.push({
        season,
        gameId,
        date: box.gameDate || "9999-99-99",
        homeTeamId: box.homeTeamId,
        awayTeamId: box.awayTeamId,
        quarantined,
      });
    } catch {
      /* skip unreadable */
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId)
  );
}

/**
 * Two-season chronological protocol:
 *   TRAIN: early 60% of 2024-25 (by date)
 *   VALIDATION: late 40% of 2024-25
 *   RESERVED_TEST: all usable 2025-26
 *
 * Boundaries chosen for temporal coherence only — not for metric performance.
 */
export async function buildDrblEvalV1Splits(): Promise<SplitBundle> {
  const s2425 = (await listSeasonGames("2024-25")).filter((g) => !g.quarantined);
  const s2526 = (await listSeasonGames("2025-26")).filter((g) => !g.quarantined);

  // Approximate 60% cut, then advance to the next calendar date so
  // max(TRAIN.date) < min(VALIDATION.date) strictly.
  let cut = Math.floor(s2425.length * 0.6);
  if (cut <= 0) cut = 1;
  if (cut >= s2425.length) cut = s2425.length - 1;
  const boundaryDate = s2425[cut - 1]?.date ?? "";
  while (cut < s2425.length && s2425[cut]!.date <= boundaryDate) {
    cut += 1;
  }
  if (cut >= s2425.length) {
    // Degenerate: all remaining share date — split by gameId after last train index.
    cut = Math.min(s2425.length - 1, Math.floor(s2425.length * 0.6));
  }
  const train = s2425.slice(0, cut);
  const validation = s2425.slice(cut);
  if (!train.length || !validation.length) {
    throw new Error("SPLIT_DESIGN: empty TRAIN or VALIDATION after date boundary adjust");
  }
  const reservedTest = s2526;

  const trainSplitHash = hashGames(train);
  const validationSplitHash = hashGames(validation);
  const reservedTestSplitHash = hashGames(reservedTest);
  const protocolHash = createHash("sha256")
    .update(
      [
        EVALUATION_PROTOCOL_VERSION,
        trainSplitHash,
        validationSplitHash,
        reservedTestSplitHash,
      ].join("|")
    )
    .digest("hex");

  const bundle: SplitBundle = {
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    design: "two_season_chrono_block_v1",
    rationale:
      "Only 2024-25 and 2025-26 full caches available. TRAIN=early 60% of 2024-25, VALIDATION=late 40% of 2024-25, RESERVED_TEST=entire 2025-26. Boundaries fixed for chronology, not performance.",
    train,
    validation,
    reservedTest,
    trainSplitHash,
    validationSplitHash,
    reservedTestSplitHash,
    protocolHash,
  };
  assertNoOverlap(bundle);
  assertChronology(bundle);
  return bundle;
}
