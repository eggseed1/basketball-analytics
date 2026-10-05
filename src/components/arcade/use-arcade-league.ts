"use client";

import { useEffect, useState } from "react";

import { loadArcadeLeague, type ArcadeLeague } from "@/arcade/league";

export function useArcadeLeague(): { league: ArcadeLeague | null; failed: boolean; retry: () => void } {
  const [league, setLeague] = useState<ArcadeLeague | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadArcadeLeague().then(
      (data) => live && setLeague(data),
      () => live && setFailed(true)
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return {
    league,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}
