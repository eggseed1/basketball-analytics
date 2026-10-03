"use client";

import { useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import type {
  TeamSchedulePhase,
  TeamScheduleRow,
} from "@/lib/team-schedule";
import { cn } from "@/lib/utils";

type PhaseFilter = "all" | TeamSchedulePhase;
type SideFilter = "all" | "home" | "away";

const PHASE_LABEL: Record<TeamSchedulePhase, string> = {
  preseason: "Preseason",
  regular: "Regular season",
  postseason: "Postseason",
};

const STATUS_LABEL: Partial<Record<TeamScheduleRow["status"], string>> = {
  postponed: "Postponed",
  cancelled: "Cancelled",
  suspended: "Suspended",
  delayed: "Delayed",
  in_progress: "Live",
  halftime: "Halftime",
};

function gameHref(row: TeamScheduleRow): string {
  return `/games/${encodeURIComponent(row.id)}?season=${encodeURIComponent(row.season)}`;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active
          ? "glass-pill-active"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Tag({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent";
}) {
  return (
    <span
      className={cn(
        type.micro,
        "rounded px-1.5 py-px font-bold uppercase tracking-wide",
        tone === "accent"
          ? "bg-foreground text-background"
          : "bg-foreground/[0.07] text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function RowOutcome({ row }: { row: TeamScheduleRow }) {
  const statusLabel = STATUS_LABEL[row.status];
  if (row.result && row.teamScore != null && row.oppScore != null) {
    return (
      <span className="tabular-nums">
        <span
          className={cn(
            "font-bold",
            row.result === "W" ? "text-positive" : "text-negative"
          )}
        >
          {row.result}
        </span>{" "}
        <span className="font-semibold">
          {row.teamScore}–{row.oppScore}
        </span>
        {row.overtime ? (
          <span className="text-muted-foreground"> OT</span>
        ) : null}
      </span>
    );
  }
  if (statusLabel && row.teamScore != null && row.oppScore != null) {
    return (
      <span className="tabular-nums">
        <span className="font-semibold">{statusLabel}</span>{" "}
        {row.teamScore}–{row.oppScore}
      </span>
    );
  }
  if (statusLabel) {
    return <span className="font-semibold">{statusLabel}</span>;
  }
  return (
    <span className="tabular-nums text-muted-foreground">
      {row.timeLabel ?? "—"}
    </span>
  );
}

export function TeamScheduleView({ rows }: { rows: TeamScheduleRow[] }) {
  const phases = useMemo(() => {
    const present = new Set(rows.map((r) => r.phase));
    return (["preseason", "regular", "postseason"] as const).filter((p) =>
      present.has(p)
    );
  }, [rows]);
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const [side, setSide] = useState<SideFilter>("all");

  const months = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (phase === "all" || r.phase === phase) &&
        (side === "all" || (side === "home") === r.home)
    );
    const groups: Array<{ key: string; label: string; rows: TeamScheduleRow[] }> =
      [];
    for (const row of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.key === row.monthKey) last.rows.push(row);
      else groups.push({ key: row.monthKey, label: row.monthLabel, rows: [row] });
    }
    return groups;
  }, [rows, phase, side]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {phases.length > 1 ? (
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Season phase"
          >
            <Chip active={phase === "all"} onClick={() => setPhase("all")}>
              All games
            </Chip>
            {phases.map((p) => (
              <Chip key={p} active={phase === p} onClick={() => setPhase(p)}>
                {PHASE_LABEL[p]}
              </Chip>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Venue">
          {(["all", "home", "away"] as const).map((s) => (
            <Chip key={s} active={side === s} onClick={() => setSide(s)}>
              {s === "all" ? "Home & away" : s === "home" ? "Home" : "Away"}
            </Chip>
          ))}
        </div>
      </div>

      {months.length === 0 ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No games match these filters.
        </p>
      ) : (
        months.map((month) => (
          <section key={month.key} aria-label={month.label}>
            <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1.5">
              <h3 className={cn(type.bodySm, "font-bold tracking-tight")}>
                {month.label}
              </h3>
              <span className={cn(type.caption, "text-muted-foreground")}>
                {month.rows.length} {month.rows.length === 1 ? "game" : "games"}
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {month.rows.map((row) => (
                <li key={row.id}>
                  <TransitionLink
                    href={gameHref(row)}
                    className={cn(
                      "grid grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1.5 py-2.5 hover:bg-secondary/40 sm:grid-cols-[7rem_minmax(0,1fr)_auto]",
                      row.isNext && "bg-foreground/[0.04]"
                    )}
                  >
                    <span className="flex flex-col">
                      <span className={cn(type.bodySm, "font-semibold")}>
                        {row.dateLabel}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {row.isNext ? <Tag tone="accent">Next</Tag> : null}
                        {row.backToBack ? <Tag>B2B</Tag> : null}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          type.caption,
                          "w-5 shrink-0 text-center font-semibold text-muted-foreground"
                        )}
                      >
                        {row.home ? "vs" : "@"}
                      </span>
                      <TeamLogo teamKey={row.oppAbbr} size="xs" />
                      <span className="flex min-w-0 flex-col">
                        <span
                          className={cn(type.bodySm, "truncate font-semibold")}
                        >
                          <span className="sm:hidden">{row.oppAbbr}</span>
                          <span className="hidden sm:inline">
                            {row.oppName || row.oppAbbr}
                          </span>
                        </span>
                        {row.phase !== "regular" || row.note ? (
                          <span
                            className={cn(
                              type.micro,
                              "truncate font-semibold uppercase tracking-wide text-muted-foreground"
                            )}
                          >
                            {row.note ?? PHASE_LABEL[row.phase]}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className={cn(type.bodySm, "text-right")}>
                      <RowOutcome row={row} />
                    </span>
                  </TransitionLink>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
