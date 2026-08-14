"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import {
  displayImpact,
  displayPlayerName,
  userTeam,
} from "@/gm/lib/selectors";
import {
  formatHeight,
  GRADE_LEGEND,
  gradeMeaning,
  sortScoutBoard,
} from "@/gm/engine/scouting";
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
  if (g.startsWith("A")) return "text-emerald-700";
  if (g.startsWith("B")) return "text-sky-700";
  if (g.startsWith("C")) return "text-amber-700";
  return "text-rose-700";
}

function DraftBody() {
  const league = useGmStore((s) => s.league);
  const draftPlayer = useGmStore((s) => s.draftPlayer);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealFlash, setRevealFlash] = useState<{
    codename: string;
    name: string;
  } | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    if (!revealFlash) return;
    const t = window.setTimeout(() => setRevealFlash(null), 4200);
    return () => window.clearTimeout(t);
  }, [revealFlash]);

  const board = useMemo(() => {
    if (!league) return [] as GmPlayer[];
    const raw = league.draftPool
      .map((id) => league.players.find((p) => p.id === id)!)
      .filter(Boolean);
    return sortScoutBoard(raw);
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

  const team = userTeam(league);
  const scout = team.staff.scout;
  const order = league.lotteryOrder ?? [];
  const pickIndex = league.draftPickIndex ?? 0;
  const onClock = order[pickIndex % Math.max(1, order.length)];
  const yourTurn =
    league.phase === "draft" && (!onClock || onClock === league.userTeamId);
  const selected = board.find((p) => p.id === selectedId) ?? null;
  const lastNews = league.news[0];

  const onDraft = (id: string) => {
    const p = league.players.find((x) => x.id === id);
    if (p?.codename && p.identityRevealed === false) {
      setRevealFlash({ codename: p.codename, name: p.name });
    }
    draftPlayer(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            War room
          </p>
          <h2 className="text-lg font-semibold tracking-tight">
            Scouting board
            {league.phase !== "draft" ? " · preview" : ""}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Style tags until pick night. Only true top-of-board talent gets elite
            codenames - most of the class is role projection, not legend cosplay.
          </p>
          {league.phase === "draft" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Pick #{pickIndex + 1} · On the clock:{" "}
              <span className="font-medium text-foreground">
                {(onClock ?? "?").toUpperCase()}
              </span>
              {yourTurn ? " - your selection" : ""}
            </p>
          ) : null}
          {scout ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Scout: {scout.name} · {expertiseLabel(scout.expertise)} · Eye{" "}
              {scout.eye}/5 · {scout.yearsExperience} yrs - hire/replace in{" "}
              <Link href="/gm/staff" className="underline underline-offset-2">
                Staff
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-amber-800">
              No director of scouting hired - fog is heavy.{" "}
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
            {showLegend ? "Hide" : "What do grades & impact mean?"}
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
                    {" - "}
                    {row.meaning}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-medium text-foreground">Impact number</p>
              <p className="mt-0.5">
                Scouted points per 100 possessions vs average (≈ DARKO-style).{" "}
                <span className="text-foreground">+3.0</span> is star-ish;{" "}
                <span className="text-foreground">0.0</span> is replacement;
                negatives are below replacement. Fogged by your scout’s eye and
                expertise.
              </p>
            </div>
          ) : null}
        </div>
        {league.phase === "draft" || league.phase === "offseason" ? (
          <Button variant="outline" onClick={() => runOffseason()}>
            Finish draft / next season
          </Button>
        ) : null}
      </div>

      {revealFlash ? (
        <div className="sports-card border border-foreground/10 bg-foreground px-4 py-3 text-background">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-background/70">
            Identity reveal
          </p>
          <p className="mt-1 text-[15px] font-semibold">
            <span className="text-background/75">{revealFlash.codename}</span>
            {" → "}
            {revealFlash.name}
          </p>
          <p className="mt-0.5 text-[12px] text-background/70">
            That &ldquo;wait, I know this guy&rdquo; feeling - locked in.
          </p>
        </div>
      ) : null}

      {lastNews &&
      league.phase === "draft" &&
      lastNews.headline.includes("selects") ? (
        <p className="text-[12px] text-muted-foreground">{lastNews.headline}</p>
      ) : null}

      {order.length ? (
        <p className="text-[12px] text-muted-foreground">
          Lottery order:{" "}
          {order
            .slice(0, 14)
            .map((id) => id.toUpperCase())
            .join(" · ")}
          {order.length > 14 ? " · …" : ""}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Big board · scouted upside</span>
            <span className="normal-case tracking-normal text-[10px] font-normal">
              Grade · Impact
            </span>
          </div>
          <ul className="max-h-[min(70vh,640px)] divide-y divide-border overflow-y-auto">
            {board.map((p, i) => {
              const active = p.id === selectedId;
              const upside = p.scoutProfile?.grades.upside;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    )}
                  >
                    <span className="w-6 text-[12px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold tracking-tight">
                        {displayPlayerName(p)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {p.position} · {p.age} ·{" "}
                        {p.scoutProfile?.archetypeLabel ?? "Unknown mold"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-[13px] font-bold tabular-nums",
                        gradeTone(upside)
                      )}
                      title={gradeMeaning(upside)}
                    >
                      {upside ?? "?"}
                    </span>
                    <span
                      className="w-10 text-right text-[12px] tabular-nums text-muted-foreground"
                      title="Scouted impact (pts/100 vs avg)"
                    >
                      {displayImpact(p)}
                    </span>
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

        <ScoutDossier
          player={selected}
          yourTurn={yourTurn}
          onDraft={onDraft}
        />
      </div>
    </div>
  );
}

function ScoutDossier({
  player,
  yourTurn,
  onDraft,
}: {
  player: GmPlayer | null;
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Scout dossier
        </p>
        <h3 className="mt-1 text-[1.35rem] font-bold leading-tight tracking-tight">
          {displayPlayerName(player)}
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {player.position} · Age {player.age}
          {profile?.archetypeLabel ? ` · ${profile.archetypeLabel}` : ""}
        </p>
        <p className="mt-2 rounded-lg bg-secondary/80 px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground">
          True name sealed until the pick is in.
        </p>
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
          label="Impact"
          value={displayImpact(player)}
          hint="Scouted pts/100 vs avg"
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

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                    "text-[13px] font-bold tabular-nums",
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
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Comp whispers
          </p>
          <p className="text-[13px] leading-snug">
            {profile.comps.join(" · ")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Style DNA - not a confirmed identity.
          </p>
        </div>
      ) : null}

      {profile?.summary ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Scout note
          </p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {profile.summary}
          </p>
        </div>
      ) : null}

      {profile?.medicalNote ? (
        <div className="rounded-lg border border-border/80 bg-secondary/40 px-2.5 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
          {player.codename
            ? "Study the tape - identity stays sealed until pick night."
            : "Waiting on the clock."}
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
      <p className="text-[13px] font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="text-[10px] leading-tight text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
