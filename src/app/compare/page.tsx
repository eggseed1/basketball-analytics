import Link from "next/link";
import { Suspense } from "react";

import { buildPlayerComparison } from "@/analytics";
import { teamComparePath } from "@/analytics/compare-team-seasons";
import type { TeamSeasonComparison } from "@/analytics/compare-team-seasons";
import { teamSeasonRankPath } from "@/analytics/rank-team-seasons";
import type { TeamSeasonRanking } from "@/analytics/rank-team-seasons";
import { ComparePicker } from "@/components/compare/compare-picker";
import { PlayerCompareView } from "@/components/compare/player-compare-view";
import {
  TeamComparePicker,
  TeamCompareView,
} from "@/components/compare/team-compare-view";
import {
  TeamSeasonRankPicker,
  TeamSeasonRankView,
} from "@/components/compare/team-season-rank-view";
import {
  getFilteredPlayerSeasons,
  getPlayerSeason,
  getTeamSeasonComparison,
  getTeamSeasonEvidence,
  getTeamSeasonRanking,
  parseSeasonListParam,
  resolveExploreBoardSeason,
} from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";
import { hasRuntimeTeamBoard } from "@/data/runtime/team-board-snapshot";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import type { PlayerSeason } from "@/data/types";

export const metadata = {
  title: "Compare",
  description:
    "Side-by-side NBA player and team comparisons - dimension edges, no opaque scores.",
};

interface ComparePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function findPeerRow(
  peers: PlayerSeason[],
  playerId: string,
  aliasIds: string[] = []
): PlayerSeason | undefined {
  const ids = new Set(
    [playerId, ...aliasIds]
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
  );
  if (!ids.size) return undefined;
  return peers.find((p) => ids.has(p.playerId));
}

/**
 * Prefer peer-board row on CF. Live getPlayerSeason can fan out uncancellable
 * ESPN roster work and blow the Worker budget.
 */
async function loadSeasonRow(
  playerId: string,
  season: string,
  peers: PlayerSeason[]
): Promise<PlayerSeason | null> {
  const preferBundled = preferBundledProductDataOnEdge();
  let aliasIds: string[] = [];
  try {
    const { resolvePlayerIdentityCached } = await import(
      "@/data/identity/player-identity-cache"
    );
    const identity = await resolvePlayerIdentityCached(playerId).catch(
      () => null
    );
    aliasIds = [identity?.espnId, identity?.nbaId].filter(
      (id): id is string => Boolean(id && id !== playerId)
    );
  } catch {
    /* identity optional */
  }

  const fromPeers = findPeerRow(peers, playerId, aliasIds);

  if (fromPeers && fromPeers.gamesPlayed > 0) {
    if (preferBundled) {
      return { ...fromPeers, playerId }; // keep route id for links
    }
  }

  if (preferBundled) {
    return fromPeers ? { ...fromPeers, playerId } : null;
  }

  const row = await getPlayerSeason(playerId, season).catch(() => null);
  if (!row && !fromPeers) return null;
  if (!row) return fromPeers ? { ...fromPeers, playerId } : null;
  return {
    ...row,
    playerId,
    playerName: row.playerName || fromPeers?.playerName || playerId,
    usagePct:
      row.usagePct != null && row.usagePct > 0
        ? row.usagePct
        : fromPeers?.usagePct ?? row.usagePct,
    darkoDpm: row.darkoDpm ?? fromPeers?.darkoDpm,
    darkoOff: row.darkoOff ?? fromPeers?.darkoOff,
    darkoDef: row.darkoDef ?? fromPeers?.darkoDef,
    raptor: row.raptor ?? fromPeers?.raptor,
    trueShootingPct:
      row.trueShootingPct != null && row.trueShootingPct > 0
        ? row.trueShootingPct
        : fromPeers?.trueShootingPct ?? row.trueShootingPct,
    drbl100: fromPeers?.drbl100 ?? row.drbl100,
    rawAbilityRate: fromPeers?.rawAbilityRate ?? row.rawAbilityRate,
    drblPossessions: fromPeers?.drblPossessions ?? row.drblPossessions,
    abilityModelVersion:
      fromPeers?.abilityModelVersion ?? row.abilityModelVersion,
    drblRank: fromPeers?.drblRank ?? row.drblRank,
    drblO: fromPeers?.drblO ?? row.drblO,
    drblD: fromPeers?.drblD ?? row.drblD,
    drblP: fromPeers?.drblP ?? row.drblP,
    drblLn: fromPeers?.drblLn ?? row.drblLn,
    drblB: fromPeers?.drblB ?? row.drblB,
    r1Points: fromPeers?.r1Points ?? row.r1Points,
    r1WinEquivalents: fromPeers?.r1WinEquivalents ?? row.r1WinEquivalents,
    r1PointValueVersion:
      fromPeers?.r1PointValueVersion ?? row.r1PointValueVersion,
    r1WinEquivalentVersion:
      fromPeers?.r1WinEquivalentVersion ?? row.r1WinEquivalentVersion,
  };
}

