#!/usr/bin/env node
/**
 * Soft seasonal checklist: writes data/ops/seasonal-upkeep.json when hand-maintained
 * catalogs may need a yearly pass (HOF class, franchise lore, GM / ONE SHOT seeds).
 *
 * Runs from daily-runtime-sync (soft-fail). Does not block deploy.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  nbaSeasonPhaseInfo,
} from "./lib/nba-season-phase.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "ops", "seasonal-upkeep.json");

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const now = new Date();
  const info = nbaSeasonPhaseInfo(now);
  const prior = canonicalSeasonFromStartYear(currentNbaStartYear(now) - 1);
  const items = [];

  const awards = await readJson(
    path.join(ROOT, "src/data/runtime/player-awards-snapshot.json"),
    null
  );
  const awardsSeason = awards?.generatedForSeason ?? awards?.season ?? null;
  if (info.phase === "offseason" && awardsSeason && awardsSeason < prior) {
    items.push({
      id: "awards-snapshot",
      severity: "warn",
      detail: `player-awards-snapshot looks older than ${prior}; run awards:sync on the home stats runner`,
    });
  }

  const hof = await fs.readFile(
    path.join(ROOT, "src/content/awards/history.ts"),
    "utf8"
  );
  const inductionYear = now.getUTCFullYear();
  // April announcement window: flag if this calendar year's class string is absent.
  if (now.getUTCMonth() >= 3 && !hof.includes(String(inductionYear))) {
    items.push({
      id: "hof-class",
      severity: "info",
      detail: `HOF_HISTORY may need the ${inductionYear} class after the April announcement (src/content/awards/history.ts)`,
    });
  }

  const oneShot = await fs.readFile(
    path.join(ROOT, "src/one-shot/engine.ts"),
    "utf8"
  );
  const shotYear = Number((/SNAPSHOT_YEAR\s*=\s*(\d{4})/.exec(oneShot) ?? [])[1]);
  if (Number.isFinite(shotYear) && shotYear < now.getUTCFullYear()) {
    items.push({
      id: "one-shot-year",
      severity: "info",
      detail: `ONE SHOT SNAPSHOT_YEAR is ${shotYear}; bump for the new calendar year if the sim seed should roll forward`,
    });
  }

  const gmSched = path.join(ROOT, "src/gm/seed");
  items.push({
    id: "gm-seed",
    severity: "info",
    detail: `GM Lab seeds under ${path.relative(ROOT, gmSched)} stay year-locked; reseed after the draft / media day when the sim should match the new league year`,
  });

  const report = {
    generatedAt: now.toISOString(),
    season: info.season,
    phase: info.phase,
    tipDate: info.tipDate ?? null,
    items,
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `[seasonal-upkeep] ${items.length} note(s) for ${info.season} → ${path.relative(ROOT, OUT)}`
  );
}

main().catch((error) => {
  console.error(
    `[seasonal-upkeep] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
