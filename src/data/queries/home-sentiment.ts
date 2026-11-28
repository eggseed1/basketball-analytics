import "server-only";

import { cache } from "react";

import { getSentimentSeasonForm } from "@/data/queries/sentiment-season-form";
import { loadSentimentSnapshot } from "@/sentiment/load-curated";
import type {
  SentimentMoverRow,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { computeSentimentMovers } from "@/sentiment/movers";
import { sentimentPlayerLabel } from "@/sentiment/player-label";
import { seasonFormFor } from "@/sentiment/season-form";
import { toneVsProduction, type ToneGapSide } from "@/sentiment/tone-vs-production";

export type { SentimentMoverRow };

export type SentimentMoversBoard = {
  season: string;
  window: string;
  disclaimer: string;
  risers: SentimentMoverRow[];
  fallers: SentimentMoverRow[];
  /** Fan tone ranked against this season's BPM; null until enough players qualify. */
  formGap: ToneGapSide | null;
};

/** Fan posts a player needs this week to appear in the mood-vs-production lists. */
const FORM_GAP_MIN_POSTS = 30;

export const getSentimentMoversBoard = cache(
  async (limit = 4, lookbackDays = 7): Promise<SentimentMoversBoard | null> => {
    const snapshot = await loadSentimentSnapshot();
    if (!snapshot?.players.length) return null;

    const form = await getSentimentSeasonForm(snapshot.meta.season);

    // Always recomputed from the player series. The snapshot's baked movers
    // predate the post-count floors and the rotation-player gate.
    const { risers, fallers } = computeSentimentMovers(snapshot.players, {
      limit,
      lookbackDays,
      // Without season tables there is no role to check; volume floors still apply.
      ...(form.size ? { formFor: (p) => seasonFormFor(p.playerIds, form) } : {}),
    });

    const rows = snapshot.players.flatMap((profile): TrackedPlayerSentimentRow[] => {
      const playerId = profile.playerIds[0];
      if (!playerId) return [];
      const hit = seasonFormFor(profile.playerIds, form);
      return [
        {
          playerId,
          displayName: sentimentPlayerLabel(playerId, profile.displayName),
          teamKey: profile.teamKey,
          window: profile.window,
          fan: profile.fan,
          media: profile.media,
          ...(hit ? { form: hit } : {}),
        },
      ];
    });
    const formGap = form.size
      ? toneVsProduction(rows, "fan", {
          minVolume: FORM_GAP_MIN_POSTS,
          limit: 3,
          metric: "bpm",
        })
      : null;

    const hasGap = Boolean(formGap && (formGap.talkedUp.length || formGap.overlooked.length));
    if (risers.length === 0 && fallers.length === 0 && !hasGap) return null;

    return {
      season: snapshot.meta.season,
      window: `${lookbackDays}d`,
      disclaimer: snapshot.meta.disclaimer,
      risers,
      fallers,
      formGap: hasGap ? formGap : null,
    };
  }
);