function resolveTeamCompareSeason(preferred: string): string {
  const key = String(preferred ?? "").trim();
  if (key && hasRuntimeTeamBoard(key)) return key;
  const prior = shiftCanonicalSeason(key || "2025-26", -1);
  if (hasRuntimeTeamBoard(prior)) return prior;
  // Latest baked team board (desc).
  for (let y = currentNbaStartYear(); y >= 2020; y -= 1) {
    const season = canonicalSeasonFromStartYear(y);
    if (hasRuntimeTeamBoard(season)) return season;
  }
  return key || canonicalSeasonFromStartYear(currentNbaStartYear() - 1);
}

function TeamsSubnav({
  active,
  compareHref,
  rankHref,
}: {
  active: "compare" | "rank";
  compareHref: string;
  rankHref: string;
}) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[14px] font-semibold">
      <Link
        href={compareHref}
        className={
          active === "compare"
            ? undefined
            : "text-muted-foreground underline-offset-2 hover:underline"
        }
      >
        Compare teams / seasons
      </Link>
      <span className="text-muted-foreground">·</span>
      <Link
        href={rankHref}
        className={
          active === "rank"
            ? undefined
            : "text-muted-foreground underline-offset-2 hover:underline"
        }
      >
        Rank seasons
      </Link>
    </p>
  );
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const sp = await searchParams;
  const modeParam = one(sp, "mode");
  const teamA = one(sp, "teamA");
  const teamB = one(sp, "teamB");
  const teamIdParam = one(sp, "teamId");
  const viewParam = one(sp, "view");
  const seasonsParam = one(sp, "seasons");
  const isTeams =
    modeParam === "teams" ||
    Boolean(teamA) ||
    Boolean(teamB) ||
    Boolean(teamIdParam);

  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());

  if (isTeams) {
    const isRank =
      viewParam === "rank" ||
      (Boolean(teamIdParam) && Boolean(seasonsParam) && !teamA && !teamB);

    if (isRank) {
      const parsed = parseSeasonListParam(seasonsParam);
      const seasonsError =
        typeof parsed === "object" && "error" in parsed ? parsed.error : null;
      const seasonsList = Array.isArray(parsed) ? parsed : [];
      const rankTeamId = teamIdParam ?? teamA ?? "";

      const loaded = rankTeamId
        ? await getTeamSeasonRanking({
            teamId: rankTeamId,
            seasons: seasonsList.length ? seasonsList : undefined,
          })
        : { ranking: null, availableSeasons: [] as string[], error: null };

      const resolvedId =
        loaded.ranking?.teamId ?? rankTeamId;
      const defaultSeasons =
        loaded.ranking?.seasons ??
        seasonsList;
      const rankHref = resolvedId
        ? teamSeasonRankPath(
            resolvedId,
            defaultSeasons.length
              ? defaultSeasons
              : loaded.availableSeasons.slice(0, 5).reverse()
          )
        : "/compare?mode=teams&view=rank";
      const compareHref = resolvedId
        ? teamComparePath({
            teamA: resolvedId,
            teamB: resolvedId,
            seasonA: resolveTeamCompareSeason(currentSeason),
            seasonB: resolveTeamCompareSeason(
              shiftCanonicalSeason(
                resolveTeamCompareSeason(currentSeason),
                -1
              )
            ),
          })
        : "/compare?mode=teams";

      return (
        <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
          <header className="flex flex-col gap-1">
            <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
              Compare
            </h1>
            <p className="max-w-2xl text-[16px] text-muted-foreground">
              Rank a franchise’s seasons via pairwise Team Season Compare -
              Copeland aggregation, no opaque team score.
            </p>
            <p className="text-[14px] font-semibold">
              <Link
                href="/compare"
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                Players
              </Link>
              <span className="mx-2 text-muted-foreground">·</span>
              <span>Teams</span>
            </p>
            <TeamsSubnav
              active="rank"
              compareHref={compareHref}
              rankHref={rankHref}
            />
          </header>

          {!rankTeamId ? (
            <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
              Open Rank seasons from a team page, or use{" "}
              <code className="text-[12px]">
                /compare?mode=teams&view=rank&teamId=…
              </code>
              .
            </p>
          ) : (
            <>
              <Suspense
                fallback={
                  <div className="h-24 animate-pulse rounded-xl bg-secondary" />
                }
              >
                <TeamSeasonRankPicker
                  teamId={resolvedId || rankTeamId}
                  availableSeasons={
                    loaded.availableSeasons.length
                      ? loaded.availableSeasons
                      : defaultSeasons
                  }
                  selected={
                    loaded.ranking?.seasons ??
                    (seasonsList.length
                      ? seasonsList
                      : loaded.availableSeasons
                          .slice(0, 5)
                          .sort((a, b) => a.localeCompare(b)))
                  }
                />
              </Suspense>

              {seasonsError ? (
                <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
                  {seasonsError}
                </p>
              ) : loaded.error ? (
                <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
                  {loaded.error}
                </p>
              ) : loaded.ranking ? (
                <TeamRankWithEvidence ranking={loaded.ranking} />
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
                  Could not rank those team seasons.
                </p>
              )}
            </>
          )}
        </main>
      );
    }

    const seasonA = resolveTeamCompareSeason(
      one(sp, "seasonA") ?? one(sp, "season") ?? currentSeason
    );
    const seasonB = resolveTeamCompareSeason(
      one(sp, "seasonB") ??
        (teamA && teamB && teamA === teamB
          ? shiftCanonicalSeason(seasonA, -1)
          : (one(sp, "season") ?? seasonA))
    );

    const loaded =
      teamA && teamB
        ? await getTeamSeasonComparison({
            teamA,
            teamB,
            seasonA,
            seasonB,
          })
        : { comparison: null, error: null };

    const resolvedCompareId =
      loaded.comparison?.sideA.teamId ?? teamA ?? teamIdParam;
    const rankHref = resolvedCompareId
      ? `/compare?mode=teams&view=rank&teamId=${encodeURIComponent(resolvedCompareId)}`
      : "/compare?mode=teams&view=rank";

    return (
      <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
            Compare
          </h1>
          <p className="max-w-2xl text-[16px] text-muted-foreground">
            Team season compare and team vs team - transparent board metrics,
            category plurality, no opaque team score.
          </p>
          <p className="text-[14px] font-semibold">
            <Link
              href="/compare"
              className="text-muted-foreground underline-offset-2 hover:underline"
            >
              Players
            </Link>
            <span className="mx-2 text-muted-foreground">·</span>
            <span>Teams</span>
          </p>
          <TeamsSubnav
            active="compare"
            compareHref="/compare?mode=teams"
            rankHref={rankHref}
          />
        </header>

        <Suspense
          fallback={
            <div className="h-24 animate-pulse rounded-xl bg-secondary" />
          }
        >
          <TeamComparePicker
            teamAId={loaded.comparison?.sideA.teamId ?? teamA}
            teamBId={loaded.comparison?.sideB.teamId ?? teamB}
            teamAName={loaded.comparison?.sideA.fullName}
            teamBName={loaded.comparison?.sideB.fullName}
            seasonA={loaded.comparison?.sideA.season ?? seasonA}
            seasonB={loaded.comparison?.sideB.season ?? seasonB}
          />
        </Suspense>

        {!teamA || !teamB ? (
          <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
            Search for Team A and Team B (same franchise + two seasons, or two
            franchises).
          </p>
        ) : loaded.error ? (
          <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
            {loaded.error}
          </p>
        ) : loaded.comparison ? (
          <TeamCompareWithEvidence comparison={loaded.comparison} />
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
            Could not build a team comparison for these inputs.
          </p>
        )}
      </main>
    );
  }

  const aId = one(sp, "a");
  const bId = one(sp, "b");
  const preferredSeason = one(sp, "season") ?? currentSeason;

  // Empty picker shell: do not resolve/import the BRef peer board (multi‑MB).
  let season = preferredSeason;
  let peers: PlayerSeason[] = [];
  let aRow: PlayerSeason | null = null;
  let bRow: PlayerSeason | null = null;
  if (aId && bId) {
    // CF: current calendar season is often empty in BRef bake — use latest board.
    season = await resolveExploreBoardSeason(preferredSeason);
    peers = await getFilteredPlayerSeasons({
      season,
      minimumGames: 15,
    }).catch(() => [] as PlayerSeason[]);

    [aRow, bRow] = await Promise.all([
      loadSeasonRow(aId, season, peers),
      loadSeasonRow(bId, season, peers),
    ]);
  }

  const result =
    aRow && bRow
      ? buildPlayerComparison({ a: aRow, b: bRow, peers })
      : null;

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Compare
        </h1>
        <p className="max-w-2xl text-[16px] text-muted-foreground">
          Pick two players. See the measurable edges first, then the dimensions
          that drive the difference.
        </p>
        <p className="text-[14px] font-semibold">
          <span>Players</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <Link
            href="/compare?mode=teams"
            className="text-muted-foreground underline-offset-2 hover:underline"
          >
            Teams
          </Link>
        </p>
      </header>

      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-secondary" />}>
        <ComparePicker
          aId={aRow?.playerId ?? aId}
          bId={bRow?.playerId ?? bId}
          aName={aRow?.playerName}
          bName={bRow?.playerName}
          season={season}
        />
      </Suspense>

      {!aId || !bId ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          Search for Player A and Player B to run a comparison.
        </p>
      ) : !result ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-[14px] text-muted-foreground">
          Could not load season rows for both players in {season}. Try another
          season or different players.
        </p>
      ) : (
        <PlayerCompareView result={result} />
      )}
    </main>
  );
}

