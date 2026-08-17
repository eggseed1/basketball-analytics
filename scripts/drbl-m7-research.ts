/**
 * M7 research diagnostics — isolated; does NOT modify M6 or DRBL fusion.
 *
 * Quantifies whether ÊPV_continue ≈ M5(S_t) is nearly constant at shot moments,
 * and sketches a non-shot mid-possession remaining-points target for comparison.
 *
 *   npx tsx scripts/drbl-m7-research.ts --season 2024-25 --limit 120
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames, processGame } from "../drbl/index";
import { warmEpvModel, predictExpectedPoints } from "../drbl/models/expected-points";
import {
  buildShotRowsForGame,
  chronologicalOofShotDecision,
  type ShotDecisionRow,
} from "../drbl/models/shot-decision";
import type { DrblEvent, DrblPossession } from "../drbl/types";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => csvEscape(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = mean(xs);
  const my = mean(ys);
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
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : 0;
}

function isFg(e: DrblEvent): boolean {
  return (
    (e.actionType === "2pt" || e.actionType === "3pt") &&
    (e.shotResult === "Made" || e.shotResult === "Missed")
  );
}

/**
 * Non-shot mid-possession states: events on a possession that are NOT the
 * first FGA of that possession. Target = remaining possession points from
 * this event forward (includes later FGA points — used only as TARGET for
 * continue-labeled moments where the immediate action is not a shot).
 */
function collectContinueCandidateRows(
  events: DrblEvent[],
  possessions: DrblPossession[],
  homeTeamId: string
): Array<{
  possessionAgeSec: number;
  clockSeconds: number;
  scoreDiff: number;
  period: number;
  offenseIsHome: boolean;
  remainingPoints: number;
  m5Epv: number;
  actionType: string;
}> {
  const byAction = new Map(events.map((e) => [e.actionNumber, e]));
  const out: Array<{
    possessionAgeSec: number;
    clockSeconds: number;
    scoreDiff: number;
    period: number;
    offenseIsHome: boolean;
    remainingPoints: number;
    m5Epv: number;
    actionType: string;
  }> = [];

  for (const p of possessions) {
    const startClock = p.startClockSeconds;
    const actionNums = p.eventActionNumbers.slice().sort((a, b) => a - b);
      let sawFg = false;
    // Precompute cumulative points from each action to end via reverse pass.
    const remainingAt: Map<number, number> = new Map();
    let rem = 0;
    for (let i = actionNums.length - 1; i >= 0; i--) {
      const n = actionNums[i]!;
      const e = byAction.get(n);
      if (!e) continue;
      rem += e.pointsOnAction || 0;
      remainingAt.set(n, rem);
    }

    for (const n of actionNums) {
      const e = byAction.get(n);
      if (!e) continue;
      if (isFg(e)) {
        sawFg = true;
        continue;
      }
      // Continue-labeled: only pre-first-FGA non-shot events (pass/dribble proxies
      // are not explicit in PBP; we use any non-FG event before first FGA).
      if (sawFg) continue;
      if (
        e.actionType === "period" ||
        e.actionType === "game" ||
        e.actionType === "timeout" ||
        e.actionType === "substitution"
      ) {
        continue;
      }
      const offenseIsHome = p.offenseTeamId === homeTeamId;
      const scoreDiff = offenseIsHome
        ? e.scoreHome - e.scoreAway
        : e.scoreAway - e.scoreHome;
      const age = Math.max(0, startClock - e.clockSeconds);
      const state = {
        period: e.period,
        clockSeconds: e.clockSeconds,
        offenseIsHome,
        scoreDiff,
      };
      out.push({
        possessionAgeSec: age,
        clockSeconds: e.clockSeconds,
        scoreDiff,
        period: e.period,
        offenseIsHome,
        remainingPoints: remainingAt.get(n) ?? 0,
        m5Epv: predictExpectedPoints(state),
        actionType: e.actionType,
      });
    }
  }
  return out;
}

