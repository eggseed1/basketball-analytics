"use client";

import { useCallback, useMemo, useState } from "react";
import { Share2 } from "lucide-react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { ShareSnapshotDialog } from "@/components/share/share-snapshot-dialog";
import { type } from "@/lib/design-system";
import { playerHeadshotCandidates, resolveTeamBrand, teamChartColor } from "@/lib/nba-brand";
import { photoCreditFor, photoCreditText } from "@/lib/photo-credits";
import { percentileSavantColor, SAVANT_LEGEND } from "@/lib/player-grade";
import type { PercentileMetric } from "@/lib/player-percentile-metrics";
import type { PercentileCategory } from "@/lib/player-stat-sheet-registry";
import { cn } from "@/lib/utils";

export type PercentileShareSection = {
  id: PercentileCategory;
  label: string;
  metrics: PercentileMetric[];
};

const SHARE_ROW_GRID = "grid grid-cols-[8.5rem_minmax(0,1fr)_4.25rem] items-center gap-x-3";
const PIP = 26;

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultIds(sections: PercentileShareSection[], category: PercentileCategory) {
  const section =
    sections.find((s) => s.id === category && s.metrics.length) ??
    sections.find((s) => s.metrics.length);
  return (section?.metrics ?? []).map((m) => m.id);
}

function pipLeft(pct: number) {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  return `calc(${PIP / 2}px + (100% - ${PIP}px) * ${t})`;
}