/** Load lightweight season evidence for the #1 ranked eligible season. */
async function TeamRankWithEvidence({
  ranking,
}: {
  ranking: TeamSeasonRanking;
}) {
  const top = ranking.ranking.find((e) => e.eligible && e.rank === 1);
  const evidence = top
    ? await getTeamSeasonEvidence({
        teamId: ranking.teamId,
        season: top.season,
        abbreviation: ranking.abbreviation,
        fullName: ranking.fullName,
      }).catch(() => null)
    : null;

  return <TeamSeasonRankView result={ranking} topEvidence={evidence} />;
}

/** Load descriptive evidence for both compare sides (no Game Lab fan-out). */
async function TeamCompareWithEvidence({
  comparison,
}: {
  comparison: TeamSeasonComparison;
}) {
  const [evidenceA, evidenceB] = await Promise.all([
    getTeamSeasonEvidence({
      teamId: comparison.sideA.teamId,
      season: comparison.sideA.season,
      abbreviation: comparison.sideA.abbreviation,
      fullName: comparison.sideA.fullName,
    }).catch(() => null),
    getTeamSeasonEvidence({
      teamId: comparison.sideB.teamId,
      season: comparison.sideB.season,
      abbreviation: comparison.sideB.abbreviation,
      fullName: comparison.sideB.fullName,
    }).catch(() => null),
  ]);

  return (
    <TeamCompareView
      result={comparison}
      evidenceA={evidenceA}
      evidenceB={evidenceB}
    />
  );
}
