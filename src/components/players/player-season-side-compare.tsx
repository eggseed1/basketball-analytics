"use client";

import { useMemo, useState } from "react";

import { careerProductionIndex } from "@/analytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlayerSeason } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamBrandBarColor, teamChartColor } from "@/lib/nba-brand";
import {
  isMultiTeamSeasonRow,
  multiTeamDisplayLabel,
} from "@/lib/player-team-context";
import { cn } from "@/lib/utils";

type MetricDef = {
  id: string;
  label: string;
  higherIsBetter?: boolean;
  asPct?: boolean;
  digits?: number;
  get: (row: PlayerSeason) => number | null;
};

function perGame(row: PlayerSeason, total: number) {
  return row.gamesPlayed > 0 ? total / row.gamesPlayed : null;
}

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

function rate(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n !== 0 ? n : n === 0 ? 0 : null;
}

const METRICS: MetricDef[] = [
  {
    id: "ppg",
    label: "PTS",
    get: (r) => perGame(r, r.points),
  },
  {
    id: "apg",
    label: "AST",
    get: (r) => perGame(r, r.assists),
  },
  {
    id: "rpg",
    label: "TRB",
    get: (r) => perGame(r, r.rebounds),
  },
  {
    id: "spg",
    label: "STL",
    get: (r) => perGame(r, r.steals),
  },
  {
    id: "bpg",
    label: "BLK",
    get: (r) => perGame(r, r.blocks),
  },
  {
    id: "tov",
    label: "TOV",
    higherIsBetter: false,
    get: (r) => perGame(r, r.turnovers),
  },
  {
    id: "mpg",
    label: "MP",
    get: (r) => perGame(r, r.minutes),
  },
  {
    id: "ts",
    label: "TS%",
    asPct: true,
    get: (r) => rate(r.trueShootingPct),
  },
  {
    id: "efg",
    label: "eFG%",
    asPct: true,
    get: (r) => rate(r.effectiveFieldGoalPct),
  },
  {
    id: "usg",
    label: "USG%",
    asPct: true,
    get: (r) => rate(r.usagePct),
  },
  {
    id: "cpi",
    label: "CPI",
    get: (r) => finite(careerProductionIndex(r)),
  },
  {
    id: "per",
    label: "PER",
    get: (r) => finite(r.per),
  },
  {
    id: "bpm",
    label: "BPM",
    get: (r) => finite(r.bpm),
  },
  {
    id: "ortg",
    label: "ORtg",
    get: (r) => finite(r.offensiveRating),
  },
  {
    id: "drtg",
    label: "DRtg",
    higherIsBetter: false,
    get: (r) => finite(r.defensiveRating),
  },
  {
    id: "ws",
    label: "WS",
    get: (r) => finite(r.winShares),
  },
  {
    id: "vorp",
    label: "VORP",
    get: (r) => finite(r.vorp),
  },
  {
    id: "drbl",
    label: "DRBL",
    get: (r) => (r.drbl100 !== 0 ? finite(r.drbl100) : null),
  },
];

function formatValue(value: number | null, def: MetricDef): string {
  if (value == null) return "—";
  if (def.asPct) return formatPct(value);
  return formatNumber(value, def.digits ?? 1);
}

function teamLabel(row: PlayerSeason): string {
  if (isMultiTeamSeasonRow(row)) return multiTeamDisplayLabel(row);
  return row.teamAbbreviation ?? teamChartColor(row.teamId).abbr;
}

