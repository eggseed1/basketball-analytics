import "server-only";

import { cache } from "react";

import { loadSentimentSnapshot } from "@/sentiment/load-curated";
import type { SentimentMoverRow } from "@/sentiment/curated-types";
import { computeSentimentMovers } from "@/sentiment/movers";

export type { SentimentMoverRow };

export type SentimentMoversBoard = {
  season: string;
  window: string;
  disclaimer: string;
  risers: SentimentMoverRow[];
  fallers: SentimentMoverRow[];
};

export const getSentimentMoversBoard = cache(
  (limit = 4, lookbackDays = 7): SentimentMoversBoard | null => {
    const snapshot = loadSentimentSnapshot();
    if (!snapshot?.players.length) return null;

    const precomputed = snapshot.meta.movers;
    if (
      precomputed &&
      precomputed.lookbackDays === lookbackDays &&
      precomputed.risers.length + precomputed.fallers.length > 0
    ) {
      return {
        season: snapshot.meta.season,
        window: precomputed.window,
        disclaimer: snapshot.meta.disclaimer,
        risers: precomputed.risers.slice(0, limit),
        fallers: precomputed.fallers.slice(0, limit),
      };
    }

    const { risers, fallers } = computeSentimentMovers(snapshot.players, {
      limit,
      lookbackDays,
    });

    if (risers.length === 0 && fallers.length === 0) return null;

    return {
      season: snapshot.meta.season,
      window: snapshot.league?.window ?? `${lookbackDays}d`,
      disclaimer: snapshot.meta.disclaimer,
      risers,
      fallers,
    };
  }
);
