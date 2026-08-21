"use client";

import { useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TextLink } from "@/components/ui/text-link";
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
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type SortKey = "drbl" | "darko" | "ts" | "usage";

type OverviewRow = {
  key: string;
  rank: number;
  id: string;
  nbaId?: string;
  name: string;
  /** Canonical ESPN id or abbr - safe for TeamLogo. */
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
  // Reject raw long provider numerics here - parent should already normalize.
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
  season,
  drblLeaders = [],
  darkoLeaders,
  tsLeaders,
  usageStars,
  performerSeasons = [],
  drblOverlayOk = false,
  drblFallbackNote = null,
}: {
  season?: string;
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

  const metricHelp =
    sort === "ts" ? (
      <MetricHelp
        conceptId="ts"
        labelClassName={cn(type.caption, "font-semibold uppercase tracking-wide")}
      >
        TS%
      </MetricHelp>
    ) : sort === "usage" ? (
      <MetricHelp
        conceptId="usg"
        labelClassName={cn(type.caption, "font-semibold uppercase tracking-wide")}
      >
        USG
      </MetricHelp>
    ) : sort === "drbl" ? (
      <MetricHelp
        conceptId="drbl"
        labelClassName={cn(type.caption, "font-semibold uppercase tracking-wide")}
      >
        DRBL
      </MetricHelp>
    ) : (
      <MetricHelp
        conceptId="darko"
        labelClassName={cn(type.caption, "font-semibold uppercase tracking-wide")}
      >
        DPM
      </MetricHelp>
    );

  const leaderboardHref =
    sort === "ts"
      ? "/explore/players?sort=trueShootingPct"
      : sort === "usage"
        ? "/explore/players?sort=usagePct"
        : sort === "drbl"
          ? "/explore/players?sort=drbl100&dir=desc"
          : "/explore/players?sort=darkoDpm";

  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-[21px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="type-heading">
            {season ? `${season} Top Performers` : "Top performers"}
          </h2>
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
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {drblFallbackNote ? (
            <p className="text-[12px] text-muted-foreground">
              {drblFallbackNote}
            </p>
          ) : null}
        </div>
        <TextLink
          href={leaderboardHref}
          className="type-body-sm shrink-0 pt-0.5 text-muted-foreground"
        >
          See full leaderboard →
        </TextLink>
      </div>

      <div className="overflow-hidden">
        <div
          className={cn(
            "flex items-center justify-between gap-2 border-b border-border px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground",
            type.caption
          )}
        >
          <span>Player</span>
          <span className="text-right">{metricHelp}</span>
        </div>
        <ol className="divide-y divide-black/5">
          {rows.map((row) => {
            const value =
              sort === "ts"
                ? row.ts != null
                  ? formatPct(row.ts)
                  : "-"
                : sort === "usage"
                  ? row.usg != null
                    ? formatPct(row.usg)
                    : "-"
                  : sort === "drbl"
                    ? row.drbl != null
                      ? formatNumber(row.drbl, 2)
                      : "-"
                    : row.darko != null
                      ? formatImpact(row.darko)
                      : "-";
            return (
              <li key={row.key}>
                <div className="flex items-center gap-2 px-3 py-2.5">
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
                    nameClassName="w-full gap-2"
                  >
                    {row.teamKey ? (
                      <TeamLogo teamKey={row.teamKey} size="xs" />
                    ) : null}
                    <PlayerHeadshot
                      playerId={row.id}
                      nbaId={row.nbaId}
                      name={row.name}
                      teamKey={row.teamKey}
                      size="xs"
                    />
                    <span
                      className={cn(
                        type.body,
                        textLinkClassName,
                        "min-w-0 flex-1 truncate"
                      )}
                    >
                      {row.name}
                    </span>
                  </PlayerIdentity>
                  <span className="shrink-0 text-right text-[12px] font-medium tabular-nums text-[#535353]">
                    {value}
                  </span>
                </div>
              </li>
            );
          })}
          {rows.length === 0 ? (
            <li className="type-body-sm px-3 py-6 text-center text-muted-foreground">
              Leaders unavailable.
            </li>
          ) : null}
        </ol>
      </div>
    </section>
  );
}