function SeasonPick({
  label,
  value,
  seasons,
  onChange,
  color,
}: {
  label: string;
  value: string;
  seasons: string[];
  onChange: (next: string) => void;
  color: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span
        className={cn(
          type.caption,
          "font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {label}
      </span>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger
          className={cn(
            type.bodySm,
            "glass-pill h-9 w-full rounded-md border-white/40 font-semibold"
          )}
          style={{
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 45%, transparent)`,
          }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" className="max-h-72">
          {seasons.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DivergingBar({
  a,
  b,
  label,
  aColor,
  bColor,
  aDisplay,
  bDisplay,
  higherIsBetter = true,
}: {
  a: number | null;
  b: number | null;
  label: string;
  aColor: string;
  bColor: string;
  aDisplay: string;
  bDisplay: string;
  higherIsBetter?: boolean;
}) {
  const maxAbs = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 0.0001);
  const aPct = a == null ? 0 : (Math.abs(a) / maxAbs) * 100;
  const bPct = b == null ? 0 : (Math.abs(b) / maxAbs) * 100;
  const aWins =
    a != null &&
    b != null &&
    (higherIsBetter ? a > b : a < b) &&
    Math.abs(a - b) > 1e-6;
  const bWins =
    a != null &&
    b != null &&
    (higherIsBetter ? b > a : b < a) &&
    Math.abs(a - b) > 1e-6;

  return (
    <div className="grid grid-cols-[minmax(3.5rem,1fr)_minmax(0,2.75fr)_minmax(3.5rem,1fr)] items-center gap-x-2 gap-y-1 py-1.5">
      <p
        className={cn(
          type.bodySm,
          "text-right font-bold tabular-nums",
          aWins ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {aDisplay}
      </p>
      <div className="flex min-w-0 flex-col items-center gap-1">
        <div className="grid h-3 w-full grid-cols-2 gap-px overflow-hidden rounded-sm bg-foreground/5">
          <div className="relative flex justify-end">
            <div
              className="h-full rounded-l-sm transition-[width] duration-300"
              style={{
                width: `${aPct}%`,
                backgroundColor: aColor,
                opacity: a == null ? 0 : aWins ? 1 : 0.55,
              }}
            />
          </div>
          <div className="relative flex justify-start">
            <div
              className="h-full rounded-r-sm transition-[width] duration-300"
              style={{
                width: `${bPct}%`,
                backgroundColor: bColor,
                opacity: b == null ? 0 : bWins ? 1 : 0.55,
              }}
            />
          </div>
        </div>
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          {label}
        </p>
      </div>
      <p
        className={cn(
          type.bodySm,
          "text-left font-bold tabular-nums",
          bWins ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {bDisplay}
      </p>
    </div>
  );
}

export function PlayerSeasonSideCompare({
  seasons,
  defaultA,
  defaultB,
  accentA,
  accentB,
}: {
  seasons: PlayerSeason[];
  defaultA: string;
  defaultB: string;
  accentA?: string;
  accentB?: string;
}) {
  const bySeason = useMemo(() => {
    const map = new Map<string, PlayerSeason>();
    for (const row of seasons) map.set(row.season, row);
    return map;
  }, [seasons]);

  const seasonIds = useMemo(
    () =>
      [...bySeason.keys()].sort((a, b) => b.localeCompare(a)),
    [bySeason]
  );

  const [seasonA, setSeasonA] = useState(
    () => (seasonIds.includes(defaultA) ? defaultA : seasonIds[0] ?? "")
  );
  const [seasonB, setSeasonB] = useState(() => {
    if (seasonIds.includes(defaultB) && defaultB !== defaultA) return defaultB;
    return seasonIds.find((s) => s !== defaultA) ?? seasonIds[0] ?? "";
  });

  const rowA = bySeason.get(seasonA) ?? null;
  const rowB = bySeason.get(seasonB) ?? null;

  const colorA =
    accentA ??
    (rowA ? teamBrandBarColor(rowA.teamId) : null) ??
    "var(--foreground)";
  const colorB =
    accentB ??
    (rowB ? teamBrandBarColor(rowB.teamId) : null) ??
    "var(--muted-foreground)";

  if (seasonIds.length < 2) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        Need at least two seasons to compare.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SeasonPick
          label="Season A"
          value={seasonA}
          seasons={seasonIds}
          onChange={setSeasonA}
          color={colorA}
        />
        <p
          className={cn(
            type.caption,
            "hidden shrink-0 pb-2 font-bold uppercase tracking-[0.14em] text-muted-foreground sm:block"
          )}
        >
          vs
        </p>
        <SeasonPick
          label="Season B"
          value={seasonB}
          seasons={seasonIds}
          onChange={setSeasonB}
          color={colorB}
        />
      </div>

      {(rowA || rowB) && (
        <div
          className={cn(
            type.caption,
            "flex flex-wrap justify-between gap-2 text-muted-foreground"
          )}
        >
          <span>
            {rowA
              ? `${rowA.season} · ${teamLabel(rowA)} · ${rowA.gamesPlayed} GP`
              : "—"}
          </span>
          <span className="text-right">
            {rowB
              ? `${rowB.season} · ${teamLabel(rowB)} · ${rowB.gamesPlayed} GP`
              : "—"}
          </span>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border/50">
        {METRICS.map((def) => {
          const a = rowA ? def.get(rowA) : null;
          const b = rowB ? def.get(rowB) : null;
          if (a == null && b == null) return null;
          return (
            <DivergingBar
              key={def.id}
              a={a}
              b={b}
              label={def.label}
              aColor={colorA}
              bColor={colorB}
              aDisplay={formatValue(a, def)}
              bDisplay={formatValue(b, def)}
              higherIsBetter={def.higherIsBetter !== false}
            />
          );
        })}
      </div>
    </div>
  );
}
