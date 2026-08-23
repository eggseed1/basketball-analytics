import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  downloadCdnBoxScore,
  downloadCdnPlayByPlay,
  downloadStatsPlayByPlayV3,
} from "../drbl/download/cdn-client";

const ROOT = path.join(process.cwd(), "scripts", "fixtures", "pbp", "games");

async function main() {
  for (const id of ["0022400001", "0021900001", "0042400101"]) {
    const dir = path.join(ROOT, id);
    mkdirSync(dir, { recursive: true });
    const [pbp, box] = await Promise.all([
      downloadCdnPlayByPlay(id),
      downloadCdnBoxScore(id),
    ]);
    writeFileSync(path.join(dir, "playbyplay.json"), JSON.stringify(pbp));
    writeFileSync(path.join(dir, "boxscore.json"), JSON.stringify(box));
    const actions = (pbp as { game?: { actions?: unknown[] } }).game?.actions
      ?.length;
    console.log(id, "actions", actions);
  }

  const statsId = "0021500001";
  const statsDir = path.join(ROOT, statsId);
  mkdirSync(statsDir, { recursive: true });
  const statsPbp = await downloadStatsPlayByPlayV3(statsId);
  writeFileSync(
    path.join(statsDir, "playbyplay.json"),
    JSON.stringify(statsPbp)
  );
  console.log(
    statsId,
    "stats actions",
    (statsPbp as { game?: { actions?: unknown[] } }).game?.actions?.length
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
