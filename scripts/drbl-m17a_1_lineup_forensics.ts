/**
 * M17a.1 current-season lineup incompleteness forensics (Phase 16).
 * Read-only on normalized possessions - safe while historical import runs.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m17a_1");

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function auditSeason(season: string) {
  const root = path.join(ROOT, "data", "drbl", "normalized", season);
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("002"))
    .map((d) => d.name);

  const rows: Record<string, unknown>[] = [];
  let poss = 0;
  let full5 = 0;
  let offMiss = 0;
  let defMiss = 0;
  let bothMiss = 0;

  for (const gid of dirs) {
    const p = path.join(root, gid, "possessions.json");
    if (!existsSync(p)) continue;
    const arr = JSON.parse(readFileSync(p, "utf8")) as {
      offensePlayerIds?: string[];
      defensePlayerIds?: string[];
      period?: number;
      startActionNumber?: number;
      endActionNumber?: number;
    }[];
    for (const x of arr) {
      poss++;
      const o = x.offensePlayerIds?.length ?? 0;
      const d = x.defensePlayerIds?.length ?? 0;
      if (o === 5 && d === 5) {
        full5++;
        continue;
      }
      const class_ =
        o < 5 && d < 5
          ? "BOTH_SIDES_INCOMPLETE"
          : o < 5
            ? "OFFENSE_INCOMPLETE"
            : "DEFENSE_INCOMPLETE";
      if (o < 5 && d < 5) bothMiss++;
      else if (o < 5) offMiss++;
      else defMiss++;
      rows.push({
        season,
        gameId: gid,
        period: x.period ?? "",
        startAction: x.startActionNumber ?? "",
        endAction: x.endActionNumber ?? "",
        offenseCount: o,
        defenseCount: d,
        missingOffense: Math.max(0, 5 - o),
        missingDefense: Math.max(0, 5 - d),
        class: class_,
        fabricatedPlayers: "NO",
      });
    }
  }

  return {
    season,
    games: dirs.length,
    possessions: poss,
    FULL_5V5: full5,
    RAW_LINEUP_COMPLETENESS_RATE: poss ? full5 / poss : 0,
    incompleteRows: rows,
    offMiss,
    defMiss,
    bothMiss,
  };
}

mkdirSync(OUT, { recursive: true });
const allRows: Record<string, unknown>[] = [];
const summary: Record<string, unknown>[] = [];

for (const season of ["2024-25", "2025-26"]) {
  const r = auditSeason(season);
  if (!r) continue;
  // Cap forensic rows for file size; full counts in summary.
  allRows.push(...r.incompleteRows.slice(0, 5000));
  summary.push({
    season,
    games: r.games,
    possessions: r.possessions,
    FULL_5V5: r.FULL_5V5,
    RAW_LINEUP_COMPLETENESS_RATE: r.RAW_LINEUP_COMPLETENESS_RATE,
    incompletePossessions: r.possessions - r.FULL_5V5,
    offenseOnlyIncomplete: r.offMiss,
    defenseOnlyIncomplete: r.defMiss,
    bothSidesIncomplete: r.bothMiss,
    CANONICAL_ATTRIBUTION_SUPPORT_RATE_NOTE:
      "Frozen attribution path already skips/quarantines unusable games; product boards are CANONICAL_PRODUCTION",
  });
}

writeFileSync(
  path.join(OUT, "16_current_lineup_incompleteness_forensics.csv"),
  toCsv(allRows.length ? allRows : [{ note: "none" }])
);
writeFileSync(
  path.join(OUT, "raw", "current_lineup_forensics_summary.json"),
  JSON.stringify(summary, null, 2) + "\n"
);
console.log(JSON.stringify(summary, null, 2));
