"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { StatComp } from "@/lib/player-stat-comps";
import { cn } from "@/lib/utils";

export type SimilarPlayerMode = {
  id: string;
  label: string;
  leagueComps: StatComp[];
  historicalComps: StatComp[];
};

/**
 * Context section — similar players from existing percentile comps.
 * Mode chips switch which metric’s nearest comps are shown (no new algorithm).
 */
export function PlayerContextStrip({
  modes,
  defaultModeId,
  compareHref,
}: {
  modes: SimilarPlayerMode[];
  /** Prefer this mode when present (usually the page headline metric). */
  defaultModeId?: string;
  compareHref: string;
}) {
  const available = useMemo(
    () =>
      modes.filter(
        (m) => m.leagueComps.length > 0 || m.historicalComps.length > 0
      ),
    [modes]
  );

  const initialId =
    (defaultModeId && available.some((m) => m.id === defaultModeId)
      ? defaultModeId
      : available[0]?.id) ?? "";

  const [modeId, setModeId] = useState(initialId);
  const active =
    available.find((m) => m.id === modeId) ?? available[0] ?? null;

  if (!active) {
    return (
      <p className="text-[14px] text-muted-foreground">
        Similar-player comps are not available for this season row.
      </p>
    );
  }

  const league = active.leagueComps.slice(0, 4);
  const historical = active.historicalComps.slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      {available.length > 1 ? (
        <div
          role="tablist"
          aria-label="Similar-player metric"
          className="flex flex-wrap gap-1"
        >
          {available.map((m) => {
            const selected = m.id === active.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setModeId(m.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  selected
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {league.length ? (
        <CompList
          title={`Similar this season · ${active.label}`}
          comps={league}
        />
      ) : null}
      {historical.length ? (
        <CompList
          title={`Similar historically · ${active.label}`}
          comps={historical}
        />
      ) : null}
      {!league.length && !historical.length ? (
        <p className="text-[14px] text-muted-foreground">
          No nearest comps for {active.label} on this season row.
        </p>
      ) : null}
      <p className="text-[14px] text-muted-foreground">
        Similarity is nearest on the selected metric only — not a multi-metric
        profile match.{" "}
        <Link
          href={compareHref}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Open full player compare →
        </Link>
      </p>
    </div>
  );
}

function CompList({ title, comps }: { title: string; comps: StatComp[] }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {comps.map((c) => (
          <li
            key={`${c.playerId}-${c.season}-${c.value}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/70 frost-surface px-3 py-2 text-[14px]"
          >
            <PlayerIdentity
              playerId={c.playerId}
              name={c.playerName}
              teamKey={c.teamKey}
              teamLabel={c.teamKey}
              season={c.season}
              variant="compact"
              className="min-w-0 flex-1"
              nameClassName="w-full gap-2 no-underline hover:underline"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                {c.teamKey ? <TeamLogo teamKey={c.teamKey} size="2xs" /> : null}
                <span className="truncate font-semibold">{c.playerName}</span>
                <span className="shrink-0 text-muted-foreground">{c.season}</span>
              </span>
            </PlayerIdentity>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {c.display}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
