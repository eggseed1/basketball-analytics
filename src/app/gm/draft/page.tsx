"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { GmShell } from "@/gm/ui/gm-shell";
import { GmDraftNight } from "@/gm/ui/gm-draft-night";
import { useGmStore } from "@/gm/state/gm-store";
import {
  scoutedOverall,
  displayPlayerName,
  displayPlayerSubtitle,
  userTeam,
} from "@/gm/lib/selectors";
import {
  formatHeight,
  GRADE_LEGEND,
  gradeMeaning,
  scoutPotentialView,
  trajectoryRead,
} from "@/gm/engine/scouting";
import { orderedBoard, rosterNeeds } from "@/gm/engine/draft-room";
import { expertiseLabel } from "@/gm/seed/scouts";
import type { GmPlayer, ScoutLetterGrade } from "@/gm/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function GmDraftPage() {
  return (
    <GmShell>
      <DraftBody />
    </GmShell>
  );
}

function gradeTone(g: ScoutLetterGrade | null | undefined): string {
  if (!g) return "text-muted-foreground";
  if (g.startsWith("A")) return "text-delta-up";
  if (g.startsWith("B")) return "text-sky-300";
  if (g.startsWith("C")) return "text-amber-300";
  return "text-delta-down";
}

function DraftBody() {
  const league = useGmStore((s) => s.league);
  const draftPlayer = useGmStore((s) => s.draftPlayer);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const moveDraftBoard = useGmStore((s) => s.moveDraftBoard);
  const resetDraftBoard = useGmStore((s) => s.resetDraftBoard);
  const runCombine = useGmStore((s) => s.runCombine);
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
    return <GmDraftNight />;
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
            Scouting board · preview
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
            Rank this class yourself. Generated names stay on the card. Scout
            molds and builds stay with them. The combine locks height,
            athleticism, and the medical file. Potential stays a range.
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
              <p className="mt-2 font-medium text-foreground">Overall</p>
              <p className="mt-0.5">
                Your staff’s read of the overall, on the same 50 to 99 scale as
                the league. An 80 is a solid rotation player. The true sheet
                stays hidden. The number moves with your scout’s eye.
              </p>
            </div>
          ) : null}
        </div>
        {league.phase === "offseason" ? (
          <Button variant="outline" onClick={() => runOffseason()}>
            Start next season
          </Button>
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
          disabled={!league.userDraftBoard?.length}
          onClick={() => resetDraftBoard()}
        >
          Reset to the scout board
        </Button>
        <p className="text-[12px] text-muted-foreground">
          Holes: {needs.slice(0, 2).join(", ")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Your board</span>
            <span className="normal-case tracking-normal text-[10px] font-normal">
              Grade · OVR
            </span>
          </div>
          <ul className="max-h-[min(70vh,640px)] divide-y divide-border overflow-y-auto">
            {board.map((p, i) => {
              const active = p.id === selectedId;
              const upside = p.scoutProfile?.grades.upside;
              const read = scoutPotentialView(p, scout);
              const need = needs[0];
              return (
                <li key={p.id}>
                  <div
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2.5",
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    )}
                  >
                    <span className="flex w-14 shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        onClick={() => moveDraftBoard(p.id, "top")}
                      >
                        Top
                      </button>
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                          aria-label={`Move ${displayPlayerName(p)} up`}
                          onClick={() => moveDraftBoard(p.id, "up")}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                          aria-label={`Move ${displayPlayerName(p)} down`}
                          onClick={() => moveDraftBoard(p.id, "down")}
                        >
                          Down
                        </button>
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="w-6 text-[12px] tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold tracking-tight">
                          {displayPlayerName(p)}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {p.position} · {p.age} · {read.low}-{read.high} ·{" "}
                          {displayPlayerSubtitle(p) ??
                            p.scoutProfile?.archetypeLabel ??
                            "Unknown mold"}
                          {p.position === need ? " · Fits the hole" : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "text-[14px] font-bold tabular-nums",
                          gradeTone(upside)
                        )}
                        title={gradeMeaning(upside)}
                      >
                        {upside ?? "?"}
                      </span>
                      <span
                        className="w-10 text-right text-[12px] tabular-nums text-muted-foreground"
                        title="Scouted overall"
                      >
                        {scoutedOverall(p)}
                      </span>
                    </button>
                  </div>
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

        <ScoutDossier
          player={selected}
          scout={scout}
          yourTurn={yourTurn}
          onDraft={onDraft}
        />
      </div>
    </div>
  );
}

function ScoutDossier({
  player,
  scout,
  yourTurn,
  onDraft,
}: {
  player: GmPlayer | null;
  scout: ReturnType<typeof userTeam>["staff"]["scout"];
  yourTurn: boolean;
  onDraft: (id: string) => void;
}) {
  if (!player) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
        Select a prospect to open the scouting dossier.
      </div>
    );
  }

  const profile = player.scoutProfile;
  const potential = scoutPotentialView(player, scout);
  const grades = profile?.grades;
  const gradeRows: {
    key: string;
    label: string;
    value: ScoutLetterGrade | null | undefined;
  }[] = [
    { key: "upside", label: "Upside", value: grades?.upside },
    { key: "creation", label: "Creation", value: grades?.creation },
    { key: "shooting", label: "Shooting", value: grades?.shooting },
    { key: "athleticism", label: "Athleticism", value: grades?.athleticism },
    { key: "defense", label: "Defense", value: grades?.defense },
    { key: "feel", label: "Feel", value: grades?.feel },
  ];

  return (
    <aside className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div>
        <h3 className="text-[1.35rem] font-bold leading-tight tracking-tight">
          {displayPlayerName(player)}
        </h3>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {player.position} · Age {player.age}
          {profile?.archetypeLabel ? ` · ${profile.archetypeLabel}` : ""}
        </p>
        {displayPlayerSubtitle(player) ? (
          <p className="mt-2 rounded-lg bg-secondary/80 px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground">
            Scout mold {displayPlayerSubtitle(player)}. Grades and the build stay
            on this card.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg bg-secondary/80 px-2.5 py-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Scouted potential
        </p>
        <p className="mt-1 text-[18px] font-bold tabular-nums">
          {potential.low}-{potential.high}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {potential.comment}
        </p>
        <p className="mt-1 text-[13px] text-foreground">{trajectoryRead(player, scout)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <Metric
          label="Height"
          value={formatHeight(profile?.heightInEstimate)}
        />
        <Metric
          label="Weight"
          value={
            profile?.weightLbsEstimate != null
              ? `${profile.weightLbsEstimate} lb`
              : "-"
          }
        />
        <Metric
          label="OVR"
          value={scoutedOverall(player)}
          hint="Scouted overall"
        />
        <Metric
          label="Confidence"
          value={
            profile ? `${Math.round(profile.confidence * 100)}%` : "-"
          }
        />
        <Metric
          label="Board slot"
          value={
            profile?.boardRankHint != null
              ? `#${profile.boardRankHint}`
              : "Foggy"
          }
        />
        <Metric
          label="Uncertainty"
          value={`${Math.round(player.scouted.uncertainty * 100)}%`}
        />
      </div>

      {profile?.combine ? (
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <Metric label="Wingspan" value={formatHeight(profile.combine.wingspanIn)} />
          <Metric label="Vertical" value={`${profile.combine.verticalIn} in`} />
          <Metric label="Sprint" value={`${profile.combine.sprint.toFixed(2)}s`} />
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Grades
        </p>
        <ul className="grid grid-cols-2 gap-1.5">
          {gradeRows.map((row) => (
            <li
              key={row.key}
              className="flex flex-col rounded-lg bg-secondary/70 px-2.5 py-1.5"
              title={gradeMeaning(row.value)}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">
                  {row.label}
                </span>
                <span
                  className={cn(
                    "text-[14px] font-bold tabular-nums",
                    gradeTone(row.value)
                  )}
                >
                  {row.value ?? "?"}
                </span>
              </div>
              <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                {gradeMeaning(row.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {profile?.comps?.length ? (
        <div>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Comp whispers
          </p>
          <p className="text-[14px] leading-snug">
            {profile.comps.join(" · ")}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Style DNA, not a confirmed identity.
          </p>
        </div>
      ) : null}

      {profile?.summary ? (
        <div>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Scout note
          </p>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            {profile.summary}
          </p>
        </div>
      ) : null}

      {profile?.medicalNote ? (
        <div className="rounded-lg border border-border/80 bg-secondary/40 px-2.5 py-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Medical
          </p>
          <p className="mt-0.5 text-[12px] leading-snug">{profile.medicalNote}</p>
        </div>
      ) : null}

      {yourTurn ? (
        <Button className="mt-1 w-full" onClick={() => onDraft(player.id)}>
          Draft {displayPlayerName(player)}
        </Button>
      ) : (
        <p className="text-center text-[12px] text-muted-foreground">
          Rank him now. Draft night opens the war room.
        </p>
      )}
    </aside>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-secondary/70 px-2.5 py-1.5" title={hint}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="text-[14px] font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="text-[10px] leading-tight text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
