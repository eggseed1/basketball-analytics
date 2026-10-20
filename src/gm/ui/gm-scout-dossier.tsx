"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  formatHeight,
  GRADE_LEGEND,
  gradeMeaning,
  scoutPotentialView,
  trajectoryRead,
} from "@/gm/engine/scouting";
import { displayPlayerName, displayPlayerSubtitle } from "@/gm/lib/selectors";
import type { GmPlayer, ScoutLetterGrade } from "@/gm/types";
import { ensureScoutKnack, type GmScout } from "@/gm/seed/scouts";
import {
  knackMatchesPosition,
  playerPipeline,
  scoutKnackLabel,
} from "@/gm/seed/staff-knacks";
import { cn } from "@/lib/utils";

function gradeTone(g: ScoutLetterGrade | null | undefined): string {
  if (!g) return "text-muted-foreground";
  if (g.startsWith("A")) return "text-delta-up";
  if (g.startsWith("B")) return "text-sky-300";
  if (g.startsWith("C")) return "text-amber-300";
  return "text-delta-down";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/70 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function fogBlanks(player: GmPlayer): number {
  const grades = player.scoutProfile?.grades;
  if (!grades) return 6;
  return (
    ["athleticism", "shooting", "creation", "defense", "feel", "upside"] as const
  ).filter((key) => grades[key] == null).length;
}

/** Why the room might put more tape on this prospect. */
export function scoutWhyLine(
  player: GmPlayer,
  opts?: { needPos?: string | null; scout?: GmScout | null }
): string {
  const profile = player.scoutProfile;
  const blanks = fogBlanks(player);
  const fog = Math.round((player.scouted.uncertainty ?? 0.8) * 100);
  const bits: string[] = [];
  if (opts?.needPos && player.position === opts.needPos) {
    bits.push(`Fits your ${opts.needPos} hole`);
  }
  if (blanks >= 3) bits.push(`${blanks} grades still fogged`);
  else if (fog >= 55) bits.push(`Board confidence is thin (${fog}% fog)`);
  if (profile?.grades?.upside && ["A+", "A", "A-"].includes(profile.grades.upside)) {
    bits.push(`Upside graded ${profile.grades.upside}`);
  } else if (profile?.grades?.upside == null) {
    bits.push("Upside still sealed");
  }
  if (opts?.scout) {
    const scout = ensureScoutKnack(opts.scout);
    if (knackMatchesPosition(scout.knack, player.position)) {
      bits.push(`${scout.name.split(" ")[0]} · ${scoutKnackLabel(scout.knack)}`);
    } else if (scout.knack === "euro_radar" && playerPipeline(player) === "international") {
      bits.push(`${scout.name.split(" ")[0]} · Euro radar hit`);
    } else if (opts.scout.expertise === "guards" && (player.position === "PG" || player.position === "SG")) {
      bits.push(`${opts.scout.name.split(" ")[0]} knows guards`);
    } else if (opts.scout.expertise === "bigs" && (player.position === "PF" || player.position === "C")) {
      bits.push(`${opts.scout.name.split(" ")[0]} knows bigs`);
    } else if (opts.scout.expertise === "wings" && (player.position === "SF" || player.position === "SG")) {
      bits.push(`${opts.scout.name.split(" ")[0]} knows wings`);
    }
  }
  return bits.slice(0, 2).join(" · ") || "More tape would tighten the read";
}

type DossierProps = {
  player: GmPlayer | null;
  scout: GmScout | null | undefined;
  /** Optional action under the file (focus, draft, etc.). */
  action?: { label: string; onClick: () => void; disabled?: boolean } | null;
  footer?: ReactNode;
  compact?: boolean;
};

/** Scouting file used on the draft board and the monthly focus desk. */
export function GmScoutDossier({
  player,
  scout,
  action,
  footer,
  compact,
}: DossierProps) {
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
    { key: "athleticism", label: "Athleticism", value: grades?.athleticism },
    { key: "shooting", label: "Shooting", value: grades?.shooting },
    { key: "creation", label: "Creation", value: grades?.creation },
    { key: "defense", label: "Defense", value: grades?.defense },
    { key: "feel", label: "Feel", value: grades?.feel },
    { key: "upside", label: "Upside", value: grades?.upside },
  ];

  return (
    <aside
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border bg-card p-4",
        compact && "max-h-[min(70vh,560px)] overflow-y-auto"
      )}
    >
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
            Scout mold {displayPlayerSubtitle(player)}. Grades can miss.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg bg-secondary/80 px-2.5 py-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          NBA comps
        </p>
        <p className="mt-1 text-[14px] font-semibold leading-snug">
          Ceiling{" "}
          <span className="text-foreground">
            {profile?.compCeiling ?? profile?.comps?.[0] ?? "Foggy"}
          </span>
        </p>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug">
          Floor{" "}
          <span className="text-foreground">
            {profile?.compFloor ?? profile?.comps?.[1] ?? "Foggy"}
          </span>
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {potential.comment}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {trajectoryRead(player, scout)}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Scouted range {potential.low}–{potential.high}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <Metric label="Height" value={formatHeight(profile?.heightInEstimate)} />
        <Metric
          label="Weight"
          value={
            profile?.weightLbsEstimate != null
              ? `${profile.weightLbsEstimate} lb`
              : "-"
          }
        />
        <Metric
          label="Confidence"
          value={profile ? `${Math.round(profile.confidence * 100)}%` : "-"}
        />
        <Metric
          label="Board slot"
          value={
            profile?.boardRankHint != null ? `#${profile.boardRankHint}` : "Foggy"
          }
        />
      </div>

      {profile?.combine ? (
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <Metric
            label="Wingspan"
            value={formatHeight(profile.combine.wingspanIn)}
          />
          <Metric label="Vertical" value={`${profile.combine.verticalIn} in`} />
          <Metric
            label="Sprint"
            value={`${profile.combine.sprint.toFixed(2)}s`}
          />
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

      {action ? (
        <Button
          className="mt-1 w-full"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
      {footer}
    </aside>
  );
}

export { gradeTone, GRADE_LEGEND };
