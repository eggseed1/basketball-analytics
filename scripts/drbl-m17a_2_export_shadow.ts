import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const seasons = ["2020-21", "2021-22", "2022-23", "2023-24"];
mkdirSync("reports/m17a_2/shadow", { recursive: true });

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

let totalPlayers = 0;
for (const season of seasons) {
  const p = `src/data/drbl/precomputed/${season}.json`;
  const j = JSON.parse(readFileSync(p, "utf8")) as {
    gamesProcessed?: number;
    players?: Record<string, unknown>[];
  };
  const players = (j.players ?? []).map((pl) => ({
    season,
    playerId: pl.playerId,
    playerName: pl.playerName,
    N: pl.possessions ?? pl.N,
    ApproachBAttributedValue:
      pl.approachBAttributedValue ?? pl.r1Points ?? "",
    rawAbilityRate: pl.rawAbilityRate ?? "",
    validatedDRBL100: pl.drbl100,
    R1Points: pl.r1Points ?? pl.R1Points ?? "",
    R1WinEquivalents:
      pl.r1WinEquivalents ?? pl.r1WinEq ?? "",
    r1PointsPerWin: pl.r1PointsPerWin ?? 37.490662671779255,
  }));
  totalPlayers += players.length;
  writeFileSync(
    `reports/m17a_2/shadow/${season}-player-season.csv`,
    toCsv(players)
  );
  console.log(
    JSON.stringify({
      season,
      players: players.length,
      gamesProcessed: j.gamesProcessed,
    })
  );
}
console.log(JSON.stringify({ totalPlayers }));
