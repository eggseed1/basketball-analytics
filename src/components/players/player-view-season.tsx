"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useQueryNavOptional } from "@/components/continuity/query-nav";

type PlayerViewSeasonValue = {
  season: string;
  setSeason: (season: string) => void;
};

const PlayerViewSeasonContext = createContext<PlayerViewSeasonValue | null>(
  null
);

/**
 * Lets identity (age) track the ranking season slider immediately,
 * without waiting for the URL / RSC round-trip.
 */
export function PlayerViewSeasonProvider({
  initialSeason,
  seasonOptions,
  children,
}: {
  initialSeason: string;
  seasonOptions: string[];
  children: ReactNode;
}) {
  const queryNav = useQueryNavOptional();
  const urlSeason = queryNav?.searchParams.get("season");
  const fromUrl =
    urlSeason && seasonOptions.includes(urlSeason) ? urlSeason : initialSeason;
  const [season, setSeasonState] = useState(fromUrl);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!urlSeason || !seasonOptions.includes(urlSeason)) return;
    if (pendingRef.current) {
      if (urlSeason === pendingRef.current) pendingRef.current = null;
      return;
    }
    setSeasonState(urlSeason);
  }, [urlSeason, seasonOptions]);

  const setSeason = useCallback(
    (next: string) => {
      if (!next || !seasonOptions.includes(next)) return;
      pendingRef.current = next;
      setSeasonState(next);
    },
    [seasonOptions]
  );

  const value = useMemo(
    () => ({ season, setSeason }),
    [season, setSeason]
  );

  return (
    <PlayerViewSeasonContext.Provider value={value}>
      {children}
    </PlayerViewSeasonContext.Provider>
  );
}

export function usePlayerViewSeason(fallback: string): string {
  return useContext(PlayerViewSeasonContext)?.season ?? fallback;
}

export function useSetPlayerViewSeason(): ((season: string) => void) | null {
  return useContext(PlayerViewSeasonContext)?.setSeason ?? null;
}
