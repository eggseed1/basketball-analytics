import "server-only";

import { cache } from "react";

import { getBundledSeasonFormRows } from "@/data/runtime/bref-advanced-snapshot";
import { buildSeasonFormIndex, type SeasonForm } from "@/sentiment/season-form";

/** This season's BPM, minutes and games by player id. Empty when the tables are missing. */
export const getSentimentSeasonForm = cache(
  async (season: string): Promise<Map<string, SeasonForm>> => {
    try {
      return buildSeasonFormIndex(season, await getBundledSeasonFormRows(season));
    } catch {
      return new Map();
    }
  }
);
