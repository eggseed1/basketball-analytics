import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import {
  buildStatContext,
  computeCareerResume,
  computePlayerEvolution,
  dedupeCareerSeasons,
  explainMetric,
  isCareerQualifyingSeason,
} from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerAskLinks, askDrblHref } from "@/components/players/player-ask-links";
import { PlayerCareerResume } from "@/components/players/player-career-resume";
import { PlayerContextStrip } from "@/components/players/player-context-strip";
import { PlayerEvolutionPanel } from "@/components/players/player-evolution-panel";
import { PlayerNotableGames } from "@/components/players/player-notable-games";
import { PlayerPageNav } from "@/components/players/player-page-nav";
import { PlayerSeasonExplorer } from "@/components/players/player-season-explorer";
import { PlayerSeasonAnalysisControl } from "@/components/players/player-season-rank-view";
import {
  PlayerPercentilePanel,
  type PercentileCategory,
  type PercentileMetric,
} from "@/components/players/player-percentile-panel";
import { defaultRankSeasons } from "@/analytics/rank-player-seasons";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  getFilteredPlayerSeasons,
  getPlayer,
  getPlayerCareerSeasons,
  getPlayerGameLog,
  getPlayerSeason,
} from "@/data/queries";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand, teamChartColor } from "@/lib/nba-brand";
import {
  findSimilarForMetric,
  shiftCanonicalSeason,
} from "@/lib/player-stat-comps";
import type { PlayerSeason } from "@/data/types";
import { cn } from "@/lib/utils";

interface PlayerPageProps {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PlayerPageProps) {
  const { playerId } = await params;
  const player = await getPlayer(playerId);
  return {
    title: player
      ? `${player.fullName} | Basketball Analytics`
      : "Player | Basketball Analytics",
  };
}

function percentileOf(value: number, pool: number[]): number {
  if (!pool.length || !Number.isFinite(value)) return 50;
  const below = pool.filter((v) => v < value).length;
  return (below / pool.length) * 100;
}

function perGame(row: PlayerSeason, key: keyof PlayerSeason): number {
  const raw = row[key];
  const total = typeof raw === "number" ? raw : 0;
  return total / Math.max(1, row.gamesPlayed);
}

