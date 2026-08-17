/**
 * Season-complete data-quality validation for one fully downloaded season.
 * Scoreboard / completeness / event labels / sub+lineup+possession diagnostics.
 * Does NOT compute DRBL/R1 and does NOT publish.
 *
 *   npx tsx scripts/drbl-m17a_1_season_validate.ts --season 1996-97
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { listSeasonGames, processGame } from "../drbl";
import { isValidJsonFile } from "../drbl/download/atomic-json";
import { rawPath } from "../drbl/download/disk-cache";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

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

function sha256Buf(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const season = arg("season");
  if (!season) throw new Error("--season required");

  const OUT = path.join(
    process.cwd(),
    "reports",
    "m17a_1",
    "import",
    "season_validation",
    season
  );
  mkdirSync(OUT, { recursive: true });

  const games = await listSeasonGames(season);
  const expected = games.length;

  const scoreboardRows: Record<string, unknown>[] = [];
  const labelCounts = new Map<string, number>();
  const completenessRows: Record<string, unknown>[] = [];
  const manifestRows: Record<string, unknown>[] = [];

  let downloaded = 0;
  let audited = 0;
  let exact = 0;
  let mismatches = 0;
  let missing = 0;
  let maxResidual = 0;
  let absResidualSum = 0;
  let lineupPoss = 0;
  let lineupComplete = 0;
  let subEvents = 0;
  let subParsed = 0;
  let subInResolved = 0;
  let subOutResolved = 0;

  console.log(`Validating ${season}: expected=${expected}`);

  for (let i = 0; i < games.length; i++) {
    const g = games[i]!;
    const pbpPath = rawPath("games", g.gameId, "playbyplay.json");
    const boxPath = rawPath("games", g.gameId, "boxscore.json");
    const pOk = await isValidJsonFile(pbpPath);
    const bOk = await isValidJsonFile(boxPath);
    if (!pOk || !bOk) {
      missing++;
      completenessRows.push({
        season,
        gameId: g.gameId,
        status: "MISSING_RAW",
        pbp: pOk ? "YES" : "NO",
        box: bOk ? "YES" : "NO",
      });
      continue;
    }
    downloaded++;

    const pbpRaw = readFileSync(pbpPath);
    const boxRaw = readFileSync(boxPath);
    manifestRows.push({
      season,
      gameId: g.gameId,
      kind: "playbyplay",
      relativePath: `data/drbl/raw/games/${g.gameId}/playbyplay.json`,
      bytes: pbpRaw.byteLength,
      sha256: sha256Buf(pbpRaw),
      sourceFamily: "stats_or_cdn",
    });
    manifestRows.push({
      season,
      gameId: g.gameId,
      kind: "boxscore",
      relativePath: `data/drbl/raw/games/${g.gameId}/boxscore.json`,
      bytes: boxRaw.byteLength,
      sha256: sha256Buf(boxRaw),
      sourceFamily: "stats_or_cdn_adapted",
    });

    // Event label inventory
    try {
      const pbp = JSON.parse(pbpRaw.toString("utf8")) as {
        game?: { actions?: { actionType?: string }[] };
      };
      for (const a of pbp.game?.actions ?? []) {
        const lab = String(a.actionType ?? "");
        labelCounts.set(lab, (labelCounts.get(lab) ?? 0) + 1);
      }
    } catch {
      /* counted missing elsewhere */
    }

    try {
      const processed = await processGame(g, { force: false, persist: true });
      audited++;
      const homeBox = processed.box.homeScore;
      const awayBox = processed.box.awayScore;
      const homePoss = processed.reconcile.homePointsFromPossessions;
      const awayPoss = processed.reconcile.awayPointsFromPossessions;
      const resid = Math.max(
        Math.abs(homePoss - homeBox),
        Math.abs(awayPoss - awayBox)
      );
      absResidualSum += resid;
      maxResidual = Math.max(maxResidual, resid);
      const isExact = resid === 0;
      if (isExact) exact++;
      else mismatches++;

      scoreboardRows.push({
        season,
        gameId: g.gameId,
        homeBox,
        awayBox,
        homeEvent: homePoss,
        awayEvent: awayPoss,
        residual: resid,
        exact: isExact ? "YES" : "NO",
        reconcileOk: processed.reconcile.ok ? "YES" : "NO",
        quarantined: processed.reconcile.quarantined ? "YES" : "NO",
      });

      for (const p of processed.possessions) {
        lineupPoss++;
        if (
          (p.offensePlayerIds?.length ?? 0) === 5 &&
          (p.defensePlayerIds?.length ?? 0) === 5
        ) {
          lineupComplete++;
        }
      }

      for (const e of processed.events) {
        if (e.actionType !== "substitution") continue;
        subEvents++;
        subParsed++;
        if (e.substitutionSide === "in" && e.playerId) subInResolved++;
        if (e.substitutionSide === "out" && e.playerId) subOutResolved++;
      }

      completenessRows.push({
        season,
        gameId: g.gameId,
        status: processed.reconcile.ok
          ? "COMPLETE"
          : isExact
            ? "REPAIRABLE_SOURCE_STRUCTURE"
            : "PARTIAL",
        periods: [...new Set(processed.events.map((e) => e.period))].join("|"),
        events: processed.events.length,
        possessions: processed.possessions.length,
      });
    } catch (e) {
      mismatches++;
      scoreboardRows.push({
        season,
        gameId: g.gameId,
        homeBox: "",
        awayBox: "",
        homeEvent: "",
        awayEvent: "",
        residual: "",
        exact: "NO",
        reconcileOk: "NO",
        quarantined: "",
        error: String((e as Error).message || e).slice(0, 200),
      });
    }

    if (i % 50 === 0 || i === games.length - 1) {
      console.log(
        `${season} validate ${i + 1}/${expected} exact=${exact} mismatch=${mismatches}`
      );
    }
  }

  const labelRows = [...labelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rawLabel, count]) => ({
      season,
      rawLabel,
      count,
      mapped:
        /^(2pt|3pt|freethrow|rebound|turnover|foul|substitution|jumpball|period|timeout|violation|ejection|game|steal|block)$/i.test(
          rawLabel
        ) ||
        /^(Made Shot|Missed Shot|Free Throw|Rebound|Turnover|Foul|Substitution|Jump Ball|Timeout|Violation|period)$/i.test(
          rawLabel
        )
          ? "YES"
          : rawLabel === ""
            ? "EXPLICIT_UNKNOWN"
            : "REVIEW",
    }));

  writeFileSync(path.join(OUT, "scoreboard.csv"), toCsv(scoreboardRows));
  writeFileSync(path.join(OUT, "completeness.csv"), toCsv(completenessRows));
  writeFileSync(path.join(OUT, "event_labels.csv"), toCsv(labelRows));
  writeFileSync(path.join(OUT, "raw_manifest.csv"), toCsv(manifestRows));
  writeFileSync(
    path.join(OUT, "summary.json"),
    JSON.stringify(
      {
        season,
        M17A_1_STATUS: "RAW_IMPORT_IN_PROGRESS",
        validationOnly: true,
        noDrblCompute: true,
        gamesExpected: expected,
        gamesDownloaded: downloaded,
        gamesAudited: audited,
        exactScoreMatches: exact,
        scoreMismatches: mismatches,
        missingGames: missing,
        maxResidual,
        meanAbsResidual: audited ? absResidualSum / audited : null,
        scoreboardPassRate: audited ? exact / audited : null,
        lineupPossessions: lineupPoss,
        lineupComplete5v5: lineupComplete,
        rawLineupCompleteness: lineupPoss ? lineupComplete / lineupPoss : null,
        substitutionEvents: subEvents,
        subParsed,
        subInResolved,
        subOutResolved,
        unmappedOrReviewLabels: labelRows.filter((r) => r.mapped === "REVIEW")
          .length,
        completedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  console.log(
    JSON.stringify(
      JSON.parse(readFileSync(path.join(OUT, "summary.json"), "utf8")),
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
