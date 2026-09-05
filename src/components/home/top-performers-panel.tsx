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
  HomeRaptorLeader,
  HomePerformerSeason,
} from "@/data/queries/home";
import type { PlayerSeason } from "@/data/types";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { formatNumber } from "@/lib/format";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";
import { formatImpact, formatPct } from "@/lib/stat-explainers";
import { textLinkClassName, type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type SortKey = "war1" | "drbl" | "darko" | "raptor" | "ts" | "usage";

type OverviewRow = {
  key: string;
  rank: number;
  id: string;
  nbaId?: string;
  name: string;
  /** Canonical ESPN id or abbr - safe for TeamLogo. */
  teamKey?: string;
  teamLabel?: string;
  war1: number | null;
  drbl: number | null;
  darko: number | null;
  raptor: number | null;
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
  raptorLeaders = [],
  tsLeaders,
  usageStars,
  performerSeasons = [],
  drblOverlayOk = false,
  drblFallbackNote = null,
}: {
  season?: string;
  drblLeaders?: HomeDrblLeader[];
  darkoLeaders: HomeDarkoLeader[];
  raptorLeaders?: HomeRaptorLeader[];
  tsLeaders: PlayerSeason[];
  usageStars: PlayerSeason[];
  performerSeasons?: HomePerformerSeason[];
  drblOverlayOk?: boolean;
  drblFallbackNote?: string | null;
}) {
  const [sort, setSort] = useState<SortKey>(drblOverlayOk ? "war1" : "darko");

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

  const raptorByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of raptorLeaders) {
      map.set(normalizePlayerName(p.playerName), p.impact);
    }
    return map;
  }, [raptorLeaders]);

  const drblByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of drblLeaders) {
      const nameKey = normalizePlayerName(p.playerName);
      if (nameKey) map.set(nameKey, p.drbl100);
    }
    return map;
  }, [drblLeaders]);

  const war1ByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of drblLeaders) {
      const nameKey = normalizePlayerName(p.playerName);
      if (nameKey && p.war1 != null && Number.isFinite(p.war1)) {
        map.set(nameKey, p.war1);
      }
    }
    return map;
  }, [drblLeaders]);

  const drblByNbaId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of drblLeaders) {
      const id = String(p.nbaPlayerId || p.playerId || "").trim();
      if (id) map.set(id, p.drbl100);
    }
    return map;
  }, [drblLeaders]);

  const war1ByNbaId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of drblLeaders) {
      const id = String(p.nbaPlayerId || p.playerId || "").trim();
      if (id && p.war1 != null && Number.isFinite(p.war1)) {
        map.set(id, p.war1);
      }
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
        war1: partial.war1 ?? existing.war1,
        drbl: partial.drbl ?? existing.drbl,
        darko: partial.darko ?? existing.darko,
        raptor: partial.raptor ?? existing.raptor,
        ts: partial.ts ?? existing.ts,
        usg: partial.usg ?? existing.usg,
      });
    };

    for (const p of drblLeaders) {
      const key =
        normalizePlayerName(p.playerName) ||
        `nba:${p.nbaPlayerId || p.playerId}`;
      const season = seasonByName.get(normalizePlayerName(p.playerName));
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
        war1: p.war1 ?? null,
        drbl: p.drbl100,
        darko: p.darko ?? darkoByName.get(normalizePlayerName(p.playerName)) ?? null,
        raptor: raptorByName.get(normalizePlayerName(p.playerName)) ?? null,
        ts: p.trueShootingPct ?? season?.ts ?? null,
        usg: p.usagePct ?? season?.usg ?? null,
      });
    }

    for (const p of darkoLeaders) {
      const key = normalizePlayerName(p.playerName);
      const season = seasonByName.get(key);
      const fromDarko = teamIdentityFromLoose(p.teamAbbr ?? p.teamName);
      const nbaKey = String(p.nbaPlayerId ?? "").trim();
      upsert({
        key,
        id: p.profileId,
        nbaId: p.nbaPlayerId,
        name: p.playerName,
        teamKey: season?.teamKey ?? fromDarko.teamKey,
        teamLabel: season?.teamLabel ?? fromDarko.teamLabel,
        war1:
          war1ByName.get(key) ??
          (nbaKey ? war1ByNbaId.get(nbaKey) ?? null : null),
        drbl:
          drblByName.get(key) ??
          (nbaKey ? drblByNbaId.get(nbaKey) ?? null : null),
        darko: p.impact,
        raptor: raptorByName.get(key) ?? null,
        ts: p.trueShootingPct ?? season?.ts ?? null,
        usg: p.usagePct ?? season?.usg ?? null,
      });
    }

    for (const p of raptorLeaders) {
      const key = normalizePlayerName(p.playerName);
      const season = seasonByName.get(key);
      const fromRaptorTeam = teamIdentityFromLoose(p.teamAbbr ?? p.teamName);
      const nbaKey = String(p.nbaPlayerId ?? "").trim();
      upsert({
        key,
        id: p.profileId,
        nbaId: p.nbaPlayerId,
        name: p.playerName,
        teamKey: season?.teamKey ?? fromRaptorTeam.teamKey,
        teamLabel: season?.teamLabel ?? fromRaptorTeam.teamLabel,
        war1:
          war1ByName.get(key) ??
          (nbaKey ? war1ByNbaId.get(nbaKey) ?? null : null),
        drbl:
          drblByName.get(key) ??
          (nbaKey ? drblByNbaId.get(nbaKey) ?? null : null),
        darko: darkoByName.get(key) ?? null,
        raptor: p.impact,
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
        war1: war1ByName.get(key) ?? null,
        drbl: drblByName.get(key) ?? null,
        darko: darkoByName.get(key) ?? null,
        raptor: raptorByName.get(key) ?? null,
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
        war1: war1ByName.get(key) ?? null,
        drbl: drblByName.get(key) ?? null,
        darko: darkoByName.get(key) ?? null,
        raptor: raptorByName.get(key) ?? null,
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
      const pick = (row: OverviewRow) => {
        if (sort === "ts") return row.ts;
        if (sort === "usage") return row.usg;
        if (sort === "war1") return row.war1;
        if (sort === "drbl") return row.drbl;
        if (sort === "raptor") return row.raptor;
        return row.darko;
      };
      return (pick(b) ?? -Infinity) - (pick(a) ?? -Infinity);
    });

    return list.slice(0, 10).map((row, i) => ({ ...row, rank: i + 1 }));
  }, [
    sort,
    drblLeaders,
    darkoLeaders,
    raptorLeaders,
    tsLeaders,
    usageStars,
    seasonByName,
    darkoByName,
    raptorByName,
    drblByName,
    drblByNbaId,
    war1ByName,
    war1ByNbaId,
  ]);

  const sortChips = (
    [
      ...(drblOverlayOk || drblLeaders.length
        ? ([
            ["war1", "WAR1"],
            ["drbl", "DRBL"],
          ] as const)
        : []),
      ["darko", "DARKO"],
      ...(raptorLeaders.length ? ([["raptor", "RAPTOR"]] as const) : []),
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
    ) : sort === "war1" ? (
      <MetricHelp
        conceptId="r1_win_eq"
        labelClassName={cn(type.caption, "font-semibold uppercase tracking-wide")}
      >
        WAR1
      </MetricHelp>
    ) : sort === "drbl" ? (
      <MetricHelp
        conceptId="drbl"
        labelClassName={cn(type.caption, "font-semibold uppercase tracking-wide")}
      >
        DRBL
      </MetricHelp>
    ) : sort === "raptor" ? (
      <MetricHelp
        conceptId="raptor"
        labelClassName={cn(type.caption, "font-semibold uppercase tracking-wide")}
      >
        RAPTOR
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
        : sort === "war1"
          ? "/explore/players?sort=r1WinEquivalents&dir=desc"
          : sort === "drbl"
            ? "/explore/players?sort=drbl100&dir=desc"
            : sort === "raptor"
              ? "/explore/players?season=2021-22&sort=raptor&dir=desc"
              : "/explore/players?sort=darkoDpm";

  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-[21px]">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h2 className="type-heading min-w-0 wrap-break-word">
            {season ? `${season} Top Performers` : "Top performers"}
          </h2>
          <TextLink
            href={leaderboardHref}
            className="type-body-sm shrink-0 pt-0.5 text-muted-foreground"
          >
            <span className="sm:hidden">Leaderboard →</span>
            <span className="hidden sm:inline">See full leaderboard →</span>
          </TextLink>
        </div>
        <div className="-mx-1 flex flex-nowrap gap-1 touch-scroll-x px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sortChips.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={cn(
                "glass-pill shrink-0 rounded-md px-2.5 py-1 type-caption font-semibold transition-colors",
                sort === key
                  ? "glass-pill-active"
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
                  : sort === "war1"
                    ? row.war1 != null
                      ? formatNumber(row.war1, 1)
                      : "-"
                    : sort === "drbl"
                      ? row.drbl != null
                        ? formatNumber(row.drbl, 2)
                        : "-"
                      : sort === "raptor"
                        ? row.raptor != null
                          ? formatImpact(row.raptor)
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
                        "min-w-0 flex-1"
                      )}
                    >
                      <BoardPlayerName name={row.name} />
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
