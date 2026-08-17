"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { HomeDarkoLeader } from "@/data/queries/home";
import type { PlayerSeason } from "@/data/types";
import { normalizePlayerName } from "@/lib/player-name";
import { formatImpact, formatPct } from "@/lib/stat-explainers";
import { cn } from "@/lib/utils";

type SortKey = "darko" | "ts" | "usage";

type OverviewRow = {
  key: string;
  rank: number;
  id: string;
  nbaId?: string;
  name: string;
  teamKey?: string;
  darko: number | null;
  ts: number | null;
  usg: number | null;
};

export function TopPerformersPanel({
  darkoLeaders,
  tsLeaders,
  usageStars,
}: {
  darkoLeaders: HomeDarkoLeader[];
  tsLeaders: PlayerSeason[];
  usageStars: PlayerSeason[];
}) {
  const [sort, setSort] = useState<SortKey>("darko");

  const seasonByName = useMemo(() => {
    const map = new Map<string, PlayerSeason>();
    for (const row of [...tsLeaders, ...usageStars]) {
      const key = normalizePlayerName(row.playerName);
      const prev = map.get(key);
      if (!prev || row.minutes > prev.minutes) map.set(key, row);
    }
    return map;
  }, [tsLeaders, usageStars]);

  const rows = useMemo(() => {
    const byKey = new Map<string, OverviewRow>();

    const upsert = (partial: Omit<OverviewRow, "rank">) => {
      const existing = byKey.get(partial.key);
      if (!existing) {
        byKey.set(partial.key, { ...partial, rank: 0 });
        return;
      }
      byKey.set(partial.key, {
        ...existing,
        id: partial.id || existing.id,
        nbaId: partial.nbaId ?? existing.nbaId,
        teamKey: partial.teamKey ?? existing.teamKey,
        darko: partial.darko ?? existing.darko,
        ts: partial.ts ?? existing.ts,
        usg: partial.usg ?? existing.usg,
      });
    };

    for (const p of darkoLeaders) {
      const key = normalizePlayerName(p.playerName);
      const season = seasonByName.get(key);
      upsert({
        key,
        id: p.profileId,
        nbaId: p.nbaPlayerId,
        name: p.playerName,
        teamKey: p.teamAbbr ?? p.teamName ?? season?.teamName,
        darko: p.impact,
        ts: season?.trueShootingPct ?? null,
        usg: season?.usagePct ?? null,
      });
    }

    for (const p of tsLeaders) {
      const key = normalizePlayerName(p.playerName);
      upsert({
        key,
        id: p.playerId,
        name: p.playerName,
        teamKey: p.teamName,
        darko: null,
        ts:
          p.trueShootingPct != null && p.trueShootingPct > 0
            ? p.trueShootingPct
            : null,
        usg: p.usagePct != null && p.usagePct > 0 ? p.usagePct : null,
      });
    }

    for (const p of usageStars) {
      const key = normalizePlayerName(p.playerName);
      upsert({
        key,
        id: p.playerId,
        name: p.playerName,
        teamKey: p.teamName,
        darko: null,
        ts:
          p.trueShootingPct != null && p.trueShootingPct > 0
            ? p.trueShootingPct
            : null,
        usg: p.usagePct != null && p.usagePct > 0 ? p.usagePct : null,
      });
    }

    const list = [...byKey.values()];
    list.sort((a, b) => {
      const av =
        sort === "ts" ? a.ts : sort === "usage" ? a.usg : a.darko;
      const bv =
        sort === "ts" ? b.ts : sort === "usage" ? b.usg : b.darko;
      return (bv ?? -Infinity) - (av ?? -Infinity);
    });

    return list.slice(0, 10).map((row, i) => ({ ...row, rank: i + 1 }));
  }, [sort, darkoLeaders, tsLeaders, usageStars, seasonByName]);

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Top performers
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Overview with{" "}
            <MetricHelp conceptId="darko">DARKO</MetricHelp>,{" "}
            <MetricHelp conceptId="ts">TS%</MetricHelp>, and{" "}
            <MetricHelp conceptId="usg">USG</MetricHelp> — sort to reorder.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["darko", "DARKO"],
              ["ts", "TS%"],
              ["usage", "USG"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
                sort === key
                  ? "bg-foreground text-background"
                  : "bg-secondary text-foreground hover:bg-foreground/10"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_52px_52px_52px] gap-1 border-b border-border bg-secondary/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Player</span>
          <span className="text-right">
            <MetricHelp
              conceptId="darko"
              labelClassName="text-[10px] font-semibold uppercase tracking-wide"
            >
              DPM
            </MetricHelp>
          </span>
          <span className="text-right">
            <MetricHelp
              conceptId="ts"
              labelClassName="text-[10px] font-semibold uppercase tracking-wide"
            >
              TS%
            </MetricHelp>
          </span>
          <span className="text-right">
            <MetricHelp
              conceptId="usg"
              labelClassName="text-[10px] font-semibold uppercase tracking-wide"
            >
              USG
            </MetricHelp>
          </span>
        </div>
        <ol className="divide-y divide-black/5">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="grid grid-cols-[minmax(0,1fr)_52px_52px_52px] items-center gap-1 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">
                    {row.rank}
                  </span>
                  <PlayerIdentity
                    playerId={row.id}
                    name={row.name}
                    nbaId={row.nbaId}
                    teamKey={row.teamKey}
                    teamLabel={row.teamKey}
                    variant="compact"
                    className="min-w-0 flex-1"
                    nameClassName="w-full gap-2 no-underline hover:underline"
                  >
                    <PlayerHeadshot
                      playerId={row.id}
                      nbaId={row.nbaId}
                      name={row.name}
                      teamKey={row.teamKey}
                      size="xs"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {row.name}
                    </span>
                    {row.teamKey ? (
                      <TeamLogo teamKey={row.teamKey} size="xs" />
                    ) : null}
                  </PlayerIdentity>
                </span>
                <Metric
                  value={
                    row.darko != null ? formatImpact(row.darko) : "-"
                  }
                  emphasize={sort === "darko"}
                />
                <Metric
                  value={row.ts != null ? formatPct(row.ts) : "-"}
                  emphasize={sort === "ts"}
                />
                <Metric
                  value={row.usg != null ? formatPct(row.usg) : "-"}
                  emphasize={sort === "usage"}
                />
              </div>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              Leaders unavailable.
            </li>
          ) : null}
        </ol>
      </div>

      <TransitionLink
        href={
          sort === "ts"
            ? "/explore/players?sort=trueShootingPct"
            : sort === "usage"
              ? "/explore/players?sort=usagePct"
              : "/explore/players?sort=darkoDpm"
        }
        className="self-center text-[13px] font-semibold underline-offset-4 hover:underline"
      >
        See all leaderboard
      </TransitionLink>
    </section>
  );
}

function Metric({
  value,
  emphasize,
}: {
  value: string;
  emphasize?: boolean;
}) {
  return (
    <span
      className={cn(
        "text-right text-[12px] tabular-nums",
        emphasize ? "font-bold text-foreground" : "text-muted-foreground"
      )}
    >
      {value}
    </span>
  );
}
