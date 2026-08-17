"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import type {
  HomeDarkoLeader,
  HomeDrblLeader,
  HomePerformerSeason,
} from "@/data/queries/home";
import type { PlayerSeason } from "@/data/types";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { formatNumber } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";
import { formatImpact, formatPct } from "@/lib/stat-explainers";
import { cn } from "@/lib/utils";

type SortKey = "drbl" | "darko" | "ts" | "usage";

type OverviewRow = {
  key: string;
  rank: number;
  id: string;
  nbaId?: string;
  name: string;
  /** Canonical ESPN id or abbr — safe for TeamLogo. */
  teamKey?: string;
  teamLabel?: string;
  drbl: number | null;
  darko: number | null;
  ts: number | null;
  usg: number | null;
};

function teamIdentityFromSeason(season?: PlayerSeason | null): {
  teamKey?: string;
  teamLabel?: string;
} {
  if (!season) return {};
  const fromId = season.teamId
    ? resolveCanonicalTeam(season.teamId)
    : null;
  if (fromId?.status === "resolved") {
    return {
      teamKey: fromId.team.canonicalTeamId,
      teamLabel: season.teamAbbreviation ?? fromId.team.abbr,
    };
  }
  const fromAbbr = season.teamAbbreviation
    ? resolveCanonicalTeam(season.teamAbbreviation)
    : null;
  if (fromAbbr?.status === "resolved") {
    return {
      teamKey: fromAbbr.team.canonicalTeamId,
      teamLabel: fromAbbr.team.abbr,
    };
  }
  if (season.teamAbbreviation) {
    return { teamLabel: season.teamAbbreviation };
  }
  return {};
}

function teamIdentityFromLoose(
  raw?: string | null
): { teamKey?: string; teamLabel?: string } {
  if (!raw?.trim()) return {};
  // Reject raw long provider numerics here — parent should already normalize.
  if (/^\d{6,}$/.test(raw.trim())) return {};
  const brand = resolveTeamBrand(raw);
  if (brand) return { teamKey: brand.espnTeamId, teamLabel: brand.abbr };
  const resolved = resolveCanonicalTeam(raw);
  if (resolved.status === "resolved") {
    return {
      teamKey: resolved.team.canonicalTeamId,
      teamLabel: resolved.team.abbr,
    };
  }
  return {};
}

