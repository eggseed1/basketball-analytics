/**
 * Draft selections → transaction rows plus a baked list of recent picks.
 *
 *   npx tsx scripts/ingest-draft-transactions.ts [--year 2026] [--dry-run]
 *
 * Writes data/transactions/espn-draft/v1/transactions.jsonl (merged into the
 * transactions snapshot) and src/data/runtime/draft-night-snapshot.json (search
 * finds draftees before the full draft history catches up).
 *
 * Runs nightly. Each year refetches only the pick list; player details are
 * fetched once per new selection. A year that fails keeps its previous rows.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildDraftTransactions,
  draftSourceRecordId,
  ESPN_DRAFT_DATASET_VERSION,
  ESPN_DRAFT_FIRST_DATED_YEAR,
  ESPN_DRAFT_SOURCE,
  selectionFromTransaction,
  type DraftNights,
  type DraftSelection,
} from "../src/data/providers/transactions/espn-draft";
import { DRAFT_TRANSACTIONS_RELATIVE } from "../src/data/providers/transactions/transaction-archive-store";
import type { CanonicalTransaction } from "../src/data/types/transaction-lineage";

const BASE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons";
const SNAPSHOT_RELATIVE = path.join("src", "data", "runtime", "draft-night-snapshot.json");
const CONCURRENCY = 6;

type Ref = { $ref?: string };
type DraftPayload = { startDate?: string; endDate?: string };
type RoundsPayload = {
  items?: Array<{
    picks?: Array<{
      status?: { name?: string };
      pick?: number;
      overall?: number;
      round?: number;
      athlete?: Ref;
      team?: Ref;
    }>;
  }>;
};
type AthletePayload = {
  displayName?: string;
  fullName?: string;
  position?: { abbreviation?: string };
  athlete?: Ref;
};

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

const refId = (ref: Ref | undefined, segment: string) =>
  ref?.$ref?.match(new RegExp(`/${segment}/(\\d+)`))?.[1] ?? null;

async function readJsonl(file: string): Promise<CanonicalTransaction[]> {
  try {
    const text = await readFile(file, "utf8");
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as CanonicalTransaction);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    })
  );
  return out;
}

async function ingestYear(
  year: number,
  known: Map<string, DraftSelection>,
  ingestedAt: string
): Promise<CanonicalTransaction[] | null> {
  const draft = await fetchJson<DraftPayload>(`${BASE}/${year}/draft`);
  if (!draft.startDate || !draft.endDate) {
    console.log(`  ${year}: no draft times published, skipped`);
    return null;
  }
  if (Date.parse(draft.startDate) > Date.now()) {
    console.log(`  ${year}: draft has not started`);
    return [];
  }
  const nights: DraftNights = { year, startDate: draft.startDate, endDate: draft.endDate };
  const rounds = await fetchJson<RoundsPayload>(`${BASE}/${year}/draft/rounds`);
  const made = (rounds.items ?? [])
    .flatMap((r) => r.picks ?? [])
    .filter((p) => p.status?.name === "SELECTION_MADE" && p.overall && p.round);

  let fetched = 0;
  const selections = await mapLimit(made, CONCURRENCY, async (p): Promise<DraftSelection | null> => {
    const draftAthleteId = refId(p.athlete, "athletes");
    const espnTeamId = refId(p.team, "teams");
    if (!draftAthleteId || !espnTeamId) return null;
    const base = {
      year,
      round: p.round!,
      roundPick: p.pick ?? 0,
      overall: p.overall!,
      espnTeamId,
      draftAthleteId,
    };
    const prior = known.get(draftSourceRecordId(base));
    if (prior) return { ...prior, ...base };
    const athlete = await fetchJson<AthletePayload>(p.athlete!.$ref!.replace(/^http:/, "https:"));
    fetched++;
    return {
      ...base,
      playerId: refId(athlete.athlete, "athletes"),
      name: (athlete.displayName ?? athlete.fullName ?? "").trim(),
      position: athlete.position?.abbreviation?.trim() || null,
    };
  });

  const result = buildDraftTransactions(
    nights,
    selections.filter((s): s is DraftSelection => s !== null),
    { ingestedAt }
  );
  const skipped = Object.keys(result.skipped).length ? ` skipped=${JSON.stringify(result.skipped)}` : "";
  console.log(
    `  ${year}: ${made.length} selections, ${result.transactions.length} rows, ${fetched} new players fetched${skipped}`
  );
  return result.transactions;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const yearArg = process.argv.indexOf("--year");
  const thisYear = new Date().getUTCFullYear();
  const years =
    yearArg >= 0
      ? [Number(process.argv[yearArg + 1])]
      : Array.from({ length: thisYear - ESPN_DRAFT_FIRST_DATED_YEAR + 1 }, (_, i) => ESPN_DRAFT_FIRST_DATED_YEAR + i);
  const cwd = process.cwd();
  const file = path.join(cwd, DRAFT_TRANSACTIONS_RELATIVE);
  const ingestedAt = new Date().toISOString();

  const existing = await readJsonl(file);
  const known = new Map<string, DraftSelection>();
  for (const tx of existing) {
    const sel = selectionFromTransaction(tx);
    if (sel) known.set(draftSourceRecordId(sel), sel);
  }

  const byYear = new Map<number, CanonicalTransaction[]>();
  for (const tx of existing) {
    const y = tx.assets[0]?.asset.draftPick?.draftYear;
    if (y) byYear.set(y, [...(byYear.get(y) ?? []), tx]);
  }

  console.log(`draft ingest years=${years.join(",")}`);
  let failures = 0;
  for (const year of years) {
    try {
      const rows = await ingestYear(year, known, ingestedAt);
      if (rows) byYear.set(year, rows);
    } catch (error) {
      failures++;
      console.warn(`  ${year}: failed, keeping previous rows (${error instanceof Error ? error.message : error})`);
    }
  }

  const transactions = [...byYear.values()]
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (dryRun) {
    for (const tx of transactions.slice(0, 5)) console.log(`  ${tx.date} ${tx.parties[0]?.teamAbbr}: ${tx.description}`);
    return;
  }

  await mkdir(path.dirname(file), { recursive: true });
  const body = transactions.map((tx) => JSON.stringify(tx)).join("\n");
  await writeFile(file, body ? `${body}\n` : "", "utf8");
  await writeFile(
    path.join(path.dirname(file), "manifest.json"),
    `${JSON.stringify(
      {
        source: ESPN_DRAFT_SOURCE,
        datasetVersion: ESPN_DRAFT_DATASET_VERSION,
        builtAt: ingestedAt,
        transactionCount: transactions.length,
        draftYears: [...byYear.keys()].sort(),
        note: `One row per draft selection from ${ESPN_DRAFT_FIRST_DATED_YEAR} on. Round 1 is dated to the opening night and later rounds to the closing night, in US Eastern time. Earlier drafts have no published times and get no rows.`,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const picks = transactions.map((tx) => {
    const asset = tx.assets[0]!.asset;
    const sel = selectionFromTransaction(tx)!;
    return [asset.playerId ?? null, sel.name, sel.year, sel.round, sel.roundPick, sel.overall, tx.parties[0]?.teamAbbr ?? "", sel.position];
  });
  await writeFile(
    path.join(cwd, SNAPSHOT_RELATIVE),
    `${JSON.stringify({
      version: 1,
      generatedAt: ingestedAt,
      columns: ["playerId", "name", "year", "round", "roundPick", "overall", "teamAbbr", "position"],
      picks,
    })}\n`,
    "utf8"
  );
  console.log(`  wrote ${transactions.length} rows → ${DRAFT_TRANSACTIONS_RELATIVE}, ${picks.length} picks → ${SNAPSHOT_RELATIVE}`);
  if (failures === years.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
