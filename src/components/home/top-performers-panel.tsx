"use client";

import { useMemo, useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import { SectionLink } from "@/components/ui/section-link";
import type {
  HomeDarkoLeader,
  HomeDrblLeader,
  HomeRaptorLeader,
  HomePerformerSeason,
} from "@/data/queries/home";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { formatNumber } from "@/lib/format";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";
import { formatImpact, formatPct } from "@/lib/stat-explainers";
import { type } from "@/lib/design-system";
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

function teamIdentityFromPerformer(row?: HomePerformerSeason | null): {
  teamKey?: string;
  teamLabel?: string;
} {
  if (!row) return {};
  if (row.teamKey) {
    return { teamKey: row.teamKey, teamLabel: row.teamAbbr };
  }
  if (row.teamAbbr) {
    const resolved = resolveCanonicalTeam(row.teamAbbr);
    if (resolved.status === "resolved") {
      return {
        teamKey: resolved.team.canonicalTeamId,
        teamLabel: resolved.team.abbr,
      };
    }
    return { teamLabel: row.teamAbbr };
  }
  return {};
}

function teamIdentityFromLoose(
  raw?: string | null
): { teamKey?: string; teamLabel?: string } {
  if (!raw?.trim()) return {};
  const token = raw.trim();
  // Short tokens / names go through brand first; long NBA Stats ids skip brand.
  if (!/^\d{6,}$/.test(token)) {
    const brand = resolveTeamBrand(token);
    if (brand) return { teamKey: brand.espnTeamId, teamLabel: brand.abbr };
  }
  const resolved = resolveCanonicalTeam(token);
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
  /** Compact TS%/USG rows — never full PlayerSeason (keeps homepage Flight small). */
  tsLeaders: HomePerformerSeason[];
  usageStars: HomePerformerSeason[];
  performerSeasons?: HomePerformerSeason[];
  drblOverlayOk?: boolean;
  drblFallbackNote?: string | null;
}) {
  const [sort, setSort] = useState<SortKey>(
    drblOverlayOk ? "war1" : darkoLeaders.length ? "darko" : "ts"
  );

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
      const team = teamIdentityFromPerformer(row);
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
      const fromDarkoId = teamIdentityFromLoose(p.teamId);
      const nbaKey = String(p.nbaPlayerId ?? "").trim();
      upsert({
        key,
        id: p.profileId,
        nbaId: p.nbaPlayerId,
        name: p.playerName,
        teamKey:
          p.teamKey ??
          season?.teamKey ??
          fromDarko.teamKey ??
          fromDarkoId.teamKey,
        teamLabel:
          p.teamAbbr ??
          season?.teamLabel ??
          fromDarko.teamLabel ??
          fromDarkoId.teamLabel,
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
      const fromRaptorId = teamIdentityFromLoose(p.teamId);
      const nbaKey = String(p.nbaPlayerId ?? "").trim();
      upsert({
        key,
        id: p.profileId,
        nbaId: p.nbaPlayerId,
        name: p.playerName,
        teamKey:
          p.teamKey ??
          season?.teamKey ??
          fromRaptorTeam.teamKey ??
          fromRaptorId.teamKey,
        teamLabel:
          p.teamAbbr ??
          season?.teamLabel ??
          fromRaptorTeam.teamLabel ??
          fromRaptorId.teamLabel,
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
      const team = teamIdentityFromPerformer(p);
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
      const team = teamIdentityFromPerformer(p);
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
      ...(darkoLeaders.length ? ([["darko", "DARKO"]] as const) : []),
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
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h2 className="type-heading min-w-0 whitespace-nowrap">
            {season ? `${season} top performers` : "Top performers"}
          </h2>
          <SectionLink href={leaderboardHref} className="pt-0.5">
            See all
          </SectionLink>
        </div>
        <ChoiceTrack scrollable className="border-0 bg-transparent p-0">
          {sortChips.map(([key, label]) => (
            <ChoiceChip
              key={key}
              active={sort === key}
              onClick={() => setSort(key)}
              className="shrink-0"
            >
              {label}
            </ChoiceChip>
          ))}
        </ChoiceTrack>
        {drblFallbackNote ? (
          <p className="text-[12px] text-muted-foreground">
            {drblFallbackNote}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left">
          <colgroup>
            <col className="w-7" />
            <col />
            <col className="w-16" />
          </colgroup>
          <thead className="border-b border-border/40 bg-secondary/50">
            <tr>
              <th className="py-2 pl-3 pr-1 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                #
              </th>
              <th className="py-2 pl-2 pr-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Player
              </th>
              <th className="py-2 pl-1 pr-3 text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {metricHelp}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const value =
                sort === "ts"
                  ? row.ts != null
                    ? formatPct(row.ts)
                    : "—"
                  : sort === "usage"
                    ? row.usg != null
                      ? formatPct(row.usg)
                      : "—"
                    : sort === "war1"
                      ? row.war1 != null
                        ? formatNumber(row.war1, 1)
                        : "—"
                      : sort === "drbl"
                        ? row.drbl != null
                          ? formatNumber(row.drbl, 2)
                          : "—"
                        : sort === "raptor"
                          ? row.raptor != null
                            ? formatImpact(row.raptor)
                            : "—"
                          : row.darko != null
                            ? formatImpact(row.darko)
                            : "—";
              return (
                <tr
                  key={row.key}
                  data-motion="row"
                  className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                >
                  <td className="py-2 pl-3 pr-1 text-[12px] font-bold tabular-nums text-muted-foreground">
                    {row.rank}
                  </td>
                  <td className="min-w-0 py-2 pl-2 pr-2">
                    <PlayerIdentity
                      playerId={row.id}
                      name={row.name}
                      nbaId={row.nbaId}
                      teamKey={row.teamKey}
                      teamLabel={row.teamLabel}
                      variant="compact"
                      className="min-w-0"
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
                          type.bodySm,
                          "min-w-0 flex-1 truncate font-semibold underline-offset-2 hover:underline"
                        )}
                      >
                        <BoardPlayerName name={row.name} />
                      </span>
                    </PlayerIdentity>
                  </td>
                  <td className="type-caption py-2 pl-1 pr-3 text-right font-medium tabular-nums">
                    {value}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="type-body-sm px-3 py-6 text-center text-muted-foreground">
                  Leaders unavailable.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
