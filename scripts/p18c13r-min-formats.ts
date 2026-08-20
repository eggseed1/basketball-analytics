import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = "data/drbl/history/drbl-history-v1";
const seasons = readdirSync(root).filter((d) => /^\d{4}-\d{2}$/.test(d));
for (const season of seasons.sort()) {
  const p = path.join(root, season, "player-games.json");
  if (!existsSync(p)) continue;
  const data = JSON.parse(readFileSync(p, "utf8")) as {
    rows: Array<{ minutes: string | null }>;
  };
  let pt = 0;
  let mm = 0;
  let other = 0;
  let nulls = 0;
  for (const r of data.rows.slice(0, 5000)) {
    if (r.minutes == null) nulls++;
    else if (String(r.minutes).startsWith("PT")) pt++;
    else if (String(r.minutes).includes(":")) mm++;
    else other++;
  }
  if (pt > 0 || other > 0) {
    console.log(season, { pt, mm, other, nulls, sampleN: Math.min(5000, data.rows.length) });
  }
}
