import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const season = process.argv[2] ?? "2024-25";
  const src = path.join(
    process.cwd(),
    "src/data/drbl/precomputed",
    `${season}.json`
  );
  const raw = JSON.parse(await readFile(src, "utf8")) as {
    players: Array<Record<string, unknown>>;
    gamesProcessed?: number;
    version?: string;
    rankingFormulaVersion?: string;
    rankingMode?: string;
  };

  const players = (raw.players ?? []).slice();
  // Prefer explicit finalRankingScore ordering from remaster / finalize.
  const hasFinal = players.some((p) => p.finalRankingScore != null);
  const hasRank = players.every((p) => typeof p.rank === "number");
  if (!hasRank) {
    players.sort((a, b) => {
      if (hasFinal) {
        return Number(b.finalRankingScore) - Number(a.finalRankingScore);
      }
      // Legacy fallback (should not run after remaster).
      return Number(b.drbl100) - Number(a.drbl100);
    });
  } else {
    players.sort((a, b) => Number(a.rank) - Number(b.rank));
  }
  const top = players.slice(0, 100);

  const cols = [
    "rank",
    "playerId",
    "playerName",
    "teamId",
    "rankingMode",
    "finalRankingScore",
    "actualPossessions",
    "possessions",
    "rawAbilityRate",
    "posteriorAbilityRate",
    "drbl100",
    "drblP",
    "drblLn",
    "drblB",
    "drblO",
    "drblD",
    "sdv100",
    "shotMaking100",
    "epvShootMean",
    "vContMean",
    "drblWar",
    "seasonWar",
    "seasonalImpact",
    "forecastPossessions",
    "forecastImpact",
    "forecastWar",
    "abilityStandardError",
    "componentDisagreementIndex",
    "drblL",
    "meanLeverage",
    "disagreement",
    "uncertainty",
    "displayUncertainty",
    "intervalLo",
    "intervalHi",
    "intervalConfidence",
    "rankingFormulaVersion",
    "eligibilityStatus",
  ] as const;

  function esc(v: unknown): string {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const lines = [cols.join(",")];
  top.forEach((p, i) => {
    lines.push(
      cols
        .map((c) => esc(c === "rank" ? (p.rank ?? i + 1) : p[c]))
        .join(",")
    );
  });

  const outDir = path.join(process.cwd(), "reports", "post-m7");
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `top100_${season.replace("-", "_")}.csv`);
  await writeFile(out, lines.join("\n") + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        out,
        n: top.length,
        season,
        version: raw.version,
        rankingFormulaVersion: raw.rankingFormulaVersion,
        rankingMode: raw.rankingMode,
        gamesProcessed: raw.gamesProcessed,
        top5: top.slice(0, 5).map(
          (p) =>
            `${p.playerName} score=${p.finalRankingScore ?? p.drbl100}`
        ),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
