import { readFileSync } from "node:fs";
import path from "node:path";

const root = "data/drbl/history/drbl-history-v1";
for (const season of ["2018-19", "2019-20", "2020-21", "2023-24"]) {
  const p = path.join(root, season, "player-games.json");
  const data = JSON.parse(readFileSync(p, "utf8")) as {
    rows: Array<{
      playerId: string;
      date: string;
      minutes: string | null;
      points: number;
      fgm: number;
    }>;
  };
  const all = data.rows.filter((r) => r.playerId === "1629027");
  console.log(
    "===",
    season,
    "n=",
    all.length,
    "samples=",
    all.slice(0, 5).map((r) => ({ d: r.date, m: r.minutes, pts: r.points }))
  );
}
