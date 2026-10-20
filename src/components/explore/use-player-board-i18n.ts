"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import type {
  PlayerBoardRate,
  PlayerBoardView,
} from "@/lib/explore-players-display";

export function usePlayerBoardI18n() {
  const t = useTranslations("Players");
  const tCommon = useTranslations("Common");
  const tStandings = useTranslations("Standings");
  const tSearch = useTranslations("Search");

  const viewLabel = useCallback(
    (id: PlayerBoardView): string => {
      if (id === "all") return tCommon("all");
      return t.has(id) ? t(id) : id;
    },
    [t, tCommon]
  );

  const rateLabel = useCallback(
    (id: PlayerBoardRate): string => {
      if (t.has(id)) return t(id);
      return id;
    },
    [t]
  );

  return { t, tCommon, tStandings, tSearch, viewLabel, rateLabel };
}
