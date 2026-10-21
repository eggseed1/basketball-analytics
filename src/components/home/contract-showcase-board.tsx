"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import type {
  ContractShowcaseModel,
  ContractShowcaseRow,
  ContractShowcaseSurplusTile,
} from "@/lib/home-contract-showcase";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { shortDate } from "@/lib/salary-payoff";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type View = "recent" | "season" | "surplus";

function pctLabel(n: number): string {
  return `${n.toFixed(n >= 100 || n < 10 ? 0 : 1)}%`;
}

function gainLabel(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return n >= 0 ? `+${body}` : `−${body}`;
}

function PayBar({
  pct,
  tone,
}: {
  pct: number;
  tone: "good" | "warn" | "neutral";
}) {
  const width = `${Math.min(100, Math.max(0, pct))}%`;
  const fill =
    tone === "good"
      ? "bg-[var(--data-positive)]"
      : tone === "warn"
        ? "bg-[var(--data-warning,var(--chart-3))]"
        : "bg-foreground/55";
  return (
    <span className="relative mt-1 block h-1 overflow-hidden rounded-full bg-secondary">
      <span
        className={cn("absolute inset-y-0 left-0 rounded-full", fill)}
        style={{ width }}
      />
    </span>
  );
}

function PayoffRow({
  row,
  view,
}: {
  row: ContractShowcaseRow;
  view: "recent" | "season";
}) {
  const tone =
    row.seasonPct >= 100 ? "good" : row.ahead >= 0 ? "neutral" : "warn";
  const primary =
    view === "recent" ? gainLabel(row.recentGain) : pctLabel(row.seasonPct);
  const primaryTone =
    view === "recent" && row.recentGain > 0
      ? "text-[var(--data-positive)]"
      : "text-foreground";
  const secondary =
    view === "recent"
      ? `${pctLabel(row.seasonPct)} of ${formatUsdCompact(row.salary)}`
      : `${formatUsdCompact(row.earned)} earned · ${
          row.surplus != null ? formatUsdSignedCompact(row.surplus) : "—"
        } surplus`;

  const inner = (
    <div
      data-motion="row"
      className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/70"
    >
      <PlayerHeadshot
        playerId={row.nbaId}
        nbaId={row.nbaId}
        name={row.name}
        teamKey={row.teamId}
        size="sm"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn(type.bodySm, "truncate font-semibold")}>{row.name}</p>
          <p
            className={cn(
              type.bodySm,
              "shrink-0 font-bold tabular-nums",
              primaryTone
            )}
          >
            {primary}
            {view === "recent" ? (
              <span className="ml-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                pts
              </span>
            ) : null}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <TeamLogo teamKey={row.teamId} size="2xs" />
          <span className={cn(type.caption, "truncate text-muted-foreground")}>
            {secondary}
          </span>
        </div>
        <PayBar pct={row.seasonPct} tone={tone} />
      </div>
    </div>
  );

  if (!row.href) return <li>{inner}</li>;
  return (
    <li>
      <Link
        href={row.href}
        className="block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    </li>
  );
}

function SurplusRow({ row }: { row: ContractShowcaseSurplusTile }) {
  const inner = (
    <div
      data-motion="row"
      className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/70"
    >
      <PlayerHeadshot
        playerId={row.playerId}
        espnId={row.playerId}
        nbaId={row.nbaId}
        name={row.name}
        teamKey={row.teamKey || row.teamId}
        size="sm"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn(type.bodySm, "truncate font-semibold")}>{row.name}</p>
          <p
            className={cn(
              type.bodySm,
              "shrink-0 font-bold tabular-nums",
              row.surplus >= 0
                ? "text-[var(--data-positive)]"
                : "text-destructive"
            )}
          >
            {formatUsdSignedCompact(row.surplus)}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <TeamLogo teamKey={row.teamKey || row.teamId} size="2xs" />
          <span className={cn(type.caption, "truncate text-muted-foreground")}>
            #{row.rank} · {formatUsdCompact(row.salary)}
            {row.seasonPct != null
              ? ` · ${pctLabel(row.seasonPct)} covered`
              : ""}
          </span>
        </div>
        {row.seasonPct != null ? (
          <PayBar
            pct={row.seasonPct}
            tone={row.surplus >= 0 ? "good" : "warn"}
          />
        ) : null}
      </div>
    </div>
  );

  if (!row.href) return <li>{inner}</li>;
  return (
    <li>
      <Link
        href={row.href}
        className="block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    </li>
  );
}

export function ContractShowcaseBoard({
  model,
}: {
  model: ContractShowcaseModel;
}) {
  const [view, setView] = useState<View>("recent");
  const labelId = useId();
  const rows = view === "season" ? model.seasonLeaders : model.recent;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ChoiceTrack
        aria-labelledby={labelId}
        scrollable
        className="border-0 bg-transparent p-0"
      >
        <span id={labelId} className="sr-only">
          Contract showcase view
        </span>
        <ChoiceChip
          active={view === "recent"}
          onClick={() => setView("recent")}
          className="shrink-0"
        >
          Recent climb
        </ChoiceChip>
        <ChoiceChip
          active={view === "season"}
          onClick={() => setView("season")}
          className="shrink-0"
        >
          Season %
        </ChoiceChip>
        <ChoiceChip
          active={view === "surplus"}
          onClick={() => setView("surplus")}
          className="shrink-0"
        >
          League surplus
        </ChoiceChip>
      </ChoiceTrack>

      <p className={cn(type.caption, "text-muted-foreground")}>
        {view === "recent"
          ? `Largest gains in salary covered through ${shortDate(model.meta.through)}.`
          : view === "season"
            ? `Highest share of salary covered in ${model.season}, through ${shortDate(model.meta.through)}.`
            : "Biggest positive surplus deals. Bars show season pay covered when we have a payoff line."}
      </p>

      <ul className="flex min-w-0 flex-col divide-y divide-border/40">
        {view === "surplus"
          ? model.surplus.map((row) => <SurplusRow key={row.key} row={row} />)
          : rows.map((row) => (
              <PayoffRow key={row.key} row={row} view={view} />
            ))}
      </ul>
    </div>
  );
}
