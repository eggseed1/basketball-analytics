/**
 * Adds tonight's Recent Insights cards to the findings archive behind
 * /findings and /findings/feed.xml. Live cards come from the same builder as
 * the homepage; the bundled snapshot seeds the archive with the last baked slate.
 *
 *   npx tsx --require ./scripts/lib/stub-server-only.cjs scripts/build-findings-archive.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getLiveRecentInsights } from "@/data/queries/recent-insights-live";
import { mergeFindings, type FindingsArchive } from "@/lib/findings-archive";
import type { RecentInsight } from "@/lib/recent-insights";

const ROOT = process.cwd();
const ARCHIVE = path.join(ROOT, "src/data/runtime/findings-archive.json");
const SNAPSHOT = path.join(ROOT, "src/data/runtime/recent-insights-snapshot.json");

async function main() {
  const now = new Date().toISOString();
  const archive = JSON.parse(await readFile(ARCHIVE, "utf8")) as FindingsArchive;
  const before = new Set(archive.findings.map((f) => f.id));
  let findings = archive.findings;

  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as {
    season?: string;
    generatedAt?: string | null;
    insights?: RecentInsight[];
  };
  if (snapshot.season && snapshot.insights?.length) {
    findings = mergeFindings(findings, snapshot.insights, {
      season: snapshot.season,
      preseason: false,
      now: snapshot.generatedAt ?? now,
    });
  }

  const live = await getLiveRecentInsights();
  if (live) {
    findings = mergeFindings(findings, live.insights, {
      season: live.season,
      preseason: live.preseason,
      now,
    });
  } else {
    console.log("[findings-archive] no live cards (no finals yet or feeds down)");
  }

  const added = findings.filter((f) => !before.has(f.id)).length;
  if (JSON.stringify(findings) === JSON.stringify(archive.findings)) {
    console.log(`[findings-archive] unchanged, ${findings.length} findings`);
    return;
  }
  const next: FindingsArchive = { updatedAt: now, findings };
  await writeFile(ARCHIVE, `${JSON.stringify(next)}\n`);
  console.log(`[findings-archive] ${added} new, ${findings.length} total`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
