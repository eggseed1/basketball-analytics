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

  // Cloudflare Explore boards need season-tables for the live league year.
  // stats.nba.com only reaches the home runner — flag when tip has passed and
  // the bake is still missing so every future opener is caught the same way.
  if (info.shouldRefreshPlayerViz && info.tipDate) {
    const tables = await readJson(
      path.join(ROOT, "src/data/runtime/season-tables-snapshot.json"),
      null
    );
    const live = tables?.seasons?.[info.season];
    const advancedRows = Array.isArray(live?.advanced) ? live.advanced.length : 0;
    if (!live || advancedRows === 0) {
      items.push({
        id: "season-tables-live",
        severity: "warn",
        detail: `${info.season} is open (tip ${info.tipDate}) but season-tables has no rows; run scripts/local/stats-nba-refresh.sh on the home stats runner`,
      });
    }

    // A newly stamped JSON bundle can still hold old game logs when the
    // stats.nba.com home-runner reuse/fallback has not advanced. Compare the
    // actual GP grain with independently refreshed ESPN standings.
    if (advancedRows > 0) {
      const standings = await readJson(
        path.join(ROOT, "src/data/runtime/standings-snapshot.json"),
        null
      );
      const conferences = standings?.seasons?.[info.season]?.conferences ?? [];
      const teamGames = conferences.flatMap((c) => c.rows ?? [])
        .map((r) => Number(r.wins ?? 0) + Number(r.losses ?? 0));
      const maxTeamGp = teamGames.length ? Math.max(...teamGames) : 0;
      const playerGames = [...(live.advanced ?? []), ...(live.perGame ?? [])]
        .map((r) => Number(r.gp ?? 0))
        .filter(Number.isFinite);
      const maxPlayerGp = playerGames.length ? Math.max(...playerGames) : 0;
      if (maxTeamGp >= 4 && maxPlayerGp + 2 < maxTeamGp) {
        items.push({
          id: "season-tables-stale-gp",
          severity: "warn",
          detail: `${info.season} cached player GP max ${maxPlayerGp} trails ESPN standings max ${maxTeamGp}; refresh NBA season totals on the home runner. The snapshot generatedAt alone is not a freshness check.`,
        });
      }
    }
  }

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
