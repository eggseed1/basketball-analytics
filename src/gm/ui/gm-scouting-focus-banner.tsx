"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { rosterNeeds } from "@/gm/engine/draft-room";
import { SCOUTING_FOCUS_SLOTS } from "@/gm/engine/scouting-focus";
import { displayPlayerName, displayPlayerSubtitle, userTeam } from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import {
  fogBlanks,
  GmScoutDossier,
  gradeTone,
  scoutWhyLine,
} from "@/gm/ui/gm-scout-dossier";
import type { GmPlayer, GmPosition } from "@/gm/types";
import { cn } from "@/lib/utils";

const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

/** Monthly scouting desk: dossiers first, then focus assignment. */
export function GmScoutingFocusBanner() {
  const league = useGmStore((s) => s.league);
  const applyScoutingFocus = useGmStore((s) => s.applyScoutingFocus);
  const autoScoutingFocus = useGmStore((s) => s.autoScoutingFocus);
  const skipScoutingFocus = useGmStore((s) => s.skipScoutingFocus);
  const setAutomation = useGmStore((s) => s.setAutomation);
  const prompt = league?.scoutingFocusPrompt;
  const [picked, setPicked] = useState<string[]>([]);
  const [positionFocus, setPositionFocus] = useState<GmPosition | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setPicked([]);
    setPositionFocus(null);
    setSelectedId(null);
  }, [prompt?.id]);

  const candidates = useMemo(() => {
    if (!league || !prompt) return [] as GmPlayer[];
    const ids = [
      ...prompt.suggestedPlayerIds,
      ...league.draftPool.filter((id) => !prompt.suggestedPlayerIds.includes(id)),
    ].slice(0, 16);
    return ids
      .map((id) => league.players.find((player) => player.id === id))
      .filter((player): player is GmPlayer => Boolean(player));
  }, [league, prompt]);

  useEffect(() => {
    if (!candidates.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !candidates.some((player) => player.id === selectedId)) {
      setSelectedId(candidates[0]!.id);
    }
  }, [candidates, selectedId]);

  if (!league || !prompt) return null;

  const team = userTeam(league);
  const scout = team.staff.scout;
  const needs = rosterNeeds(team, league.players);
  const needPos = needs[0] ?? null;
  const slots = prompt.slots || SCOUTING_FOCUS_SLOTS;
  const selected = candidates.find((player) => player.id === selectedId) ?? null;
  const autoOn = league.automation?.autoScout ?? false;

  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((entry) => entry !== id);
      if (prev.length >= slots) return prev;
      return [...prev, id];
    });
  };

  return (
    <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-2xl">
            <p className="font-semibold">{prompt.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{prompt.body}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {picked.length}/{slots} focuses
              {needPos ? ` · roster hole: ${needPos}` : ""}
              {scout ? ` · ${scout.name} on staff` : " · no scout hired"}
              . Sim stays paused until you set focus, autoscout, or skip.
            </p>
          </div>
          <label className="flex max-w-xs items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoOn}
              disabled={!scout}
              onChange={(event) =>
                setAutomation({ autoScout: event.target.checked })
              }
            />
            <span>
              <span className="font-medium text-foreground">Auto scout</span>
              <span className="mt-0.5 block">
                {scout
                  ? `Off by default. Opt in and ${scout.name.split(" ")[0]} handles this month and later ones.`
                  : "Hire a scout on Staff to enable."}
              </span>
            </span>
          </label>
        </div>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Prospects</span>
              <span className="normal-case tracking-normal text-[10px] font-normal">
                Upside · Fog · Why look
              </span>
            </div>
            <ul className="max-h-[min(52vh,420px)] divide-y divide-border overflow-y-auto">
              {candidates.map((player) => {
                const active = player.id === selectedId;
                const focused = picked.includes(player.id);
                const upside = player.scoutProfile?.grades.upside;
                const blanks = fogBlanks(player);
                const fog = Math.round((player.scouted.uncertainty ?? 0.8) * 100);
                const why = scoutWhyLine(player, { needPos, scout });
                return (
                  <li key={player.id}>
                    <div
                      className={cn(
                        "flex w-full items-stretch gap-0",
                        active ? "bg-secondary" : "hover:bg-secondary/50"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(player.id)}
                        className="min-w-0 flex-1 px-3 py-2.5 text-left"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-semibold tracking-tight">
                              {displayPlayerName(player)}
                            </span>
                            <span className="block text-[12px] text-muted-foreground">
                              {player.position} · {player.age}
                              {player.scoutProfile?.archetypeLabel
                                ? ` · ${player.scoutProfile.archetypeLabel}`
                                : ""}
                              {displayPlayerSubtitle(player)
                                ? ` · ${displayPlayerSubtitle(player)}`
                                : ""}
                            </span>
                            <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                              {why}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5 text-[12px]">
                            <span
                              className={cn(
                                "font-bold tabular-nums",
                                gradeTone(upside)
                              )}
                              title="Scouted upside"
                            >
                              {upside ?? "?"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {blanks} blank · {fog}% fog
                            </span>
                            {player.scoutProfile?.boardRankHint != null ? (
                              <span className="text-[10px] text-muted-foreground">
                                Board #{player.scoutProfile.boardRankHint}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                          {(
                            [
                              player.scoutProfile?.grades.athleticism,
                              player.scoutProfile?.grades.shooting,
                              player.scoutProfile?.grades.creation,
                              player.scoutProfile?.grades.defense,
                            ] as const
                          ).map((g, i) => (
                            <span
                              key={i}
                              className={cn(
                                "rounded border border-border px-1 font-semibold tabular-nums",
                                gradeTone(g)
                              )}
                            >
                              {g ?? "?"}
                            </span>
                          ))}
                          {player.scoutProfile?.compCeiling ? (
                            <span className="truncate">
                              Ceil {player.scoutProfile.compCeiling}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(player.id)}
                        className={cn(
                          "shrink-0 border-l border-border px-3 text-[12px] font-semibold",
                          focused
                            ? "bg-emerald-500/25 text-foreground"
                            : "text-muted-foreground hover:bg-secondary"
                        )}
                      >
                        {focused ? "Focused" : "Focus"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <GmScoutDossier
            player={selected}
            scout={scout}
            compact
            action={
              selected
                ? {
                    label: picked.includes(selected.id)
                      ? "Remove from focus"
                      : picked.length >= slots
                        ? "Focus slots full"
                        : "Add to this month's focus",
                    disabled:
                      !picked.includes(selected.id) && picked.length >= slots,
                    onClick: () => toggle(selected.id),
                  }
                : null
            }
            footer={
              selected ? (
                <p className="text-center text-[11px] text-muted-foreground">
                  Your focus gets more looks than handing it to the scout.
                </p>
              ) : null
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Position leftover</span>
          <button
            type="button"
            onClick={() => setPositionFocus(null)}
            className={cn(
              "rounded-md border px-2 py-1 text-sm",
              positionFocus == null
                ? "border-emerald-400 bg-emerald-500/25"
                : "border-border bg-background hover:bg-secondary"
            )}
          >
            None
          </button>
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setPositionFocus(pos)}
              className={cn(
                "rounded-md border px-2 py-1 text-sm",
                positionFocus === pos
                  ? "border-emerald-400 bg-emerald-500/25"
                  : "border-border bg-background hover:bg-secondary",
                needPos === pos && "ring-1 ring-emerald-400/50"
              )}
            >
              {pos}
              {needPos === pos ? " · hole" : ""}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={picked.length === 0 && positionFocus == null}
            onClick={() => applyScoutingFocus(picked, positionFocus)}
          >
            Set my focuses
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!scout}
            onClick={() => autoScoutingFocus()}
          >
            {scout
              ? `Let ${scout.name.split(" ")[0]} decide once`
              : "Hire a scout first"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => skipScoutingFocus()}>
            Skip this month
          </Button>
          <Link
            href="/gm/draft"
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary"
          >
            Full draft board
          </Link>
        </div>
      </div>
    </section>
  );
}
