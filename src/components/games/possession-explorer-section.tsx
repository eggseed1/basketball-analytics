"use client";

import { useEffect, useState } from "react";

import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { PossessionExplorer } from "@/components/games/possession-explorer";
import type { PossessionExplorerModel } from "@/lib/possession-explorer";

/**
 * Closed-by-default Possession Explorer. Fetches the view model only after the
 * user opens the section so the game HTML stream never waits on reconstruction.
 */
export function PossessionExplorerSection({
  gameId,
  awayTeamKey,
  homeTeamKey,
  title,
  blurb,
}: {
  gameId: string;
  awayTeamKey?: string;
  homeTeamKey?: string;
  title: string;
  blurb: string;
}) {
  const [opened, setOpened] = useState(false);
  const [model, setModel] = useState<PossessionExplorerModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || model || error) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/games/${encodeURIComponent(gameId)}/possessions`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data?: PossessionExplorerModel };
        if (cancelled) return;
        if (!body.data) throw new Error("Missing possession model");
        setModel(body.data);
      } catch {
        if (!cancelled) {
          setError("Possession sequences could not be loaded for this game.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, model, error, gameId]);

  const loading = opened && !model && !error;
  const washAway =
    model?.status === "available"
      ? model.teams.away.canonicalTeamId
      : awayTeamKey ?? "away";
  const washHome =
    model?.status === "available"
      ? model.teams.home.canonicalTeamId
      : homeTeamKey ?? "home";

  return (
    <details
      className="group sports-card overflow-hidden"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setOpened(true);
          setError(null);
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col">
          <span className="text-[17px] font-bold tracking-tight">{title}</span>
          <span className="text-[13px] text-muted-foreground">{blurb}</span>
        </span>
        <span aria-hidden className="text-[18px] text-muted-foreground transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="border-t border-border/60 p-3 sm:p-4">
        {!opened ? null : error ? (
          <p className="text-[13px] text-muted-foreground">{error}</p>
        ) : model ? (
          <MatchupWashCard
            awayTeamKey={washAway}
            homeTeamKey={washHome}
            intensity="subtle"
            className="flex flex-col gap-4 p-4 sm:p-5"
          >
            <PossessionExplorer model={model} />
          </MatchupWashCard>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {loading ? "Loading possession sequences…" : "Open to load possessions."}
          </p>
        )}
      </div>
    </details>
  );
}
