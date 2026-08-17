/**
 * Probe historical PBP availability via existing DRBL download clients.
 *   npx tsx scripts/probe-historical-pbp.ts
 */
import { listSeasonGames } from "../drbl/download/season-games";
import {
  downloadCdnBoxScore,
  downloadCdnPlayByPlay,
  downloadStatsPlayByPlayV3,
} from "../drbl/download/cdn-client";

async function probe(season: string) {
  try {
    const games = await listSeasonGames(season, { force: true });
    const g = games[0];
    if (!g) {
      console.log(JSON.stringify({ season, games: 0 }));
      return;
    }
    let cdn = false;
    let stats = false;
    let box = false;
    let actions = 0;
    let err = "";
    try {
      const p = (await downloadCdnPlayByPlay(g.gameId)) as {
        game?: { actions?: unknown[] };
      };
      actions = p?.game?.actions?.length ?? 0;
      cdn = actions > 0;
    } catch (e) {
      err += `cdn:${String((e as Error).message || e).slice(0, 80)};`;
    }
    try {
      const p = (await downloadStatsPlayByPlayV3(g.gameId)) as {
        game?: { actions?: unknown[] };
      };
      const a = p?.game?.actions;
      if (Array.isArray(a) && a.length > 0) {
        stats = true;
        actions = Math.max(actions, a.length);
      }
    } catch (e) {
      err += `stats:${String((e as Error).message || e).slice(0, 80)};`;
    }
    try {
      await downloadCdnBoxScore(g.gameId);
      box = true;
    } catch (e) {
      err += `box:${String((e as Error).message || e).slice(0, 80)};`;
    }
    console.log(
      JSON.stringify({
        season,
        games: games.length,
        sample: g.gameId,
        cdn,
        stats,
        box,
        actions,
        err,
      })
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        season,
        error: String((e as Error).message || e).slice(0, 200),
      })
    );
  }
}

async function main() {
  const seasons = [
    "1996-97",
    "1997-98",
    "2000-01",
    "2005-06",
    "2010-11",
    "2015-16",
    "2016-17",
    "2019-20",
    "2020-21",
    "2023-24",
  ];
  for (const s of seasons) {
    await probe(s);
    await new Promise((r) => setTimeout(r, 500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