export function TopPerformersPanel({
  drblLeaders = [],
  darkoLeaders,
  tsLeaders,
  usageStars,
  performerSeasons = [],
  drblOverlayOk = false,
  drblFallbackNote = null,
}: {
  drblLeaders?: HomeDrblLeader[];
  darkoLeaders: HomeDarkoLeader[];
  tsLeaders: PlayerSeason[];
  usageStars: PlayerSeason[];
  performerSeasons?: HomePerformerSeason[];
  drblOverlayOk?: boolean;
  drblFallbackNote?: string | null;
}) {
  const [sort, setSort] = useState<SortKey>(drblOverlayOk ? "drbl" : "darko");

  const seasonByName = useMemo(() => {
    const map = new Map<
      string,
      {
        playerId: string;
        teamKey?: string;
        teamLabel?: string;
        ts: number | null;
        usg: number | null;
      }
    >();
    for (const row of performerSeasons) {
      const key = normalizePlayerName(row.playerName);
      map.set(key, {
        playerId: row.playerId,
        teamKey: row.teamKey,
        teamLabel: row.teamAbbr,
        ts: row.trueShootingPct,
        usg: row.usagePct,
      });
    }
    // Fallback: TS/USG leader slices (covers cases where performerSeasons is empty).
    for (const row of [...tsLeaders, ...usageStars]) {
      const key = normalizePlayerName(row.playerName);
      if (map.has(key)) continue;
      const team = teamIdentityFromSeason(row);
      map.set(key, {
        playerId: row.playerId,
        teamKey: team.teamKey,
        teamLabel: team.teamLabel,
        ts:
          row.trueShootingPct != null && row.trueShootingPct > 0
            ? row.trueShootingPct
            : null,
        usg:
          row.usagePct != null && row.usagePct > 0 ? row.usagePct : null,
      });
    }
    return map;
  }, [performerSeasons, tsLeaders, usageStars]);

  const darkoByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of darkoLeaders) {
      map.set(normalizePlayerName(p.playerName), p.impact);
    }
    return map;
  }, [darkoLeaders]);

  const drblByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of drblLeaders) {
      map.set(normalizePlayerName(p.playerName), p.drbl100);
    }
    return map;
  }, [drblLeaders]);

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
        teamLabel: partial.teamLabel ?? existing.teamLabel,
        drbl: partial.drbl ?? existing.drbl,
        darko: partial.darko ?? existing.darko,
        ts: partial.ts ?? existing.ts,
        usg: partial.usg ?? existing.usg,
      });
    };

    for (const p of drblLeaders) {
      const key = normalizePlayerName(p.playerName);
      const season = seasonByName.get(key);
      const fromLeader =
        p.teamKey || p.teamAbbr
          ? { teamKey: p.teamKey, teamLabel: p.teamAbbr }
          : {};
      upsert({
        key,
        id: p.profileId,
        nbaId: p.nbaPlayerId,
        name: p.playerName,
        teamKey: fromLeader.teamKey ?? season?.teamKey,
        teamLabel: fromLeader.teamLabel ?? season?.teamLabel,
        drbl: p.drbl100,
        darko: p.darko ?? darkoByName.get(key) ?? null,
        ts: p.trueShootingPct ?? season?.ts ?? null,
        usg: p.usagePct ?? season?.usg ?? null,
      });
    }

    for (const p of darkoLeaders) {
      const key = normalizePlayerName(p.playerName);
      const season = seasonByName.get(key);
      const fromDarko = teamIdentityFromLoose(p.teamAbbr ?? p.teamName);
      upsert({
        key,
        id: p.profileId,
        nbaId: p.nbaPlayerId,
        name: p.playerName,
        teamKey: season?.teamKey ?? fromDarko.teamKey,
        teamLabel: season?.teamLabel ?? fromDarko.teamLabel,
        drbl: drblByName.get(key) ?? null,
        darko: p.impact,
        ts: p.trueShootingPct ?? season?.ts ?? null,
        usg: p.usagePct ?? season?.usg ?? null,
      });
    }

    for (const p of tsLeaders) {
      const key = normalizePlayerName(p.playerName);
      const season = seasonByName.get(key);
      const team = teamIdentityFromSeason(p);
      upsert({
        key,
        id: p.playerId,
        name: p.playerName,
        teamKey: team.teamKey ?? season?.teamKey,
        teamLabel: team.teamLabel ?? season?.teamLabel,
        drbl: drblByName.get(key) ?? null,
        darko: darkoByName.get(key) ?? null,
        ts:
          p.trueShootingPct != null && p.trueShootingPct > 0
            ? p.trueShootingPct
            : (season?.ts ?? null),
        usg:
          p.usagePct != null && p.usagePct > 0
            ? p.usagePct
            : (season?.usg ?? null),
      });
    }

    for (const p of usageStars) {
      const key = normalizePlayerName(p.playerName);
      const season = seasonByName.get(key);
      const team = teamIdentityFromSeason(p);
      upsert({
        key,
        id: p.playerId,
        name: p.playerName,
        teamKey: team.teamKey ?? season?.teamKey,
        teamLabel: team.teamLabel ?? season?.teamLabel,
        drbl: drblByName.get(key) ?? null,
        darko: darkoByName.get(key) ?? null,
        ts:
          p.trueShootingPct != null && p.trueShootingPct > 0
            ? p.trueShootingPct
            : (season?.ts ?? null),
        usg:
          p.usagePct != null && p.usagePct > 0
            ? p.usagePct
            : (season?.usg ?? null),
      });
    }

    const list = [...byKey.values()];
    list.sort((a, b) => {
      const av =
        sort === "ts"
          ? a.ts
          : sort === "usage"
            ? a.usg
            : sort === "drbl"
              ? a.drbl
              : a.darko;
      const bv =
        sort === "ts"
          ? b.ts
          : sort === "usage"
            ? b.usg
            : sort === "drbl"
              ? b.drbl
              : b.darko;
      return (bv ?? -Infinity) - (av ?? -Infinity);
    });

    return list.slice(0, 10).map((row, i) => ({ ...row, rank: i + 1 }));
  }, [
    sort,
    drblLeaders,
    darkoLeaders,
    tsLeaders,
    usageStars,
    seasonByName,
    darkoByName,
    drblByName,
  ]);

  const sortChips = (
    [
      ...(drblOverlayOk || drblLeaders.length
        ? ([["drbl", "DRBL"]] as const)
        : []),
      ["darko", "DARKO"],
      ["ts", "TS%"],
      ["usage", "USG"],
    ] as const
  );

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Top performers
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Overview with{" "}
            {drblOverlayOk ? (
              <>
                <MetricHelp conceptId="drbl">DRBL/100</MetricHelp>
                {" (primary), "}
                <MetricHelp conceptId="darko">DARKO</MetricHelp>
                {" (comparison), "}
              </>
            ) : (
              <>
                <MetricHelp conceptId="darko">DARKO</MetricHelp>
                {", "}
              </>
            )}
            <MetricHelp conceptId="ts">TS%</MetricHelp>, and{" "}
            <MetricHelp conceptId="usg">USG</MetricHelp> — sort to reorder.
          </p>
          {drblFallbackNote ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {drblFallbackNote}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {sortChips.map(([key, label]) => (
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
        <div className="grid grid-cols-[minmax(0,1fr)_52px_52px_52px_52px] gap-1 border-b border-border bg-secondary/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Player</span>
          <span className="text-right">
            <MetricHelp
              conceptId="drbl"
              labelClassName="text-[10px] font-semibold uppercase tracking-wide"
            >
              DRBL
            </MetricHelp>
          </span>
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
              <div className="grid grid-cols-[minmax(0,1fr)_52px_52px_52px_52px] items-center gap-1 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">
                    {row.rank}
                  </span>
                  <PlayerIdentity
                    playerId={row.id}
                    name={row.name}
                    nbaId={row.nbaId}
                    teamKey={row.teamKey}
                    teamLabel={row.teamLabel}
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
                    row.drbl != null ? formatNumber(row.drbl, 2) : "-"
                  }
                  emphasize={sort === "drbl"}
                />
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
              : sort === "drbl"
                ? "/explore/players?sort=drbl100&dir=desc"
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