function buildMetrics(
  seasonStats: PlayerSeason | null,
  career: PlayerSeason[],
  peers: PlayerSeason[],
  historicalPeers: PlayerSeason[],
  focalPlayerId: string
): PercentileMetric[] {
  if (!seasonStats) return [];

  const qualified = peers.filter(
    (p) =>
      p.gamesPlayed >= 15 &&
      p.minutes / Math.max(1, p.gamesPlayed) >= 12
  );
  const pool = qualified.length ? qualified : peers;

  const historicalPool = historicalPeers.filter(
    (p) =>
      p.gamesPlayed >= 15 &&
      p.minutes / Math.max(1, p.gamesPlayed) >= 12
  );

  const careerSeries = (
    pick: (row: PlayerSeason) => number | null | undefined,
    options?: { rejectFlatOverlay?: boolean }
  ) => {
    // One row per season (trade seasons → max GP) so charts aren't duplicated.
    const bySeason = new Map<string, PlayerSeason>();
    for (const r of career) {
      const existing = bySeason.get(r.season);
      if (!existing || r.gamesPlayed > existing.gamesPlayed) {
        bySeason.set(r.season, r);
      }
    }
    const points = [...bySeason.values()]
      .sort((a, b) => a.season.localeCompare(b.season))
      .map((r) => {
        const v = pick(r);
        if (v == null || !Number.isFinite(v)) return null;
        const { color, abbr } = teamChartColor(r.teamId);
        return {
          season: r.season.slice(2),
          value: v,
          teamId: r.teamId,
          teamAbbr: abbr,
          color,
        };
      })
      .filter(
        (
          x
        ): x is {
          season: string;
          value: number;
          teamId: string;
          teamAbbr: string;
          color: string;
        } => x != null
      );

    // Live impact overlays used to be stamped on every career year → flat line.
    // Drop series that are effectively constant (not a real career trend).
    if (options?.rejectFlatOverlay && points.length > 1) {
      const first = points[0]!.value;
      const allSame = points.every((p) => Math.abs(p.value - first) < 1e-6);
      if (allSame) return [];
    }
    return points;
  };

  const metrics: PercentileMetric[] = [];

  const push = (opts: {
    id: string;
    category: PercentileCategory;
    label: string;
    value: number;
    values: number[];
    display: string;
    series: Array<{
      season: string;
      value: number;
      teamId: string;
      teamAbbr: string;
      color: string;
    }>;
    /** When true, lower values rank higher (e.g. turnovers). */
    invert?: boolean;
  }) => {
    if (!Number.isFinite(opts.value) || opts.values.length === 0) return;
    const raw = percentileOf(opts.value, opts.values);
    const percentile = opts.invert ? 100 - raw : raw;
    const comps = findSimilarForMetric({
      metricId: opts.id,
      focalPlayerId,
      focalValue: opts.value,
      leagueRows: pool,
      historicalRows: historicalPool,
      limit: 6,
    });
    metrics.push({
      id: opts.id,
      category: opts.category,
      label: opts.label,
      percentile,
      display: opts.display,
      value: opts.value,
      series: opts.series,
      leagueComps: comps.leagueComps,
      historicalComps: comps.historicalComps,
    });
  };

  // --- Value ---
  if (seasonStats.darkoDpm != null) {
    const darkoPool = pool
      .map((p) => p.darkoDpm)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (darkoPool.length) {
      push({
        id: "darko",
        category: "value",
        label: "DARKO DPM",
        value: seasonStats.darkoDpm,
        values: darkoPool,
        display: formatNumber(seasonStats.darkoDpm, 2),
        series: careerSeries((r) => r.darkoDpm, { rejectFlatOverlay: true }),
      });
    }
  }
  if (seasonStats.lebron != null) {
    const lebronPool = pool
      .map((p) => p.lebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (lebronPool.length) {
      push({
        id: "lebron",
        category: "value",
        label: "LEBRON",
        value: seasonStats.lebron,
        values: lebronPool,
        display: formatNumber(seasonStats.lebron, 2),
        series: careerSeries((r) => r.lebron, { rejectFlatOverlay: true }),
      });
    }
  }
  if (seasonStats.winsAdded != null) {
    const waPool = pool
      .map((p) => p.winsAdded)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (waPool.length) {
      push({
        id: "wins",
        category: "value",
        label: "Wins added",
        value: seasonStats.winsAdded,
        values: waPool,
        display: formatNumber(seasonStats.winsAdded, 2),
        series: careerSeries((r) => r.winsAdded, { rejectFlatOverlay: true }),
      });
    }
  }
  if (seasonStats.netRating !== 0) {
    push({
      id: "net",
      category: "value",
      label: "Net rating",
      value: seasonStats.netRating,
      values: pool.map((p) => p.netRating).filter((n) => Number.isFinite(n)),
      display: formatNumber(seasonStats.netRating, 1),
      series: careerSeries((r) =>
        r.netRating !== 0 ? r.netRating : null
      ),
    });
  }

  // --- Offense ---
  const ppg = perGame(seasonStats, "points");
  push({
    id: "pts",
    category: "offense",
    label: "Points",
    value: ppg,
    values: pool.map((p) => perGame(p, "points")),
    display: `${formatNumber(ppg, 1)} PPG`,
    series: careerSeries((r) => perGame(r, "points")),
  });

  const apg = perGame(seasonStats, "assists");
  push({
    id: "ast",
    category: "offense",
    label: "Assists",
    value: apg,
    values: pool.map((p) => perGame(p, "assists")),
    display: `${formatNumber(apg, 1)} APG`,
    series: careerSeries((r) => perGame(r, "assists")),
  });

  const rpg = perGame(seasonStats, "rebounds");
  push({
    id: "reb",
    category: "offense",
    label: "Rebounds",
    value: rpg,
    values: pool.map((p) => perGame(p, "rebounds")),
    display: `${formatNumber(rpg, 1)} RPG`,
    series: careerSeries((r) => perGame(r, "rebounds")),
  });

  if (seasonStats.darkoOff != null) {
    const offPool = pool
      .map((p) => p.darkoOff)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (offPool.length) {
      push({
        id: "darko-off",
        category: "offense",
        label: "DARKO offense",
        value: seasonStats.darkoOff,
        values: offPool,
        display: formatNumber(seasonStats.darkoOff, 2),
        series: careerSeries((r) => r.darkoOff, { rejectFlatOverlay: true }),
      });
    }
  }
  if (seasonStats.oLebron != null) {
    const oPool = pool
      .map((p) => p.oLebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (oPool.length) {
      push({
        id: "olebron",
        category: "offense",
        label: "O-LEBRON",
        value: seasonStats.oLebron,
        values: oPool,
        display: formatNumber(seasonStats.oLebron, 2),
        series: careerSeries((r) => r.oLebron, { rejectFlatOverlay: true }),
      });
    }
  }
  if (seasonStats.offensiveRating > 0) {
    push({
      id: "ortg",
      category: "offense",
      label: "Offensive rating",
      value: seasonStats.offensiveRating,
      values: pool
        .map((p) => p.offensiveRating)
        .filter((n) => n > 0),
      display: formatNumber(seasonStats.offensiveRating, 1),
      series: careerSeries((r) =>
        r.offensiveRating > 0 ? r.offensiveRating : null
      ),
    });
  }

  // --- Shooting ---
  if (seasonStats.trueShootingPct > 0) {
    push({
      id: "ts",
      category: "shooting",
      label: "True shooting",
      value: seasonStats.trueShootingPct,
      values: pool.map((p) => p.trueShootingPct).filter((n) => n > 0),
      display: formatPct(seasonStats.trueShootingPct),
      series: careerSeries((r) =>
        r.trueShootingPct > 0 ? r.trueShootingPct * 100 : null
      ),
    });
  }
  if (seasonStats.effectiveFieldGoalPct > 0) {
    push({
      id: "efg",
      category: "shooting",
      label: "Effective FG%",
      value: seasonStats.effectiveFieldGoalPct,
      values: pool.map((p) => p.effectiveFieldGoalPct).filter((n) => n > 0),
      display: formatPct(seasonStats.effectiveFieldGoalPct),
      series: careerSeries((r) =>
        r.effectiveFieldGoalPct > 0 ? r.effectiveFieldGoalPct * 100 : null
      ),
    });
  }
  if (seasonStats.fieldGoalPct > 0) {
    push({
      id: "fg",
      category: "shooting",
      label: "Field goal %",
      value: seasonStats.fieldGoalPct,
      values: pool.map((p) => p.fieldGoalPct).filter((n) => n > 0),
      display: formatPct(seasonStats.fieldGoalPct),
      series: careerSeries((r) =>
        r.fieldGoalPct > 0 ? r.fieldGoalPct * 100 : null
      ),
    });
  }
  if (seasonStats.threePointPct > 0) {
    push({
      id: "fg3",
      category: "shooting",
      label: "Three-point %",
      value: seasonStats.threePointPct,
      values: pool.map((p) => p.threePointPct).filter((n) => n > 0),
      display: formatPct(seasonStats.threePointPct),
      series: careerSeries((r) =>
        r.threePointPct > 0 ? r.threePointPct * 100 : null
      ),
    });
  }
  if (seasonStats.freeThrowPct > 0) {
    push({
      id: "ft",
      category: "shooting",
      label: "Free-throw %",
      value: seasonStats.freeThrowPct,
      values: pool.map((p) => p.freeThrowPct).filter((n) => n > 0),
      display: formatPct(seasonStats.freeThrowPct),
      series: careerSeries((r) =>
        r.freeThrowPct > 0 ? r.freeThrowPct * 100 : null
      ),
    });
  }

  // --- Defense ---
  const spg = perGame(seasonStats, "steals");
  push({
    id: "stl",
    category: "defense",
    label: "Steals",
    value: spg,
    values: pool.map((p) => perGame(p, "steals")),
    display: `${formatNumber(spg, 1)} SPG`,
    series: careerSeries((r) => perGame(r, "steals")),
  });
  const bpg = perGame(seasonStats, "blocks");
  push({
    id: "blk",
    category: "defense",
    label: "Blocks",
    value: bpg,
    values: pool.map((p) => perGame(p, "blocks")),
    display: `${formatNumber(bpg, 1)} BPG`,
    series: careerSeries((r) => perGame(r, "blocks")),
  });
  if (seasonStats.darkoDef != null) {
    const defPool = pool
      .map((p) => p.darkoDef)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (defPool.length) {
      push({
        id: "darko-def",
        category: "defense",
        label: "DARKO defense",
        value: seasonStats.darkoDef,
        values: defPool,
        display: formatNumber(seasonStats.darkoDef, 2),
        series: careerSeries((r) => r.darkoDef, { rejectFlatOverlay: true }),
      });
    }
  }
  if (seasonStats.dLebron != null) {
    const dPool = pool
      .map((p) => p.dLebron)
      .filter((n): n is number => n != null && Number.isFinite(n));
    if (dPool.length) {
      push({
        id: "dlebron",
        category: "defense",
        label: "D-LEBRON",
        value: seasonStats.dLebron,
        values: dPool,
        display: formatNumber(seasonStats.dLebron, 2),
        series: careerSeries((r) => r.dLebron, { rejectFlatOverlay: true }),
      });
    }
  }
  if (seasonStats.defensiveRating > 0) {
    push({
      id: "drtg",
      category: "defense",
      label: "Defensive rating",
      value: seasonStats.defensiveRating,
      values: pool
        .map((p) => p.defensiveRating)
        .filter((n) => n > 0),
      display: formatNumber(seasonStats.defensiveRating, 1),
      series: careerSeries((r) =>
        r.defensiveRating > 0 ? r.defensiveRating : null
      ),
      invert: true,
    });
  }

  // --- Advanced ---
  if (seasonStats.usagePct > 0) {
    push({
      id: "usg",
      category: "advanced",
      label: "Usage",
      value: seasonStats.usagePct,
      values: pool.map((p) => p.usagePct).filter((n) => n > 0),
      display: formatPct(seasonStats.usagePct),
      series: careerSeries((r) => (r.usagePct > 0 ? r.usagePct * 100 : null)),
    });
  }

  const mpg = perGame(seasonStats, "minutes");
  if (mpg > 0) {
    push({
      id: "min",
      category: "advanced",
      label: "Minutes",
      value: mpg,
      values: pool.map((p) => perGame(p, "minutes")).filter((n) => n > 0),
      display: `${formatNumber(mpg, 1)} MPG`,
      series: careerSeries((r) => {
        const m = perGame(r, "minutes");
        return m > 0 ? m : null;
      }),
    });
  }

  const tpg = perGame(seasonStats, "turnovers");
  if (tpg > 0) {
    push({
      id: "tov",
      category: "advanced",
      label: "Turnovers",
      value: tpg,
      values: pool.map((p) => perGame(p, "turnovers")).filter((n) => n > 0),
      display: `${formatNumber(tpg, 1)} TPG`,
      series: careerSeries((r) => {
        const t = perGame(r, "turnovers");
        return t > 0 ? t : null;
      }),
      invert: true,
    });
  }
  if (tpg > 0 && apg > 0) {
    const atr = apg / tpg;
    push({
      id: "atr",
      category: "advanced",
      label: "Assist / turnover",
      value: atr,
      values: pool
        .map((p) => {
          const a = perGame(p, "assists");
          const t = perGame(p, "turnovers");
          return t > 0 ? a / t : null;
        })
        .filter((n): n is number => n != null),
      display: formatNumber(atr, 2),
      series: careerSeries((r) => {
        const a = perGame(r, "assists");
        const t = perGame(r, "turnovers");
        return t > 0 ? a / t : null;
      }),
    });
  }

  return metrics;
}

export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const career = await getPlayerCareerSeasons(playerId);
  const seasonOptions = [
    ...new Set(career.map((row) => row.season)),
  ].sort((a, b) => b.localeCompare(a));

  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const season = seasonParam ?? seasonOptions[0] ?? "2024-25";

  const priorSeasons = [1, 2, 3].map((n) =>
    shiftCanonicalSeason(season, -n)
  );

  const [player, seasonRaw, gameLog, peers, ...priorBoards] = await Promise.all([
    getPlayer(playerId),
    getPlayerSeason(playerId, season),
    getPlayerGameLog(playerId, season),
    getFilteredPlayerSeasons({
      season,
      minimumGames: 15,
    }).catch(() => [] as PlayerSeason[]),
    ...priorSeasons.map((s) =>
      getFilteredPlayerSeasons({ season: s, minimumGames: 15 }).catch(
        () => [] as PlayerSeason[]
      )
    ),
  ]);

  if (!player && career.length === 0) notFound();

  const careerSeason = career.find((row) => row.season === season);
  const peerRow = peers.find((row) => row.playerId === playerId);
  const seasonStats: PlayerSeason | null = seasonRaw
    ? {
        ...seasonRaw,
        usagePct:
          seasonRaw.usagePct > 0
            ? seasonRaw.usagePct
            : peerRow?.usagePct ?? careerSeason?.usagePct ?? 0,
        darkoDpm:
          seasonRaw.darkoDpm ??
          careerSeason?.darkoDpm ??
          peerRow?.darkoDpm,
        darkoOff:
          seasonRaw.darkoOff ??
          careerSeason?.darkoOff ??
          peerRow?.darkoOff,
        darkoDef:
          seasonRaw.darkoDef ??
          careerSeason?.darkoDef ??
          peerRow?.darkoDef,
        lebron: seasonRaw.lebron ?? careerSeason?.lebron ?? peerRow?.lebron,
        oLebron:
          seasonRaw.oLebron ?? careerSeason?.oLebron ?? peerRow?.oLebron,
        dLebron:
          seasonRaw.dLebron ?? careerSeason?.dLebron ?? peerRow?.dLebron,
        winsAdded:
          seasonRaw.winsAdded ??
          careerSeason?.winsAdded ??
          peerRow?.winsAdded,
      }
    : peerRow ?? careerSeason ?? null;

  const historicalPeers = priorBoards.flat();
  const displayName = player?.fullName ?? career[0]?.playerName ?? playerId;
  const teamKey = seasonStats?.teamId;
  const brand = resolveTeamBrand(teamKey);
  const recentSeasons = career.slice(0, 5);

  // Primary team per season (max GP) — timeline + chart theming.
  const seasonTeams: Record<string, string> = {};
  for (const row of career) {
    const existing = seasonTeams[row.season];
    if (!existing) {
      seasonTeams[row.season] = row.teamId;
      continue;
    }
    const existingRow = career.find(
      (r) => r.season === row.season && r.teamId === existing
    );
    if (!existingRow || row.gamesPlayed > existingRow.gamesPlayed) {
      seasonTeams[row.season] = row.teamId;
    }
  }
  const careerChrono = Object.keys(seasonTeams).sort((a, b) =>
    a.localeCompare(b)
  );
  const careerStartTeamKey = careerChrono.length
    ? seasonTeams[careerChrono[0]!]
    : teamKey;

  const metrics = buildMetrics(
    seasonStats,
    career,
    peers,
    historicalPeers,
    playerId
  );

  const headlineMetric =
    metrics.find((m) => m.id === "darko") ??
    metrics.find((m) => m.id === "ts") ??
    metrics.find((m) => m.id === "usg") ??
    metrics[0];
  const headlineExplain = headlineMetric
    ? explainMetric(headlineMetric.id)
    : null;
  const headlineContext = headlineMetric
    ? buildStatContext({
        display: headlineMetric.display,
        value: headlineMetric.value,
        percentile: headlineMetric.percentile,
        population: "qualified_season",
        populationLabel: "qualified players this season",
        sampleSize: peers.filter(
          (p) =>
            p.gamesPlayed >= 15 &&
            p.minutes / Math.max(1, p.gamesPlayed) >= 12
        ).length,
        timeframe: season,
        learnHref: headlineExplain?.learnHref ?? undefined,
        sourceLabel: headlineExplain?.label,
      })
    : null;
  const plainSummary = headlineMetric
    ? [
        headlineExplain?.plain,
        `${headlineMetric.label} sits at the ${Math.round(headlineMetric.percentile)}th percentile among qualified peers in ${season}.`,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  const evolution = seasonStats
    ? computePlayerEvolution({
        playerId,
        current: seasonStats,
        career,
      })
    : null;

  const careerResume = computeCareerResume({
    playerId,
    playerName: displayName,
    career,
    viewingSeason: season,
  });

  const bioBits = [
    player?.jersey ? `#${player.jersey}` : null,
    seasonStats?.position ?? player?.position,
    seasonStats?.teamName,
    season,
  ].filter(Boolean);

  const detailBits = [
    player?.heightInches
      ? `${Math.floor(player.heightInches / 12)}'${player.heightInches % 12}"`
      : null,
    player?.weightLbs ? `${player.weightLbs} lb` : null,
    player?.age != null ? `Age ${player.age}` : null,
    player?.birthDate ? `Born ${player.birthDate}` : null,
    player?.birthPlace ?? null,
    player?.college ? `College: ${player.college}` : null,
    player?.draftInfo ? `Draft: ${player.draftInfo}` : null,
    player?.experience ?? null,
  ].filter(Boolean);

  const careerDeduped = dedupeCareerSeasons(career);
  const rankDefaultSeasons = defaultRankSeasons(career, {
    nowSeason: canonicalSeasonFromStartYear(currentNbaStartYear()),
    prefer: careerResume.peak ? [careerResume.peak.season] : [],
  });

  const careerAvg = careerSeasonAverages(careerDeduped);
  const seasonPpg = seasonStats
    ? seasonStats.points / Math.max(1, seasonStats.gamesPlayed)
    : null;

  const resumeBits = [
    headlineMetric
      ? `${Math.round(headlineMetric.percentile)}th pct · ${headlineMetric.label}`
      : null,
    careerResume.peak ? `Peak ${careerResume.peak.season}` : null,
    careerResume.prime
      ? careerResume.prime.contiguousFrom && careerResume.prime.contiguousTo
        ? `Prime ${careerResume.prime.contiguousFrom}→${careerResume.prime.contiguousTo}`
        : `Prime ${careerResume.prime.seasonCount} seasons`
      : null,
    careerResume.longevity
      ? `${careerResume.longevity.seasonCount} longevity seasons`
      : careerChrono.length
        ? `${careerChrono.length} seasons`
        : null,
  ].filter(Boolean);

  return (
    <main className="site-shell flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7">
      <p>
        <Link
          href="/explore/players"
          className="text-[13px] font-semibold text-muted-foreground"
        >
          ← Leaderboard
        </Link>
      </p>

      <PlayerPageNav />

      {/* WHO / VALUE */}
      <section
        id="overview"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Overview"
      >
        <div className="grid items-start gap-4 lg:grid-cols-12">
          <aside className="flex flex-col gap-4 lg:col-span-4">
            <header
              className="sports-card score-card-wash overflow-hidden px-4 py-5"
              style={
                brand
                  ? ({
                      "--away-color": brand.primary,
                      "--home-color": brand.secondary,
                    } as CSSProperties)
                  : undefined
              }
            >
              <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
                <PlayerHeadshot
                  playerId={playerId}
                  name={displayName}
                  teamKey={teamKey}
                  size="xl"
                  priority
                />
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Selected season · {season}
                  </p>
                  <h1 className="text-[26px] font-bold tracking-tight sm:text-[30px]">
                    {displayName}
                  </h1>
                  <p className="flex flex-wrap items-center justify-center gap-2 text-[14px] text-muted-foreground sm:justify-start">
                    {teamKey ? <TeamLogo teamKey={teamKey} size="sm" /> : null}
                    <span>{bioBits.join(" · ") || "Player profile"}</span>
                  </p>
                  {resumeBits.length ? (
                    <p className="mt-2 text-[13px] font-medium leading-snug text-foreground">
                      {resumeBits.join(" · ")}
                    </p>
                  ) : null}
                  {detailBits.length ? (
                    <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground sm:justify-start">
                      {detailBits.map((line, i) => (
                        <span
                          key={line}
                          className="inline-flex items-center gap-2"
                        >
                          {i > 0 ? (
                            <span className="text-border" aria-hidden>
                              ·
                            </span>
                          ) : null}
                          <span>{line}</span>
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Bio details unavailable for this id.
                    </p>
                  )}
                </div>
              </div>

              {headlineContext ? (
                <div className="mt-5 border-t border-border pt-4">
                  <StatDisclosure
                    label={headlineMetric?.label ?? "Season value"}
                    context={headlineContext}
                    conceptId={headlineMetric?.id}
                  />
                  {plainSummary ? (
                    <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                      {plainSummary}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {seasonStats && careerAvg ? (
                <div className="mt-5 border-t border-border pt-4">
                  <h2 className="mb-2 text-[13px] font-bold tracking-tight">
                    Current season vs career
                  </h2>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Career = mean of resume-qualifying seasons only · counting /
                    efficiency rates already on the board.
                  </p>
                  <dl className="grid grid-cols-3 gap-2 text-[12px]">
                    <VsStat
                      label="PPG"
                      current={formatNumber(
                        seasonStats.points /
                          Math.max(1, seasonStats.gamesPlayed),
                        1
                      )}
                      career={formatNumber(careerAvg.ppg, 1)}
                    />
                    <VsStat
                      label="TS%"
                      current={formatPct(seasonStats.trueShootingPct)}
                      career={formatPct(careerAvg.ts)}
                    />
                    <VsStat
                      label="USG%"
                      current={
                        seasonStats.usagePct != null &&
                        seasonStats.usagePct > 0
                          ? formatPct(seasonStats.usagePct)
                          : "—"
                      }
                      career={
                        careerAvg.usg != null
                          ? formatPct(careerAvg.usg)
                          : "—"
                      }
                    />
                  </dl>
                </div>
              ) : null}

              <div className="mt-5 border-t border-border pt-4">
                <Link
                  href={askDrblHref(
                    `What was ${displayName}'s peak production?`,
                    playerId
                  )}
                  className="text-[13px] font-semibold underline-offset-2 hover:underline"
                >
                  Ask DRBL about {displayName} →
                </Link>
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Historical advanced-stat coverage varies by season. Missing
                  years are not zeroes.
                </p>
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-bold tracking-tight">
                    Recent seasons
                  </h2>
                  <a
                    href="#seasons"
                    className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Full explorer →
                  </a>
                </div>
                {recentSeasons.length === 0 ? (
                  <p className="py-4 text-[13px] text-muted-foreground">
                    No season rows yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[280px] text-left text-[12px]">
                      <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="pb-1.5 pr-2 font-semibold">Season</th>
                          <th className="px-1.5 pb-1.5 text-right font-semibold">
                            PTS
                          </th>
                          <th className="px-1.5 pb-1.5 text-right font-semibold">
                            AST
                          </th>
                          <th className="px-1.5 pb-1.5 text-right font-semibold">
                            REB
                          </th>
                          <th className="pb-1.5 pl-1.5 text-right font-semibold">
                            TS%
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {recentSeasons.map((row) => (
                          <tr key={`${row.season}-${row.teamId}`}>
                            <td className="py-1.5 pr-2">
                              <Link
                                href={`/players/${playerId}?season=${row.season}`}
                                scroll={false}
                                className="font-semibold underline-offset-2 hover:underline"
                              >
                                {row.season}
                              </Link>
                            </td>
                            <td className="px-1.5 py-1.5 text-right tabular-nums">
                              {formatNumber(row.points)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right tabular-nums">
                              {formatNumber(row.assists)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right tabular-nums">
                              {formatNumber(row.rebounds)}
                            </td>
                            <td className="py-1.5 pl-1.5 text-right tabular-nums">
                              {formatPct(row.trueShootingPct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </header>
          </aside>

          <div className="flex flex-col gap-4 lg:col-span-8">
            <div>
              <h2 className="mb-1 text-[17px] font-bold tracking-tight">
                Analytical profile
              </h2>
              <p className="mb-3 text-[13px] text-muted-foreground">
                How good is this player in the selected season — percentiles
                among qualified peers.
              </p>
              <PlayerPercentilePanel
                key={`${playerId}-${season}`}
                season={season}
                seasons={seasonOptions}
                playerId={playerId}
                playerName={displayName}
                teamKey={teamKey}
                seasonTeams={seasonTeams}
                metrics={metrics}
              />
            </div>
          </div>
        </div>
      </section>

      {/* CAREER → EVOLUTION */}
      <section
        id="career"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Career"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Career</h2>
          <p className="text-[13px] text-muted-foreground">
            Resume first — then what changed over time.
          </p>
        </div>
        <PlayerCareerResume
          resume={careerResume}
          teamKey={teamKey}
          careerStartTeamKey={careerStartTeamKey}
          seasonsAnchorId="seasons"
          evolutionAnchorId="player-evolution"
        />
        {evolution ? (
          <div id="player-evolution" className="scroll-mt-16">
            <PlayerEvolutionPanel
              evolution={evolution}
              playerId={playerId}
              teamKey={teamKey}
              compareHref={`/compare?a=${playerId}&season=${season}`}
            />
            <p className="mt-2 text-[12px] text-muted-foreground">
              <a
                href="#seasons"
                className="font-semibold underline-offset-2 hover:underline"
              >
                View season details →
              </a>
              {" · "}
              <Link
                href={`/players/${playerId}/season-compare?a=${encodeURIComponent(season)}${
                  seasonOptions.find((s) => s !== season)
                    ? `&b=${encodeURIComponent(
                        seasonOptions.find((s) => s !== season)!
                      )}`
                    : ""
                }`}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Compare seasons →
              </Link>
            </p>
          </div>
        ) : (
          <div id="player-evolution" className="sr-only" aria-hidden />
        )}
      </section>

      {/* SEASONS */}
      <section
        id="seasons"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Seasons"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Season explorer
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Move through the career · compare · rank · ask — without a giant
            new table.
          </p>
        </div>
        <TeamWashCard
          teamKey={careerStartTeamKey}
          secondaryTeamKey={teamKey}
          className="flex flex-col gap-3 p-4 sm:p-5"
        >
          <PlayerSeasonExplorer
            playerId={playerId}
            playerName={displayName}
            seasons={careerDeduped}
            viewingSeason={season}
            peakSeason={careerResume.peak?.season}
            rankDefaults={rankDefaultSeasons}
          />
        </TeamWashCard>
        <PlayerSeasonAnalysisControl
          playerId={playerId}
          seasons={seasonOptions}
          defaultA={season}
          defaultB={
            seasonOptions.find((s) => s !== season) ??
            seasonOptions[1] ??
            seasonOptions[0]
          }
          defaultRankSeasons={rankDefaultSeasons}
        />

        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show full season table →</span>
            <span className="hidden group-open:inline">
              Hide full season table
            </span>
          </summary>
          <TeamWashCard
            teamKey={careerStartTeamKey}
            secondaryTeamKey={teamKey}
            className="mt-3 flex flex-col gap-3 p-4 sm:p-5"
          >
            <div>
              <h3 className="text-[15px] font-bold tracking-tight">
                Season depth
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Full counting / efficiency rows · accent = team that season.
              </p>
            </div>
            {career.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No career season rows available.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-white/40">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b border-border bg-white/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Season</th>
                      <th className="px-2 py-2">Team</th>
                      <th className="px-2 py-2 text-right">GP</th>
                      <th className="px-2 py-2 text-right">MIN</th>
                      <th className="px-2 py-2 text-right">PTS</th>
                      <th className="px-2 py-2 text-right">AST</th>
                      <th className="px-2 py-2 text-right">REB</th>
                      <th className="px-2 py-2 text-right">TS%</th>
                      <th className="px-2 py-2 text-right">eFG%</th>
                      <th className="px-3 py-2 text-right">USG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {career.map((row) => {
                      const rowBrand = resolveTeamBrand(row.teamId);
                      return (
                        <tr
                          key={`${row.season}-${row.teamId}`}
                          className={cn("team-stripe hover:bg-white/50")}
                          style={
                            {
                              "--team-primary":
                                rowBrand?.primary ?? "var(--primary)",
                            } as CSSProperties
                          }
                        >
                          <td className="px-3 py-2 font-semibold">
                            <Link
                              href={`/players/${playerId}?season=${row.season}`}
                              scroll={false}
                              className="hover:underline"
                            >
                              {row.season}
                            </Link>
                          </td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <TeamLogo teamKey={row.teamId} size="2xs" />
                              <span>{rowBrand?.abbr ?? row.teamName}</span>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {row.gamesPlayed}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatMinutes(row.minutes)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatNumber(row.points)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatNumber(row.assists)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatNumber(row.rebounds)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatPct(row.trueShootingPct)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {formatPct(row.effectiveFieldGoalPct)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {row.usagePct != null && row.usagePct > 0
                              ? formatPct(row.usagePct)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TeamWashCard>
        </details>
      </section>

      {/* CONTEXT */}
      <section
        id="context"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Context"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Context</h2>
          <p className="text-[13px] text-muted-foreground">
            Similar players from the existing comps · then full compare.
          </p>
        </div>
        <TeamWashCard teamKey={teamKey} className="flex flex-col gap-3 p-4 sm:p-5">
          {headlineMetric ? (
            <PlayerContextStrip
              metricLabel={headlineMetric.label}
              leagueComps={headlineMetric.leagueComps}
              historicalComps={headlineMetric.historicalComps}
              compareHref={`/compare?a=${playerId}&season=${season}`}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              <Link
                href={`/compare?a=${playerId}&season=${season}`}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Compare this player →
              </Link>
            </p>
          )}
        </TeamWashCard>
      </section>

      {/* GAMES */}
      <section
        id="games"
        className="scroll-mt-16"
        aria-label="Games"
      >
        <TeamWashCard
          teamKey={teamKey}
          className="flex flex-col gap-3 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
              <p className="text-[13px] text-muted-foreground">
                Evidence for the selected season · {season} · opens Game Lab
              </p>
            </div>
            {seasonOptions.length > 0 ? (
              <div className="flex max-w-full flex-wrap gap-1.5 overflow-x-auto">
                {seasonOptions.map((option) => {
                  const optColor = teamChartColor(seasonTeams[option]).color;
                  return (
                    <Link
                      key={option}
                      href={`/players/${playerId}?season=${option}`}
                      scroll={false}
                      className={
                        option === season
                          ? "rounded-md px-3 py-1 text-[12px] font-semibold text-white"
                          : "rounded-md bg-white/55 px-3 py-1 text-[12px] font-semibold text-foreground"
                      }
                      style={
                        option === season
                          ? { backgroundColor: optColor }
                          : undefined
                      }
                    >
                      {option}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          {seasonStats ? (
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-white/50 p-3 sm:grid-cols-4 lg:grid-cols-6">
              <MiniStat
                label="GP"
                value={formatNumber(seasonStats.gamesPlayed)}
              />
              <MiniStat
                label="MIN"
                value={formatMinutes(seasonStats.minutes)}
              />
              <MiniStat label="PTS" value={formatNumber(seasonStats.points)} />
              <MiniStat
                label="AST"
                value={formatNumber(seasonStats.assists)}
              />
              <MiniStat
                label="REB"
                value={formatNumber(seasonStats.rebounds)}
              />
              <MiniStat
                label="TS%"
                value={formatPct(seasonStats.trueShootingPct)}
              />
              <MiniStat
                label="USG"
                value={
                  seasonStats.usagePct != null && seasonStats.usagePct > 0
                    ? formatPct(seasonStats.usagePct)
                    : "—"
                }
              />
              {seasonStats.darkoDpm != null ? (
                <MiniStat
                  label="DARKO"
                  value={formatNumber(seasonStats.darkoDpm, 2)}
                />
              ) : null}
            </dl>
          ) : null}

          {gameLog.length > 0 ? (
            <PlayerNotableGames
              games={gameLog}
              seasonAvgPoints={seasonPpg}
            />
          ) : null}

          {gameLog.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No game log for {season}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[800px] text-left text-[13px]">
                <thead className="border-b border-border bg-secondary/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-2 py-2 text-right">MIN</th>
                    <th className="px-2 py-2 text-right">PTS</th>
                    <th className="px-2 py-2 text-right">AST</th>
                    <th className="px-2 py-2 text-right">REB</th>
                    <th className="px-2 py-2 text-right">STL</th>
                    <th className="px-2 py-2 text-right">BLK</th>
                    <th className="px-2 py-2 text-right">FG</th>
                    <th className="px-2 py-2 text-right">3P</th>
                    <th className="px-2 py-2 text-right">+/-</th>
                    <th className="px-3 py-2 text-right">TS%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gameLog.map((g) => (
                    <tr key={g.id} className="hover:bg-secondary/40">
                      <td className="px-3 py-2">
                        <Link
                          href={`/games/${g.gameId}`}
                          className="font-semibold hover:underline"
                        >
                          {g.gameDate}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatNumber(g.minutes, 1)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.points}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.assists}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.rebounds}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.steals}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.blocks}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.fieldGoalsMade}-{g.fieldGoalsAttempted}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.threePointersMade}-{g.threePointersAttempted}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {g.plusMinus}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {g.trueShootingPct != null
                          ? formatPct(g.trueShootingPct)
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TeamWashCard>
      </section>

      {/* ASK DRBL */}
      <section
        id="ask"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Ask DRBL"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Ask DRBL</h2>
          <p className="text-[13px] text-muted-foreground">
            Prefill supported queries — no custom player NLP on this page.
          </p>
        </div>
        <TeamWashCard teamKey={teamKey} className="p-4 sm:p-5">
          <PlayerAskLinks
            playerId={playerId}
            playerName={displayName}
            season={season}
            peakSeason={careerResume.peak?.season}
          />
        </TeamWashCard>
      </section>
    </main>
  );
}

function careerSeasonAverages(career: PlayerSeason[]): {
  ppg: number;
  ts: number;
  usg: number | null;
} | null {
  const rows = career.filter(isCareerQualifyingSeason);
  if (!rows.length) return null;
  let ppg = 0;
  let ts = 0;
  let usgSum = 0;
  let usgN = 0;
  for (const r of rows) {
    ppg += r.points / Math.max(1, r.gamesPlayed);
    ts += r.trueShootingPct;
    if (r.usagePct != null && Number.isFinite(r.usagePct) && r.usagePct > 0) {
      usgSum += r.usagePct;
      usgN += 1;
    }
  }
  return {
    ppg: ppg / rows.length,
    ts: ts / rows.length,
    usg: usgN ? usgSum / usgN : null,
  };
}

function VsStat({
  label,
  current,
  career,
}: {
  label: string;
  current: string;
  career: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-white/40 px-2 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 flex flex-col gap-0.5">
        <span className="font-bold tabular-nums">{current}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          vs {career} career
        </span>
      </dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[16px] font-bold tabular-nums">{value}</dd>
    </div>
  );
}
