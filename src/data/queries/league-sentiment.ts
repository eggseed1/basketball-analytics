import "server-only";

import { cache } from "react";

import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { fetchEspnLeagueRosterPlayers } from "@/data/providers/nba/espn-roster-client";
import {
  buildCuratedPlayerIndex,
  getLeagueSentimentFeed,
  loadSentimentSnapshot,
} from "@/sentiment/load-curated";
import type { TrackedPlayerSentimentRow } from "@/sentiment/curated-types";

export const getLeagueSentimentBoard = cache(async () => {
  const feed = getLeagueSentimentFeed();
  const players = await listRosterSentimentRows();
  return { feed, players };
});

async function listRosterSentimentRows(): Promise<TrackedPlayerSentimentRow[]> {
  const snapshot = loadSentimentSnapshot();
  const season =
    snapshot?.meta.season ??
    canonicalSeasonFromStartYear(currentNbaStartYear());
  const curatedById = buildCuratedPlayerIndex(snapshot);
  const defaultWindow = snapshot?.league?.window ?? "7d";

  const roster = await fetchEspnLeagueRosterPlayers(season).catch(() => []);

  return roster
    .map((row) => {
      const curated = curatedById.get(row.playerId);
      return {
        playerId: row.playerId,
        displayName: curated?.displayName ?? row.playerName,
        teamKey: row.teamId ?? curated?.teamKey,
        window: curated?.window ?? defaultWindow,
        fan: curated?.fan,
        media: curated?.media,
        hasProfile: Boolean(curated),
        provenance: curated?.provenance,
      } satisfies TrackedPlayerSentimentRow;
    })
    .sort((a, b) => {
      const rank = (row: TrackedPlayerSentimentRow) => {
        if (row.provenance === "observation") return 0;
        if (row.provenance === "hand_crafted") return 1;
        if (row.hasProfile) return 2;
        return 3;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.displayName.localeCompare(b.displayName);
    });
}

export type { TrackedPlayerSentimentRow } from "@/sentiment/curated-types";
