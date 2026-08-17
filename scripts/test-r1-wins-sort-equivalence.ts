/**
 * Document why R1 Points is omitted from primary public columns:
 * sortDescending(r1Points) === sortDescending(r1WinEquivalents) when both finite.
 * Run: npx tsx scripts/test-r1-wins-sort-equivalence.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { P1_POINTS_PER_WIN } from "../src/lib/drbl-public-labels";

type Row = { id: string; r1Points: number | null; r1WinEquivalents: number | null };

function sortIds(
  rows: Row[],
  key: "r1Points" | "r1WinEquivalents"
): string[] {
  return [...rows]
    .filter((r) => r[key] != null && Number.isFinite(r[key]!))
    .sort((a, b) => (b[key] as number) - (a[key] as number))
    .map((r) => r.id);
}

console.log("synthetic finite pairs…");
{
  const rows: Row[] = [
    { id: "a", r1Points: 100, r1WinEquivalents: 100 / P1_POINTS_PER_WIN },
    { id: "b", r1Points: 50, r1WinEquivalents: 50 / P1_POINTS_PER_WIN },
    { id: "c", r1Points: 200, r1WinEquivalents: 200 / P1_POINTS_PER_WIN },
    { id: "d", r1Points: null, r1WinEquivalents: null },
  ];
  assert.deepEqual(sortIds(rows, "r1Points"), sortIds(rows, "r1WinEquivalents"));
  assert.deepEqual(sortIds(rows, "r1Points"), ["c", "a", "b"]);
}

console.log("precomputed overlay sample (if present)…");
{
  const root = path.join(
    process.cwd(),
    "src",
    "data",
    "drbl",
    "precomputed"
  );
  const files = fs.existsSync(root)
    ? fs.readdirSync(root).filter((f) => f.endsWith("-ability.json"))
    : [];
  let checked = 0;
  for (const f of files.slice(0, 4)) {
    const j = JSON.parse(fs.readFileSync(path.join(root, f), "utf8")) as {
      players?: Array<{
        playerId?: string;
        r1Points?: number | null;
        r1WinEquivalents?: number | null;
        validatedDRBL100?: number;
      }>;
    };
    const rows: Row[] = (j.players ?? [])
      .filter((p) => p.playerId)
      .map((p) => ({
        id: String(p.playerId),
        r1Points:
          p.r1Points != null && Number.isFinite(p.r1Points) ? p.r1Points : null,
        r1WinEquivalents:
          p.r1WinEquivalents != null && Number.isFinite(p.r1WinEquivalents)
            ? p.r1WinEquivalents
            : null,
      }))
      .filter((r) => r.r1Points != null && r.r1WinEquivalents != null);
    if (rows.length < 10) continue;
    assert.deepEqual(
      sortIds(rows, "r1Points"),
      sortIds(rows, "r1WinEquivalents"),
      f
    );
    checked++;
  }
  console.log(`overlay seasons checked: ${checked}`);
}

console.log("OK — r1-wins-sort-equivalence (R1_WINS_SORT_REDUNDANT_WITH_R1_POINTS=YES)");
