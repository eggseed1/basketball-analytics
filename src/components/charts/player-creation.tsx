"use client";

import { useId } from "react";

import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import type { CreationProfile } from "@/lib/player-availability";
import { cn } from "@/lib/utils";

export function PlayerCreationPanel({
  profile,
  season,
  accentColor,
}: {
  profile: CreationProfile;
  season: string;
  accentColor?: string;
}) {
  const chartId = useId();
  const accent = accentColor?.trim() || "var(--foreground)";

  const rows = [
    {
      key: "ast",
      label: "AST%",
      display: formatPct(profile.assistPct),
      tip: "Share of teammate field goals assisted while on floor",
      width: Math.max(6, Math.min(100, profile.assistPct * 100)),
    },
    {
      key: "tov",
      label: "TOV%",
      display: formatPct(profile.turnoverPct),
      tip: "Turnovers per 100 plays",
      width: Math.max(6, Math.min(100, profile.turnoverPct * 100 * 2)),
    },
    {
      key: "atr",
      label: "AST/TO",
      display:
        profile.assistToTurnover != null
          ? formatNumber(profile.assistToTurnover, 2)
          : "—",
      tip: "Assists per turnover",
      width:
        profile.assistToTurnover != null
          ? Math.max(6, Math.min(100, (profile.assistToTurnover / 4) * 100))
          : 6,
    },
  ] as const;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 id={`${chartId}-title`} className={type.heading}>
          Creation
        </h2>
        <p
          id={`${chartId}-desc`}
          className={cn(type.bodySm, "mt-1 text-muted-foreground")}
        >
          {season} generation vs giveaways from the season board. Potential
          assists and unassisted shot share need tracking coverage.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["APG", formatNumber(profile.apg, 1)],
            ["TOPG", formatNumber(profile.topg, 1)],
            ["AST%", formatPct(profile.assistPct)],
            [
              "AST/TO",
              profile.assistToTurnover != null
                ? formatNumber(profile.assistToTurnover, 2)
                : "—",
            ],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-border/70 px-3 py-2"
          >
            <dt
              className={cn(
                type.micro,
                "font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              {label}
            </dt>
            <dd className={cn(type.body, "mt-0.5 font-bold tabular-nums")}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn(type.caption, "font-semibold")} title={row.tip}>
                {row.label}
              </span>
              <span className={cn(type.caption, "tabular-nums font-semibold")}>
                {row.display}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${row.width}%`,
                  background: accent,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