function PercentileShareGraphic({
  playerId,
  playerName,
  season,
  teamKey,
  sections,
}: {
  playerId: string;
  playerName: string;
  season: string;
  teamKey?: string;
  sections: PercentileShareSection[];
}) {
  const brand = resolveTeamBrand(teamKey);
  const frame = teamChartColor(teamKey, { surface: "dark" }).color;
  const credit = photoCreditFor(playerHeadshotCandidates({ playerId, espnId: playerId })[0]);
  return (
    <div
      className="w-[540px] max-w-[540px] shrink-0 select-none px-7 pb-7 pt-8 text-white"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, #1a1a1f 0%, #0c0c0e 55%, #080809 100%)",
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div className="flex items-center gap-5">
        <div className="shrink-0 overflow-hidden rounded-sm p-[2px]" style={{ background: frame }}>
          <div className="overflow-hidden rounded-[1px] bg-[#111]">
            <PlayerHeadshot
              playerId={playerId}
              espnId={playerId}
              name={playerName}
              teamKey={teamKey}
              size="xl"
              className="!h-[120px] !w-[120px] !rounded-none !ring-0"
              priority
            />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[26px] font-black uppercase leading-[1.05] tracking-[0.03em]">
            {playerName}
          </p>
          <p className="mt-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">
            {brand ? (
              <TeamLogo teamKey={teamKey} size="xs" className="!h-5 !w-5" />
            ) : null}
            {season}
            {brand ? ` · ${brand.abbr}` : null}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
            Percentile rankings
          </p>
        </div>
      </div>

      <div className={cn(SHARE_ROW_GRID, "mt-7")} aria-hidden>
        <span />
        <span className="relative h-4">
          {(
            [
              ["Poor", SAVANT_LEGEND.poor, "0%", "translateX(0)"],
              ["Avg", SAVANT_LEGEND.average, "50%", "translateX(-50%)"],
              ["Great", SAVANT_LEGEND.great, "100%", "translateX(-100%)"],
            ] as const
          ).map(([label, color, left, transform]) => (
            <span
              key={label}
              className="absolute top-0 text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ left, transform, color }}
            >
              {label}
            </span>
          ))}
        </span>
        <span />
      </div>

      <div className="mt-2 flex flex-col gap-5">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="border-b border-white/25 pb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
              {section.label}
            </p>
            {section.metrics.map((m, i) => {
              const pct = Math.max(0, Math.min(100, m.percentile));
              const color = percentileSavantColor(pct, "dark");
              return (
                <div
                  key={m.id}
                  className={cn(SHARE_ROW_GRID, "py-2", i > 0 && "border-t border-white/10")}
                >
                  <span className="truncate text-[14px] font-semibold">{m.label}</span>
                  <span className="relative h-[26px]">
                    {m.showPercentile ? (
                      <>
                        <span
                          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/10"
                          style={{ left: PIP / 2, right: PIP / 2 }}
                        />
                        <span
                          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                          style={{
                            left: PIP / 2,
                            width: `calc((100% - ${PIP}px) * ${pct / 100})`,
                            background: color,
                          }}
                        />
                        <span
                          className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white ring-2 ring-[#0c0c0e]"
                          style={{ left: pipLeft(pct), width: PIP, height: PIP, background: color }}
                        >
                          {Math.round(m.percentile)}
                        </span>
                      </>
                    ) : (
                      <span className="absolute inset-y-0 left-0 flex items-center text-[11px] text-white/45">
                        {m.interpretation === "descriptive" ? "Volume, not a skill grade" : "Role context"}
                      </span>
                    )}
                  </span>
                  <span className="text-right text-[15px] font-bold tabular-nums">{m.display}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-7 text-center text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/40">
        DRBL · League percentiles for {season} · 100 is best
      </p>
      {credit ? (
        <p className="mt-2 text-center text-[9px] leading-snug text-white/35">
          {photoCreditText(credit)}
        </p>
      ) : null}
    </div>
  );
}

export function PercentileShareControls({
  playerId,
  playerName,
  season,
  teamKey,
  sections,
  activeCategory,
}: {
  playerId: string;
  playerName: string;
  season: string;
  teamKey?: string;
  sections: PercentileShareSection[];
  activeCategory: PercentileCategory;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const available = useMemo(() => sections.filter((s) => s.metrics.length), [sections]);

  const chosen = useMemo(() => {
    const set = new Set(selectedIds);
    return available
      .map((s) => ({ ...s, metrics: s.metrics.filter((m) => set.has(m.id)) }))
      .filter((s) => s.metrics.length);
  }, [available, selectedIds]);

  const openDialog = () => {
    setSelectedIds(defaultIds(available, activeCategory));
    setOpen(true);
  };
  const close = useCallback(() => setOpen(false), []);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSection = (section: PercentileShareSection) => {
    const ids = section.metrics.map((m) => m.id);
    setSelectedIds((prev) => {
      const allOn = ids.every((id) => prev.includes(id));
      return allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
    });
  };

  const linkButton = cn(
    type.caption,
    "font-semibold text-muted-foreground underline-offset-2 hover:underline"
  );

  const controls = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className={cn(type.micro, "font-bold uppercase tracking-[0.12em] text-muted-foreground")}>
          Rankings on snapshot
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSelectedIds(defaultIds(available, activeCategory))} className={linkButton}>
            This tab
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(available.flatMap((s) => s.metrics.map((m) => m.id)))}
            className={linkButton}
          >
            All
          </button>
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto rounded-[var(--radius-lg)] border border-border/60 frost-surface-soft p-2">
        {available.map((section) => {
          const allOn = section.metrics.every((m) => selectedIds.includes(m.id));
          return (
            <div key={section.id} className="mb-1.5 last:mb-0">
              <button
                type="button"
                onClick={() => toggleSection(section)}
                className={cn(
                  type.micro,
                  "px-2 py-1 font-bold uppercase tracking-[0.12em]",
                  allOn ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {section.label}
              </button>
              <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {section.metrics.map((m) => {
                  const on = selectedIds.includes(m.id);
                  return (
                    <li key={m.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                          on ? "bg-foreground/8" : "hover:bg-foreground/5"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(m.id)}
                          className="size-3.5 accent-foreground"
                        />
                        <span className={cn(type.caption, "truncate font-semibold")}>{m.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {!chosen.length ? (
        <p className={cn(type.caption, "text-destructive")}>Select at least one ranking.</p>
      ) : null}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!available.length}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 px-2 py-1",
          type.caption,
          "font-semibold text-muted-foreground transition-colors",
          "hover:border-foreground/30 hover:bg-foreground/5 hover:text-foreground",
          "disabled:pointer-events-none disabled:opacity-40"
        )}
        aria-haspopup="dialog"
        aria-label="Share percentile rankings"
      >
        <Share2 className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Share</span>
      </button>
      <ShareSnapshotDialog
        open={open}
        onClose={close}
        fileName={`drbl-percentiles-${slug(playerName)}-${season}.png`}
        shareTitle={`${playerName} ${season} percentile rankings`}
        shareText={`${playerName} ${season} percentile rankings · DRBL`}
        canCapture={chosen.length > 0}
        controls={controls}
        graphic={
          <PercentileShareGraphic
            playerId={playerId}
            playerName={playerName}
            season={season}
            teamKey={teamKey}
            sections={chosen}
          />
        }
        emptyPreview={
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
            <p className={cn(type.bodySm, "font-semibold text-white")}>{playerName}</p>
            <p className={cn(type.caption, "text-white/60")}>Pick rankings to preview the snapshot</p>
          </div>
        }
      />
    </>
  );
}
