/**
 * Documents the OLD ranking formulas inferred from exports (rankingFormulaVersion < 2).
 * These tests lock the forensic reconstruction; production no longer uses them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { populationSd } from "../leaderboard";

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

describe("legacy ranking forensics (pre-2.0)", () => {
  const csvPathCandidates = [
    path.join(
      process.cwd(),
      "reports",
      "ranking-audit",
      "legacy_top100_2024_25_by_drbl100.csv"
    ),
    path.join(process.cwd(), "reports", "post-m7", "top100_2024_25.csv"),
  ];
  const csvPath = csvPathCandidates.find((p) => existsSync(p));

  it("rank matches descending drbl100 on the frozen top100 CSV when present", () => {
    if (!csvPath) {
      // Skip gracefully if baseline export is absent.
      return;
    }
    const text = readFileSync(csvPath, "utf8").trim();
    // Only assert legacy behavior on the frozen by-drbl100 export.
    if (!csvPath.includes("legacy_top100") && text.includes("finalRankingScore")) {
      return;
    }
    const lines = text.split(/\r?\n/);
    const header = lines[0]!.split(",");
    const idx = (name: string) => header.indexOf(name);
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",");
      return {
        rank: Number(cols[idx("rank")]),
        drbl100: Number(cols[idx("drbl100")]),
        possessions: Number(cols[idx("possessions")]),
        drblP: Number(cols[idx("drblP")]),
        drblLn: Number(cols[idx("drblLn")]),
        drblB: Number(cols[idx("drblB")]),
        disagreement: Number(cols[idx("disagreement")]),
        uncertainty: Number(cols[idx("uncertainty")]),
        intervalLo: Number(cols[idx("intervalLo")]),
        intervalHi: Number(cols[idx("intervalHi")]),
        seasonalImpact: Number(cols[idx("seasonalImpact")]),
        drblWar: Number(cols[idx("drblWar")]),
      };
    });

    // rank == ordinalDescendingRank(drbl100)
    const byDrbl = rows
      .slice()
      .sort((a, b) => b.drbl100 - a.drbl100 || a.rank - b.rank);
    for (let i = 0; i < rows.length; i++) {
      assert.equal(rows[i]!.rank, i + 1);
      assert.equal(rows[i]!.drbl100, byDrbl[i]!.drbl100);
    }

    for (const r of rows) {
      assert.ok(Math.abs(r.intervalLo - (r.drbl100 - r.uncertainty)) < 0.02);
      assert.ok(Math.abs(r.intervalHi - (r.drbl100 + r.uncertainty)) < 0.02);
      // EB identity: seasonalImpact ≈ drblP*(n+200)/100 == raw*n/100
      const ebForm = (r.drblP * (r.possessions + 200)) / 100;
      assert.ok(
        Math.abs(r.seasonalImpact - ebForm) < 0.5,
        `impact ${r.seasonalImpact} vs EB form ${ebForm}`
      );
      assert.ok(Math.abs(r.drblWar - r.seasonalImpact / 30) < 0.02);
      const sd = populationSd([r.drblP, r.drblLn, r.drblB]);
      assert.ok(Math.abs(r.disagreement - sd) < 0.05);
    }

    const top10 = rows.slice(0, 10).map((r) => r.possessions);
    const byWar = rows
      .slice()
      .sort((a, b) => b.drblWar - a.drblWar)
      .slice(0, 10)
      .map((r) => r.possessions);
    // Diagnostic: old top10 much lower median possessions than WAR top10.
    assert.ok(median(top10) < median(byWar));
    const corrRatePoss = corr(
      rows.map((r) => r.drbl100),
      rows.map((r) => r.possessions)
    );
    assert.ok(corrRatePoss < 0, `expected negative corr, got ${corrRatePoss}`);
  });
});
