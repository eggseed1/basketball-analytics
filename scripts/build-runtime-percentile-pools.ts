/**
 * Bake per-season peer pool cutoffs for player percentile career charts.
 *
 * The edge percentile API loads only a few peer boards per request, so most
 * career seasons came back without a percentile. This ranks every bundled
 * season against the same boards the API uses (bundled BRef + DARKO + DRBL +
 * hustle overlays) and keeps 101 quantile cutoffs per metric.
 *
 * Writes src/data/runtime/percentile-pools-snapshot.json.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

// Bundled overlays, same as Cloudflare Workers production.
Object.assign(process.env, { NODE_ENV: "production" });

/** Stop scanning focal players once this many in a row add no new metric. */
const IDLE_ROWS = 60;

async function main() {
  const { listBundledBrefSeasons } = await import("../src/data/runtime/bref-advanced-snapshot");
  const { loadBundledPeerBoard } = await import("../src/lib/player-percentile-load");
  const { buildPlayerPercentileMetrics, isQualifiedPeer, percentileCutoffs, percentileFromCutoffs } = await import(
    "../src/lib/player-percentile-metrics"
  );

  const seasons: Record<string, Record<string, number[]>> = {};
  let worst = { err: 0, at: "" };
  const errors: number[] = [];

  for (const season of [...listBundledBrefSeasons()].sort()) {
    const board = await loadBundledPeerBoard(season);
    if (!board) {
      console.log(`${season}: not bundled, skipped`);
      continue;
    }
    const pools = new Map<string, number[]>();
    const focals = board.filter(isQualifiedPeer).sort((a, b) => b.minutes - a.minutes);
    let idle = 0;
    for (const row of focals) {
      const before = pools.size;
      buildPlayerPercentileMetrics(row, [], board, [], row.playerId, undefined, {
        light: true,
        onPool: (id, values) => {
          if (!pools.has(id)) pools.set(id, [...values]);
        },
      });
      idle = pools.size === before ? idle + 1 : 0;
      if (idle >= IDLE_ROWS) break;
    }

    const out: Record<string, number[]> = {};
    for (const [id, values] of [...pools].sort(([a], [b]) => a.localeCompare(b))) {
      const cutoffs = percentileCutoffs(values);
      if (!cutoffs.length) continue;
      out[id] = cutoffs;
      const known = values.filter((v) => Number.isFinite(v)).map((v) => Number(v.toPrecision(6)));
      for (const v of known) {
        const exact = (known.filter((x) => x < v).length / known.length) * 100;
        const err = Math.abs(percentileFromCutoffs(v, cutoffs) - exact);
        errors.push(err);
        if (err > worst.err) worst = { err, at: `${season} ${id} ${v}` };
      }
    }
    seasons[season] = out;
    console.log(`${season}: ${Object.keys(out).length} metrics from ${focals.length} qualified players`);
  }

  errors.sort((a, b) => a - b);
  const p99 = errors[Math.floor(errors.length * 0.99)] ?? 0;
  console.log(
    `cutoff error vs exact rank: p99 ${p99.toFixed(2)} pct, max ${worst.err.toFixed(2)} pct (${worst.at})`
  );

  const file = path.join(process.cwd(), "src/data/runtime/percentile-pools-snapshot.json");
  writeFileSync(file, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), seasons }));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
