/**
 * M15 charts - SVG only, no model changes.
 *   npx tsx scripts/drbl-m15-charts.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Player = {
  playerName: string;
  possessions: number;
  actualPossessions?: number;
  drbl100: number;
  rawAbilityRate?: number;
  posteriorAbilityRate?: number;
  drblWar: number;
  drblO: number;
  drblD: number;
  drblP: number;
  drblLn: number;
  drblB: number;
};

function poss(p: Player): number {
  return Number(p.actualPossessions ?? p.possessions) || 0;
}

function scatterSvg(
  points: Array<{ x: number; y: number; label?: string }>,
  opts: { title: string; xlab: string; ylab: string; w?: number; h?: number }
): string {
  const w = opts.w ?? 720;
  const h = opts.h ?? 420;
  const pad = { l: 56, r: 20, t: 40, b: 48 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const xspan = xmax - xmin || 1;
  const yspan = ymax - ymin || 1;
  const X = (x: number) => pad.l + ((x - xmin) / xspan) * (w - pad.l - pad.r);
  const Y = (y: number) =>
    h - pad.b - ((y - ymin) / yspan) * (h - pad.t - pad.b);
  const dots = points
    .map(
      (p) =>
        `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.2" fill="#1f4b7a" fill-opacity="0.55"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#f7f5f0"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-family="Georgia, serif" font-size="16">${opts.title}</text>
  <line x1="${pad.l}" y1="${h - pad.b}" x2="${w - pad.r}" y2="${h - pad.b}" stroke="#333"/>
  <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${h - pad.b}" stroke="#333"/>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-family="system-ui" font-size="12">${opts.xlab}</text>
  <text x="16" y="${h / 2}" text-anchor="middle" font-family="system-ui" font-size="12" transform="rotate(-90 16 ${h / 2})">${opts.ylab}</text>
  ${dots}
</svg>`;
}

async function main() {
  const out = path.join(process.cwd(), "reports", "m15", "charts");
  await mkdir(out, { recursive: true });
  const a = JSON.parse(
    await readFile(
      path.join(process.cwd(), "src/data/drbl/precomputed/2024-25.json"),
      "utf8"
    )
  ) as { players: Player[]; gamesProcessed: number };

  const players = a.players;
  await writeFile(
    path.join(out, "drbl_vs_possessions.svg"),
    scatterSvg(
      players.map((p) => ({ x: poss(p), y: p.drbl100 })),
      {
        title: `2024-25 DRBL/100 vs possessions (${a.gamesProcessed} games)`,
        xlab: "possessions",
        ylab: "drbl100 (posterior)",
      }
    )
  );
  await writeFile(
    path.join(out, "war_vs_possessions.svg"),
    scatterSvg(
      players.map((p) => ({ x: poss(p), y: p.drblWar })),
      {
        title: `2024-25 DRBL-WAR vs possessions (${a.gamesProcessed} games)`,
        xlab: "possessions",
        ylab: "drblWar",
      }
    )
  );
  await writeFile(
    path.join(out, "raw_vs_posterior.svg"),
    scatterSvg(
      players
        .filter((p) => p.rawAbilityRate != null)
        .map((p) => ({
          x: Number(p.rawAbilityRate),
          y: Number(p.posteriorAbilityRate ?? p.drbl100),
        })),
      {
        title: "2024-25 raw ability rate vs posterior drbl100",
        xlab: "rawAbilityRate (seq P)",
        ylab: "posterior / displayed drbl100",
      }
    )
  );
  await writeFile(
    path.join(out, "offense_vs_defense.svg"),
    scatterSvg(
      players.map((p) => ({ x: p.drblO, y: p.drblD })),
      {
        title: "2024-25 DRBL-O vs DRBL-D (per 100)",
        xlab: "drblO",
        ylab: "drblD",
      }
    )
  );

  // Component wipe diagnostic bar
  const lnNz = players.filter((p) => Math.abs(p.drblLn) > 1e-6).length;
  const bNz = players.filter((p) => Math.abs(p.drblB) > 1e-6).length;
  const pNz = players.filter((p) => Math.abs(p.drblP) > 1e-6).length;
  const bars = [
    { label: "DRBL-P nonzero", n: pNz },
    { label: "DRBL-LN nonzero", n: lnNz },
    { label: "DRBL-B nonzero", n: bNz },
  ];
  const maxN = Math.max(...bars.map((b) => b.n), 1);
  const barSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="280" viewBox="0 0 640 280">
  <rect width="100%" height="100%" fill="#f7f5f0"/>
  <text x="320" y="28" text-anchor="middle" font-family="Georgia, serif" font-size="15">Component field population (2024-25 live)</text>
  ${bars
    .map((b, i) => {
      const y = 60 + i * 60;
      const w = (b.n / maxN) * 420;
      return `<text x="24" y="${y + 18}" font-family="system-ui" font-size="13">${b.label}</text>
  <rect x="180" y="${y}" width="${w}" height="28" fill="${b.n === 0 ? "#a33" : "#1f4b7a"}"/>
  <text x="${190 + w}" y="${y + 18}" font-family="system-ui" font-size="13">${b.n}/${players.length}</text>`;
    })
    .join("\n  ")}
  <text x="24" y="260" font-family="system-ui" font-size="11" fill="#444">Finding: sequential merge wiped LN/B to 0 on published rows (Class A).</text>
</svg>`;
  await writeFile(path.join(out, "component_population.svg"), barSvg);

  console.log(`Charts written to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