async function main() {
  const season = arg("season") ?? "2024-25";
  const limit = arg("limit") ? Number(arg("limit")) : 120;
  const holdoutFrac = arg("holdout-frac") ? Number(arg("holdout-frac")) : 0.2;

  const outDir = path.join(process.cwd(), "reports", "m7");
  await mkdir(outDir, { recursive: true });
  await warmEpvModel();

  let games = await listSeasonGames(season);
  if (limit > 0) games = games.slice(0, limit);

  const gameBundles: Array<{
    gameDate: string;
    gameId: string;
    rows: ShotDecisionRow[];
  }> = [];
  const continueRows: ReturnType<typeof collectContinueCandidateRows> = [];
  let gamesProcessed = 0;

  for (const meta of games) {
    try {
      const g = await processGame(meta, { persist: true });
      if (g.reconcile.quarantined) continue;
      const rows = buildShotRowsForGame(g.box, g.events, g.possessions);
      if (rows.length === 0) continue;
      gameBundles.push({
        gameDate: g.box.gameDate || meta.gameDate,
        gameId: g.box.gameId,
        rows,
      });
      continueRows.push(
        ...collectContinueCandidateRows(
          g.events,
          g.possessions,
          g.box.homeTeamId
        )
      );
      gamesProcessed += 1;
    } catch {
      // skip
    }
  }

  const result = chronologicalOofShotDecision(gameBundles, {
    holdoutFrac,
    lambda: 5,
  });
  const holdout = result.oof.filter((r) => r.fold === "holdout");

  const epvCont = holdout.map((r) => r.epvContinue);
  const epvShoot = holdout.map((r) => r.epvShoot);
  const sdv = holdout.map((r) => r.sdv);
  const making = holdout.map((r) => r.shotMaking);

  // Possession age at shot (from row we don't have start clock — approx via
  // period clock alone is insufficient). Use continue-candidate ages instead.

  const ageBuckets = [
    { name: "age_0_4", lo: 0, hi: 4 },
    { name: "age_4_8", lo: 4, hi: 8 },
    { name: "age_8_14", lo: 8, hi: 14 },
    { name: "age_14_24", lo: 14, hi: 24 },
    { name: "age_24_plus", lo: 24, hi: 1e9 },
  ];

  const rowsOut: Record<string, unknown>[] = [
    {
      component: "audit",
      metric: "games_processed",
      value: gamesProcessed,
      n: gamesProcessed,
      notes: "M7 research diagnostic only; M6 frozen",
    },
    {
      component: "C0_m5_continue_at_shots",
      metric: "mean",
      value: Number(mean(epvCont).toFixed(4)),
      n: holdout.length,
      notes: "holdout shot moments",
    },
    {
      component: "C0_m5_continue_at_shots",
      metric: "std",
      value: Number(std(epvCont).toFixed(4)),
      n: holdout.length,
      notes: "low std ⇒ nearly flat continuation",
    },
    {
      component: "C0_m5_continue_at_shots",
      metric: "p10",
      value: Number(
        [...epvCont].sort((a, b) => a - b)[
          Math.floor(0.1 * epvCont.length)
        ]!.toFixed(4)
      ),
      n: holdout.length,
      notes: "",
    },
    {
      component: "C0_m5_continue_at_shots",
      metric: "p90",
      value: Number(
        [...epvCont].sort((a, b) => a - b)[
          Math.floor(0.9 * epvCont.length)
        ]!.toFixed(4)
      ),
      n: holdout.length,
      notes: "",
    },
    {
      component: "separation",
      metric: "corr_sdv_epvShoot",
      value: Number(corr(sdv, epvShoot).toFixed(4)),
      n: holdout.length,
      notes: "if ~1, SDV is mostly rescaled shot quality",
    },
    {
      component: "separation",
      metric: "corr_sdv_shotMaking",
      value: Number(corr(sdv, making).toFixed(4)),
      n: holdout.length,
      notes: "should be near 0 if decision ⊥ making",
    },
    {
      component: "separation",
      metric: "corr_sdv_epvContinue",
      value: Number(corr(sdv, epvCont).toFixed(4)),
      n: holdout.length,
      notes: "",
    },
    {
      component: "epv_shoot",
      metric: "mean",
      value: Number(mean(epvShoot).toFixed(4)),
      n: holdout.length,
      notes: "",
    },
    {
      component: "epv_shoot",
      metric: "std",
      value: Number(std(epvShoot).toFixed(4)),
      n: holdout.length,
      notes: "",
    },
    {
      component: "sdv",
      metric: "mean",
      value: Number(mean(sdv).toFixed(4)),
      n: holdout.length,
      notes: "",
    },
    {
      component: "sdv",
      metric: "std",
      value: Number(std(sdv).toFixed(4)),
      n: holdout.length,
      notes: "",
    },
    {
      component: "C1_nonsShot_preFG_remaining",
      metric: "n_states",
      value: continueRows.length,
      n: continueRows.length,
      notes: "pre-first-FGA non-shot events; target=remaining poss points",
    },
    {
      component: "C1_nonsShot_preFG_remaining",
      metric: "mean_remaining_points",
      value: Number(mean(continueRows.map((r) => r.remainingPoints)).toFixed(4)),
      n: continueRows.length,
      notes: "TARGET construction uses post-state outcomes",
    },
    {
      component: "C1_nonsShot_preFG_remaining",
      metric: "mean_m5_epv",
      value: Number(mean(continueRows.map((r) => r.m5Epv)).toFixed(4)),
      n: continueRows.length,
      notes: "FEATURE-side M5 at same states",
    },
    {
      component: "C1_nonsShot_preFG_remaining",
      metric: "mae_m5_vs_remaining",
      value: Number(
        mean(
          continueRows.map((r) => Math.abs(r.m5Epv - r.remainingPoints))
        ).toFixed(4)
      ),
      n: continueRows.length,
      notes: "C0 baseline error on continue-labeled states",
    },
    {
      component: "C1_nonsShot_preFG_remaining",
      metric: "corr_m5_vs_remaining",
      value: Number(
        corr(
          continueRows.map((r) => r.m5Epv),
          continueRows.map((r) => r.remainingPoints)
        ).toFixed(4)
      ),
      n: continueRows.length,
      notes: "",
    },
    {
      component: "data_constraint",
      metric: "shot_clock_in_cdn_pbp",
      value: 0,
      n: 0,
      notes: "CDN playbyplay.json has no shotClock field (verified)",
    },
  ];

  for (const b of ageBuckets) {
    const subset = continueRows.filter(
      (r) => r.possessionAgeSec >= b.lo && r.possessionAgeSec < b.hi
    );
    if (subset.length === 0) continue;
    rowsOut.push({
      component: "C1_by_possession_age",
      metric: b.name,
      value: Number(mean(subset.map((r) => r.remainingPoints)).toFixed(4)),
      n: subset.length,
      notes: `mean remaining points; mean_m5=${mean(subset.map((r) => r.m5Epv)).toFixed(3)}`,
    });
  }

  // Late-clock continue candidates
  const late = continueRows.filter((r) => r.clockSeconds <= 8);
  const early = continueRows.filter((r) => r.clockSeconds > 60);
  if (late.length && early.length) {
    rowsOut.push({
      component: "C1_game_clock_strata",
      metric: "mean_remaining_late_le8",
      value: Number(mean(late.map((r) => r.remainingPoints)).toFixed(4)),
      n: late.length,
      notes: "",
    });
    rowsOut.push({
      component: "C1_game_clock_strata",
      metric: "mean_remaining_early_gt60",
      value: Number(mean(early.map((r) => r.remainingPoints)).toFixed(4)),
      n: early.length,
      notes: "",
    });
    rowsOut.push({
      component: "C0_game_clock_strata",
      metric: "mean_m5_late_le8",
      value: Number(mean(late.map((r) => r.m5Epv)).toFixed(4)),
      n: late.length,
      notes: "",
    });
    rowsOut.push({
      component: "C0_game_clock_strata",
      metric: "mean_m5_early_gt60",
      value: Number(mean(early.map((r) => r.m5Epv)).toFixed(4)),
      n: early.length,
      notes: "",
    });
  }

  await writeFile(
    path.join(outDir, "m7_component_analysis.csv"),
    toCsv(rowsOut),
    "utf8"
  );

  console.log({
    gamesProcessed,
    holdoutShots: holdout.length,
    continueStates: continueRows.length,
    corrSdvEpvShoot: corr(sdv, epvShoot),
    continueStd: std(epvCont),
    out: path.join(outDir, "m7_component_analysis.csv"),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
