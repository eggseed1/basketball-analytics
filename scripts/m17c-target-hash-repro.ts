import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const manifestPath = path.join(
  ROOT,
  "..",
  "basketball-analytics-m17c",
  "reports",
  "m17c",
  "03_target_manifest.csv"
);
const EXPECTED =
  "9004b7ae8b16d237356885b6049255ef725527c033606fd52002c7196fdeff56";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") {
        cols.push(cur);
        cur = "";
      } else cur += ch;
    }
    cols.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

const rows = parseCsv(readFileSync(manifestPath, "utf8"));
const targetCanonical = JSON.stringify({
  version: "m17c-target-v1",
  lambda: 3200,
  mode: "NET",
  lineupModel: "m18-lineup-impact-v1",
  rows: rows.map((r) => ({
    w: r.window,
    p: r.predictorSeason,
    t: r.targetSeason,
    id: r.playerId,
    y: Number(r.targetValue),
    expT: Number(r.exposureTarget),
    expP: Number(r.exposurePred),
    tc: Number(r.teamChanged),
    drbl: Number(r.DRBL_pred),
  })),
});
const h = createHash("sha256").update(targetCanonical).digest("hex");
const out = {
  reproduced_from_sealed_manifest: h,
  expected: EXPECTED,
  match: h === EXPECTED,
  rows: rows.length,
};
writeFileSync(
  path.join(ROOT, "reports", "m17c_provenance", "04b_target_hash_repro.json"),
  JSON.stringify(out, null, 2) + "\n"
);
console.log(out);
