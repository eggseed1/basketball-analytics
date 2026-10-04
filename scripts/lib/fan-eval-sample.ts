/**
 * `--sample <file>` support for the fan ingest scripts: a dry run that also
 * writes post text next to the scores so a labeled eval set can be built.
 * The file holds third-party text, so it must live outside the repo.
 */
import { appendFileSync } from "node:fs";
import path from "node:path";

import type { FanPostIngestItem } from "@/sentiment/ingest-store";

export function sampleOutputPath(): string | null {
  const index = process.argv.indexOf("--sample");
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error("--sample needs a file path");
  const resolved = path.resolve(value);
  const repo = path.resolve(process.cwd());
  if (resolved === repo || resolved.startsWith(`${repo}${path.sep}`)) {
    throw new Error("--sample must point outside the repo (it contains post text)");
  }
  return resolved;
}

export function writeSample(
  file: string,
  rows: FanPostIngestItem[],
  textById: Map<string, string>,
  nameById: Map<string, string>
): void {
  const lines = rows
    .filter((row) => textById.has(row.id))
    .map((row) =>
      JSON.stringify({
        id: row.id,
        platform: row.platform,
        source: row.source,
        playerIds: row.playerIds,
        playerNames: row.playerIds.map((id) => nameById.get(id) ?? id),
        teamIds: row.teamIds,
        score: row.score,
        text: textById.get(row.id),
      })
    );
  if (lines.length) appendFileSync(file, `${lines.join("\n")}\n`);
  console.log(`  sample: wrote ${lines.length} rows to ${file}`);
}
