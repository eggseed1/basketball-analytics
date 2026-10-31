"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmDraftNight } from "@/gm/ui/gm-draft-night";
import { GmDraftResults } from "@/gm/ui/gm-draft-results";
import { useGmStore } from "@/gm/state/gm-store";
import {
  displayPlayerName,
  displayPlayerSubtitle,
  userTeam,
} from "@/gm/lib/selectors";
import { GRADE_LEGEND, gradeMeaning } from "@/gm/engine/scouting";
import {
  isDraftComplete,
  orderedBoard,
  rosterNeeds,
  shouldShowDraftResults,
} from "@/gm/engine/draft-room";
import { expertiseLabel } from "@/gm/seed/scouts";
import type { GmPlayer } from "@/gm/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GmScoutDossier, gradeTone } from "@/gm/ui/gm-scout-dossier";

export default function GmDraftPage() {
  return (
    <GmShell>
      <DraftBody />
    </GmShell>
  );
}

function DraftBody() {
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  const draftPlayer = useGmStore((s) => s.draftPlayer);
  const resetDraftBoard = useGmStore((s) => s.resetDraftBoard);
  const runCombine = useGmStore((s) => s.runCombine);
  const scoutLook = useGmStore((s) => s.scoutLook);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  const board = useMemo(() => {
    if (!league) return [] as GmPlayer[];
    return orderedBoard(league, league.players);
  }, [league]);

  useEffect(() => {
    if (!board.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !board.some((p) => p.id === selectedId)) {
      setSelectedId(board[0]!.id);
    }
  }, [board, selectedId]);

  if (!league) return null;

  if (league.phase === "draft") {
    if (isDraftComplete(league)) {
      return <GmDraftResults league={league} />;
    }
    return <GmDraftNight />;
  }

  if (shouldShowDraftResults(league)) {
    return <GmDraftResults league={league} />;
  }

  const team = userTeam(league);
  const needs = rosterNeeds(team, league.players);
  const scout = team.staff.scout;
  const yourTurn = false;
  const selected = board.find((p) => p.id === selectedId) ?? null;

  const onDraft = (id: string) => {
    draftPlayer(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("draftTitle")}
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
            Overall and development traits stay sealed until the pick. You draft
            off fogged grades and ceiling/floor comps. A sharper scout is less
            wrong. Hitting an X-Factor or Superstar is the jackpot.
          </p>
          {scout ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Scout: {scout.name} · {expertiseLabel(scout.expertise)} · Eye{" "}
              {scout.eye}/5 · {scout.yearsExperience} yrs · hire/replace in{" "}
              <Link href="/gm/staff" className="underline underline-offset-2">
                Staff
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-amber-300">
              No director of scouting hired, so fog is heavy.{" "}
              <Link href="/gm/staff" className="underline underline-offset-2">
                Hire a scout
              </Link>
            </p>
          )}
          <button
            type="button"
            className="mt-2 text-[12px] font-medium text-foreground underline underline-offset-2"
            onClick={() => setShowLegend((v) => !v)}
          >
            {showLegend ? "Hide" : "What do grades and overalls mean?"}
          </button>
          {showLegend ? (
            <div className="mt-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Letter grades</p>
              <p className="mt-0.5">
                Projected NBA tool vs an average rotation player (not MLB 20-80).
                Upside is the overall projection; other rows are skill tools.
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {GRADE_LEGEND.map((row) => (
                  <li key={row.grade}>
                    <span className="font-medium text-foreground">{row.grade}</span>
                    {": "}
                    {row.meaning}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-medium text-foreground">Hidden until pick</p>
              <p className="mt-0.5">
                True overall and the Madden-style development trait (Normal
                through X-Factor) unlock when the selection is made. Grades on
                this board can be off; hire a better scout to tighten them.
              </p>
            </div>
          ) : null}
        </div>
        {league.phase === "offseason" ? (
          <Button variant="outline" asChild><Link href="/gm/offseason">Continue at season hub</Link></Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={!league.draftPool.length || league.combineDone}
          onClick={() => runCombine()}
        >
          {league.combineDone ? "Combine is in" : "Run the combine"}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedId || !league.draftPool.includes(selectedId)}
          onClick={() => selectedId && scoutLook(selectedId)}
        >
          Scout look
        </Button>
        <Button
          variant="outline"
          disabled={!league.userDraftBoard?.length}
          onClick={() => resetDraftBoard()}
        >
          Reset to the scout board
        </Button>
        <p className="text-[12px] text-muted-foreground">
          Holes: {needs.slice(0, 2).join(", ")}
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="self-start overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Your board</span>
            <span className="normal-case tracking-normal text-[10px] font-normal">
              Ath · Shot · Create · Def
            </span>
          </div>
          <ul className="max-h-[min(70vh,640px)] divide-y divide-border overflow-y-auto">
            {board.map((p, i) => {
              const active = p.id === selectedId;
              const grades = p.scoutProfile?.grades;
              const need = needs[0];
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    )}
                  >
                    <span className="w-6 shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold tracking-tight">
                        {displayPlayerName(p)}
                      </span>
                      <span className="block text-[12px] text-muted-foreground">
                        {p.position} · {p.age} ·{" "}
                        {displayPlayerSubtitle(p) ??
                          p.scoutProfile?.archetypeLabel ??
                          "Unknown mold"}
                        {p.position === need ? " · Fits the hole" : ""}
                      </span>
                    </span>
                    {(
                      [
                        grades?.athleticism,
                        grades?.shooting,
                        grades?.creation,
                        grades?.defense,
                      ] as const
                    ).map((g, gi) => (
                      <span
                        key={gi}
                        className={cn(
                          "w-7 text-center text-[12px] font-bold tabular-nums",
                          gradeTone(g)
                        )}
                        title={gradeMeaning(g)}
                      >
                        {g ?? "?"}
                      </span>
                    ))}
                  </button>
                </li>
              );
            })}
            {!board.length ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                Draft pool empty.
              </li>
            ) : null}
          </ul>
        </div>

        <GmScoutDossier
          player={selected}
          scout={scout}
          action={
            yourTurn && selected
              ? {
                  label: `Draft ${displayPlayerName(selected)}`,
                  onClick: () => onDraft(selected.id),
                }
              : null
          }
          footer={
            !yourTurn ? (
              <p className="text-center text-[12px] text-muted-foreground">
                Rank him now. Draft night opens the war room.
              </p>
            ) : null
          }
        />
      </div>
    </div>
  );
}
