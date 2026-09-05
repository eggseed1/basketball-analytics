import { TransitionLink } from "@/components/continuity/query-nav";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerCareerSeasonTable } from "@/components/players/player-career-season-table";
import {
  PlayerBarDistribution,
  PlayerCareerArcChart,
  PlayerContextScatter,
  PlayerGameHighTimeline,
  PlayerImpactMarker,
  PlayerOpponentDeltaBars,
  PlayerPercentileStrip,
  PlayerShotProfileBars,
  PlayerSparkTrend,
  PlayerSplitDeltaMatrix,
} from "@/components/players/player-depth-visuals";
import { PlayerSeasonCourtChart } from "@/components/players/player-season-court-chart";
import { PlayerGameLogTable } from "@/components/players/player-game-log-table";
import type { HistoryPlayerSeason } from "@/data/history/player-career-types";
import {
  computePlayerGameHighsAsync,
  computePlayerSeasonSplitsAsync,
  getCompactPlayerGameLogAsync,
  shootingFromGames,
} from "@/data/history/player-game-log";
import {
  resolvePlayerSeasonShotIndex,
} from "@/data/runtime/player-shots-store";
import { zoneTableFromIndex } from "@/data/history/player-season-shots";
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { SHOT_ZONE_LABELS, type ShotZoneId } from "@/lib/shots/court-geometry";
import type { PlayerSeason } from "@/data/types";
import {
  computePlayerPercentiles,
  hasValidDrblEstimate,
} from "@/data/queries/percentiles";
import {
  getFilteredPlayerSeasonsCached,
  getPlayerSeasonCached,
  resolvePlayerIdentityCached,
} from "@/data/queries/request-cache";
import { formatNumber, formatPct } from "@/lib/format";
import {
  buildGameDistribution,
  buildGameTrend,
  buildRecentVsSeason,
  buildRollingSeries,
  buildSplitDeltas,
  chronologicalOldestFirst,
  withSplitRates,
} from "@/lib/player-game-analytics";
import {
  PLAYER_SEASON_ADVANCED_METRIC_REGISTRY,
  publicValidatedGameAdvancedMetrics,
} from "@/lib/player-game-advanced-registry";
import {
  efgPct,
  fgPct,
  playerHref,
  tsPct,
  type PlayerGameLogTableMode,
  type PlayerPageView,
  type PlayerStatMode,
  playerPageCapabilities,
} from "@/lib/player-page-contract";
import { mergePlayerSeasonStats } from "@/lib/player-destination";
import { slimEdgeProductEnabled } from "@/data/providers/nba/runtime-policy";

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function ageForSeason(
  career: PlayerSeason[],
  season: string,
  birthDate?: string | null
): string {
  const row = career.find((r) => r.season === season && r.teamId !== "TOT");
  if (row?.age != null && Number.isFinite(row.age)) return String(row.age);
  if (birthDate && /^\d{4}/.test(birthDate)) {
    const by = Number(birthDate.slice(0, 4));
    const sy = Number(season.slice(0, 4));
    if (Number.isFinite(by) && Number.isFinite(sy)) return String(sy - by);
  }
  return "—";
}

/**
 * Deep player statistics island — loads only the selected view's data.
 */
export async function PlayerStatDepthIsland({
  playerId,
  season,
  view,
  page,
  statMode,
  gameLogMode = "basic",
  filter,
  historySeasons,
  career,
  careerFirstSeason,
  fromHistory,
  themeMode,
}: {
  playerId: string;
  season: string;
  view: PlayerPageView;
  page: number;
  statMode: PlayerStatMode;
  gameLogMode?: PlayerGameLogTableMode;
  filter: string;
  historySeasons: HistoryPlayerSeason[];
  career: PlayerSeason[];
  careerFirstSeason?: string | null;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  try {
    return await PlayerStatDepthIslandInner({
      playerId,
      season,
      view,
      page,
      statMode,
      gameLogMode,
      filter,
      historySeasons,
      career,
      careerFirstSeason,
      fromHistory,
      themeMode,
    });
  } catch {
    return (
      <EraUnavailable
        title="Deep stats"
        season={season}
        detail="This panel could not finish loading. Career and overview stats remain available."
      />
    );
  }
}

async function PlayerStatDepthIslandInner({
  playerId,
  season,
  view,
  page,
  statMode,
  gameLogMode = "basic",
  filter,
  historySeasons,
  career,
  careerFirstSeason,
  fromHistory,
  themeMode,
}: {
  playerId: string;
  season: string;
  view: PlayerPageView;
  page: number;
  statMode: PlayerStatMode;
  gameLogMode?: PlayerGameLogTableMode;
  filter: string;
  historySeasons: HistoryPlayerSeason[];
  career: PlayerSeason[];
  careerFirstSeason?: string | null;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const caps = playerPageCapabilities({
    selectedSeason: season,
    careerFirstSeason,
  });

  if (view === "career") {
    return (
      <CareerView
        playerId={playerId}
        season={season}
        historySeasons={historySeasons}
        career={career}
        statMode={statMode}
        fromHistory={fromHistory}
        themeMode={themeMode}
      />
    );
  }

  if (view === "games") {
    if (!caps.gameLogs) {
      return (
        <EraUnavailable
          title="Game logs"
          season={season}
          detail="Comprehensive player game logs start in 1996-97. Career season stats remain available."
        />
      );
    }
    return (
      <GamesView
        playerId={playerId}
        season={season}
        page={page}
        filter={filter}
        mode={gameLogMode}
        fromHistory={fromHistory}
        themeMode={themeMode}
      />
    );
  }

  if (view === "splits") {
    if (!caps.splits) {
      return (
        <EraUnavailable
          title="Splits"
          season={season}
          detail="Game-derived splits require the 1996-97+ game archive."
        />
      );
    }
    return <SplitsView playerId={playerId} season={season} />;
  }

  if (view === "shooting") {
    return (
      <ShootingView
        playerId={playerId}
        season={season}
        career={career}
        historySeasons={historySeasons}
        capsShotChart={caps.shotChart}
      />
    );
  }

  if (view === "advanced") {
    return (
      <AdvancedView
        playerId={playerId}
        season={season}
        career={career}
        caps={caps}
      />
    );
  }

  if (view === "highs") {
    if (!caps.gameHighs) {
      return (
        <EraUnavailable
          title="Game highs"
          season={season}
          detail="Game highs require the 1996-97+ game archive."
        />
      );
    }
    return (
      <HighsView
        playerId={playerId}
        season={season}
        scopeLabel={caps.gameHighsScopeLabel}
      />
    );
  }

  return (
    <OverviewDepthLinks
      playerId={playerId}
      season={season}
      caps={caps}
      fromHistory={fromHistory}
      themeMode={themeMode}
    />
  );
}

async function CareerView({
  playerId,
  season,
  historySeasons,
  career,
  statMode,
  fromHistory,
  themeMode,
}: {
  playerId: string;
  season: string;
  historySeasons: HistoryPlayerSeason[];
  career: PlayerSeason[];
  statMode: PlayerStatMode;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const ageBySeason = Object.fromEntries(
    historySeasons.map((s) => {
      const fromCareer = ageForSeason(career, s.season);
      return [s.season, fromCareer];
    })
  );

  const arcMetric = "points";
  const arcPoints = [...historySeasons]
    .sort((a, b) => a.season.localeCompare(b.season))
    .map((s) => {
      const gp = Math.max(1, s.gp);
      const value =
        arcMetric === "points" && s.points != null ? s.points / gp : null;
      const team =
        s.teamIds.length > 1
          ? "TOT"
          : getCanonicalTeamFromProvider("nba", s.primaryTeamId)?.abbr ?? "—";
      return {
        season: s.season,
        value,
        teamAbbr: team,
        href: playerHref({
          playerId,
          season: s.season,
          view: "career",
          fromHistory,
          themeMode,
        }),
      };
    });
  const peak = arcPoints.reduce<{ season: string; value: number } | null>(
    (best, p) => {
      if (p.value == null) return best;
      if (!best || p.value > best.value)
        return { season: p.season, value: p.value };
      return best;
    },
    null
  );

  // Relative TS% where both player and career board seasons exist
  const relativeTs = historySeasons
    .map((s) => {
      const board = career.find((c) => c.season === s.season);
      const playerTs =
        s.points != null && s.fga != null
          ? tsPct(s.points, s.fga, s.fta)
          : board?.trueShootingPct ?? null;
      const leagueTs = board?.trueShootingPct != null ? null : null;
      // Prefer derived player TS; league relative when board has league context later
      return {
        season: s.season,
        playerTs,
        relative:
          playerTs != null && leagueTs != null ? playerTs - leagueTs : null,
      };
    })
    .filter((r) => r.playerTs != null);

  return (
    <section id="career-table" className="scroll-mt-16 flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">
          Career season stats
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Full reference · Season / Age / Team · Per game · Totals · Per 36
        </p>
      </div>

      {historySeasons.length > 0 ? (
        <>
          <PlayerCareerArcChart
            title="Career arc — points per game"
            points={arcPoints}
            selectedSeason={season}
            peakSeason={peak?.season ?? null}
          />
          {relativeTs.length > 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Relative TS% = player TS% − same-season league TS% when a league
              baseline index is available. Raw player TS% is always shown in the
              table modes via eFG/TS helpers.
            </p>
          ) : null}
          <PlayerCareerSeasonTable
            playerId={playerId}
            seasons={historySeasons}
            viewingSeason={season}
            statMode={statMode}
            ageBySeason={ageBySeason}
            fromHistory={fromHistory}
            themeMode={themeMode}
          />
          <p className="text-[12px]">
            <TransitionLink
              href={playerHref({
                playerId,
                season,
                view: "games",
                fromHistory,
                themeMode,
              })}
              scroll={false}
              prefetch={false}
              className="font-semibold underline-offset-2 hover:underline"
            >
              Open {season} game log →
            </TransitionLink>
          </p>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Career season table unavailable for this player in the historical
          product index.
        </p>
      )}
    </section>
  );
}

async function GamesView({
  playerId,
  season,
  page,
  filter,
  mode,
  fromHistory,
  themeMode,
}: {
  playerId: string;
  season: string;
  page: number;
  filter: string;
  mode: PlayerGameLogTableMode;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const log = await getCompactPlayerGameLogAsync({
    playerId,
    season,
    page,
    filter: (filter as "ALL") || "ALL",
  });
  const filtered = log.allFiltered;
  const chrono = chronologicalOldestFirst(filtered);
  const trend = buildGameTrend(chrono, "points");
  const roll5 = buildRollingSeries(chrono, "points", 5);
  const roll10 = buildRollingSeries(chrono, "points", 10);
  const roll20 = buildRollingSeries(chrono, "points", 20);
  const dist = buildGameDistribution(filtered, "points");
  const recent = buildRecentVsSeason(filtered);
  const validatedAdvanced = publicValidatedGameAdvancedMetrics();

  return (
    <section id="game-log" className="scroll-mt-16 flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Game log</h2>
        <p className="text-[13px] text-muted-foreground">
          {season} · {log.total} appearances · filters update trend, form,
          distribution, and table together
        </p>
      </div>

      {log.total === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No player-game rows for {season} in history or live provider.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["Last 5 PTS", recent.last5.points, recent.delta.points],
                ["Last 5 REB", recent.last5.rebounds, recent.delta.rebounds],
                ["Last 5 AST", recent.last5.assists, recent.delta.assists],
                [
                  "Last 5 TS%",
                  recent.last5.tsPct != null ? recent.last5.tsPct * 100 : null,
                  recent.delta.tsPct != null ? recent.delta.tsPct * 100 : null,
                ],
              ] as const
            ).map(([label, value, delta]) => (
              <div
                key={label}
                className="rounded-md border border-border px-3 py-2"
              >
                <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 text-[16px] font-bold tabular-nums">
                  {value == null ? "—" : Number(value).toFixed(1)}
                  {delta != null ? (
                    <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
                      ({delta > 0 ? "+" : ""}
                      {delta.toFixed(1)} vs season)
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>

          <PlayerSparkTrend
            title="Game-by-game points"
            question="How did this player perform game to game?"
            points={trend.map((p) => ({
              x: p.date,
              y: p.value,
              href: `/games/${encodeURIComponent(p.gameId)}?season=${encodeURIComponent(season)}`,
              label: `${p.date} vs ${p.opponentAbbr}: ${p.value}`,
            }))}
            seasonAvg={trend[0]?.seasonAvg}
          />

          <div className="grid gap-3 lg:grid-cols-3">
            <PlayerSparkTrend
              title="Rolling 5 — PTS"
              question="5-game form"
              points={roll5.map((p) => ({ x: p.date, y: p.value }))}
              valueDigits={1}
            />
            <PlayerSparkTrend
              title="Rolling 10 — PTS"
              question="10-game form"
              points={roll10.map((p) => ({ x: p.date, y: p.value }))}
            />
            <PlayerSparkTrend
              title="Rolling 20 — PTS"
              question="20-game form"
              points={roll20.map((p) => ({ x: p.date, y: p.value }))}
            />
          </div>

          <PlayerBarDistribution
            title="Points distribution"
            question="Where do game scoring outcomes cluster?"
            bins={dist.bins}
            mean={dist.mean}
            median={dist.median}
            min={dist.min}
            max={dist.max}
          />

          <p className="text-[12px] text-muted-foreground">
            Advanced columns validated:{" "}
            {validatedAdvanced.map((m) => m.name).join(", ")}. USG%/ORB%/etc.
            remain blocked without validated denominators. No game-level DRBL.
          </p>

          <PlayerGameLogTable
            playerId={playerId}
            season={season}
            rows={log.rows}
            total={log.total}
            page={log.page}
            pageCount={log.pageCount}
            filter={filter || "ALL"}
            mode={mode}
            fromHistory={fromHistory}
            themeMode={themeMode}
          />
        </>
      )}
    </section>
  );
}

async function SplitsView({
  playerId,
  season,
}: {
  playerId: string;
  season: string;
}) {
  const splits = await computePlayerSeasonSplitsAsync(playerId, season);
  const primaryRates = splits.primary.map(withSplitRates);
  const deltas = buildSplitDeltas(splits.primary, splits.seasonBaseline);
  const monthRates = splits.byMonth.map(withSplitRates);
  const monthTrend = monthRates.map((m) => ({
    x: m.label,
    y: m.ptsPerG,
  }));
  const baseline = withSplitRates(splits.seasonBaseline);
  const oppDeltas = splits.byOpponent.map((o) => {
    const r = withSplitRates(o);
    return {
      label: o.label,
      games: o.games,
      delta: r.ptsPerG - baseline.ptsPerG,
    };
  });
  const oppSorted = [...oppDeltas].sort((a, b) => b.delta - a.delta);

  return (
    <section id="splits" className="scroll-mt-16 flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Splits</h2>
        <p className="text-[13px] text-muted-foreground">
          Under which conditions does this player change? Rates from Σ/Σ.
        </p>
      </div>

      {splits.seasonBaseline.games === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No games available to split for {season}.
        </p>
      ) : (
        <>
          <PlayerSplitDeltaMatrix
            title="Baseline deltas"
            rows={deltas}
            metrics={["PTS", "REB", "AST", "FG%", "3P%", "TS%", "TOV"]}
          />

          <SplitTable title="Primary splits" rows={primaryRates} />

          <PlayerSparkTrend
            title="Monthly points per game"
            question="How did performance evolve during the season?"
            points={monthTrend}
          />
          <SplitTable title="By month" rows={monthRates} />

          <PlayerOpponentDeltaBars
            title="Opponent comparison (PTS / G)"
            rows={oppSorted}
            metricLabel="PTS per game"
          />
          <details open={splits.byOpponent.length <= 15}>
            <summary className="cursor-pointer text-[13px] font-semibold">
              All opponents ({splits.byOpponent.length})
            </summary>
            <div className="mt-2">
              <SplitTable
                title="Opponent"
                rows={splits.byOpponent.map(withSplitRates)}
              />
            </div>
          </details>

          <p className="text-[12px] text-muted-foreground">
            Conservation: Home+Away, Wins+Losses, and Starter+Bench each equal
            the season game universe when those fields are complete.
          </p>
        </>
      )}
    </section>
  );
}

async function ShootingView({
  playerId,
  season,
  career,
  historySeasons,
}: {
  playerId: string;
  season: string;
  career: PlayerSeason[];
  historySeasons: HistoryPlayerSeason[];
  capsShotChart?: boolean;
}) {
  const log = await getCompactPlayerGameLogAsync({
    playerId,
    season,
    page: 1,
    pageSize: 5000,
  });
  const shoot = shootingFromGames(log.allFiltered);
  const seasonRow =
    career.find((r) => r.season === season) ??
    (await getPlayerSeasonCached(playerId, season).catch(() => null));

  const twoPa = shoot.twoPa;
  const threePa = shoot.threePa;
  const fta = shoot.fta;
  const attemptTotal = Math.max(1, twoPa + threePa + fta);
  const slices = [
    {
      label: "2P",
      share: twoPa / attemptTotal,
      accuracy: twoPa > 0 ? shoot.twoPm / twoPa : null,
      attempts: twoPa,
      leagueAccuracy: null as number | null,
    },
    {
      label: "3P",
      share: threePa / attemptTotal,
      accuracy: shoot.threePct,
      attempts: threePa,
      leagueAccuracy: null,
    },
    {
      label: "FT",
      share: fta / attemptTotal,
      accuracy: shoot.ftPct,
      attempts: fta,
      leagueAccuracy: null,
    },
  ];

  const evolution = [...historySeasons]
    .sort((a, b) => a.season.localeCompare(b.season))
    .filter((s) => (s.fga ?? 0) > 0)
    .slice(-12)
    .map((s) => {
      const fga = s.fga ?? 0;
      const tpa = s.threePa ?? 0;
      return {
        season: s.season,
        threeShare: fga > 0 ? tpa / fga : 0,
        efg: efgPct(s.fgm, s.fga, s.threePm),
      };
    });

  const hasBox =
    (log.supported && log.total > 0) ||
    (seasonRow != null && (seasonRow.fieldGoalsAttempted ?? 0) > 0);

  const boardShoot = seasonRow
    ? {
        fgm: seasonRow.fieldGoalsMade,
        fga: seasonRow.fieldGoalsAttempted,
        threePm: seasonRow.threePointersMade,
        threePa: seasonRow.threePointersAttempted,
        ftm: seasonRow.freeThrowsMade,
        fta: seasonRow.freeThrowsAttempted,
        fgPct: seasonRow.fieldGoalPct as number | null,
        threePct: seasonRow.threePointPct as number | null,
        ftPct: seasonRow.freeThrowPct as number | null,
        efg: (seasonRow.effectiveFieldGoalPct ?? null) as number | null,
        ts: (seasonRow.trueShootingPct ?? null) as number | null,
        twoPm: seasonRow.fieldGoalsMade - seasonRow.threePointersMade,
        twoPa: seasonRow.fieldGoalsAttempted - seasonRow.threePointersAttempted,
      }
    : null;

  type ShootDisplay = {
    fgm: number;
    fga: number;
    threePm: number;
    threePa: number;
    ftm: number;
    fta: number;
    twoPm: number;
    twoPa: number;
    fgPct: number | null;
    threePct: number | null;
    ftPct: number | null;
    efg: number | null;
    ts: number | null;
  };

  const display: ShootDisplay | null =
    log.total > 0
      ? {
          fgm: shoot.fgm,
          fga: shoot.fga,
          threePm: shoot.threePm,
          threePa: shoot.threePa,
          ftm: shoot.ftm,
          fta: shoot.fta,
          twoPm: shoot.twoPm,
          twoPa: shoot.twoPa,
          fgPct: shoot.fgPct,
          threePct: shoot.threePct,
          ftPct: shoot.ftPct,
          efg: shoot.efg,
          ts: shoot.ts,
        }
      : boardShoot;

  const shotIndex = await resolvePlayerSeasonShotIndex({
    playerId,
    season,
  });
  const zoneRows = shotIndex ? zoneTableFromIndex(shotIndex) : [];
  const courtShots =
    shotIndex?.shots.map((s) => ({ ...s, season })) ?? [];

  // Fine-zone diet when coordinates exist
  const zoneSlices =
    zoneRows.length > 0
      ? zoneRows
          .filter((z) => z.zone !== "UNKNOWN" && z.zone !== "HEAVE")
          .map((z) => ({
            label:
              SHOT_ZONE_LABELS[z.zone as ShotZoneId] ?? z.zone,
            share: z.frequency,
            accuracy: z.fgPct,
            attempts: z.fga,
            leagueAccuracy: null as number | null,
          }))
      : slices;

  return (
    <section id="shooting" className="scroll-mt-16 flex flex-col gap-4">
      <div className="sports-card glass-text-scrim p-4">
        <h2 className="type-title text-[17px] font-bold tracking-tight">
          Shooting
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Traditional core always · Hannah-style season court when coordinates
          indexed · no synthetic coordinates
        </p>
      </div>

      {!hasBox || display == null ? (
        <p className="text-[13px] text-muted-foreground">
          Shooting breakdown unavailable for {season}.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Mini label="FG" value={`${display.fgm}-${display.fga}`} />
            <Mini label="FG%" value={pct(display.fgPct ?? fgPct(display.fgm, display.fga))} />
            <Mini label="2P" value={`${display.twoPm}-${display.twoPa}`} />
            <Mini
              label="2P%"
              value={pct(
                display.twoPa > 0 ? display.twoPm / display.twoPa : null
              )}
            />
            <Mini label="3P" value={`${display.threePm}-${display.threePa}`} />
            <Mini label="3P%" value={pct(display.threePct)} />
            <Mini label="FT" value={`${display.ftm}-${display.fta}`} />
            <Mini label="FT%" value={pct(display.ftPct)} />
            <Mini
              label="eFG%"
              value={pct(
                display.efg ?? efgPct(display.fgm, display.fga, display.threePm)
              )}
              help="efg"
            />
            <Mini label="TS%" value={pct(display.ts)} help="ts" />
            <Mini
              label="3PAr"
              value={pct(fgPct(display.threePa, display.fga))}
            />
            <Mini
              label="FTr"
              value={
                display.fga > 0 ? (display.fta / display.fga).toFixed(3) : "—"
              }
            />
          </dl>

          <PlayerShotProfileBars
            title={
              zoneRows.length > 0
                ? "Shot diet by zone — frequency + accuracy"
                : "Shot diet — frequency + accuracy"
            }
            slices={zoneSlices}
          />

          {shotIndex ? (
            <PlayerSeasonCourtChart
              season={season}
              shotIndex={shotIndex}
              shots={courtShots}
              teamLabel={
                career.find((r) => r.season === season && r.teamId !== "TOT")
                  ?.teamId ??
                career.find((r) => r.season === season)?.teamId ??
                "—"
              }
              coverageLabel={`Coordinate-covered FGA: ${shotIndex.coordinateShots} of ${shotIndex.boxFga} box FGA (${(
                shotIndex.coverage * 100
              ).toFixed(1)}%)`}
            />
          ) : (
            <div className="sports-card glass-text-scrim px-3 py-2 text-[12px] text-muted-foreground">
              Season court chart unavailable for {season} (no precomputed
              player-season shot index). Traditional shooting above remains
              complete. Open a game for per-game CourtShotChart when that game
              has coordinates.
            </div>
          )}

          {zoneRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[32rem] text-left text-[12px]">
                <thead className="border-b border-border bg-secondary/50 text-[10px] font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Zone</th>
                    <th className="px-2 py-2 text-right">FGM</th>
                    <th className="px-2 py-2 text-right">FGA</th>
                    <th className="px-2 py-2 text-right">FG%</th>
                    <th className="px-2 py-2 text-right">Freq</th>
                    <th className="px-2 py-2 text-right">PTS/shot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {zoneRows.map((z) => (
                    <tr key={z.zone}>
                      <td className="px-3 py-2 font-semibold">
                        {SHOT_ZONE_LABELS[z.zone as ShotZoneId] ?? z.zone}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {z.fgm}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {z.fga}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {pct(z.fgPct)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {(z.frequency * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {z.pointsPerShot == null
                          ? "—"
                          : z.pointsPerShot.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {evolution.length > 1 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <PlayerSparkTrend
                title="3PA rate evolution"
                question="How did shot diet change across recent seasons?"
                points={evolution.map((e) => ({
                  x: e.season,
                  y: e.threeShare * 100,
                }))}
                valueDigits={1}
              />
              <PlayerSparkTrend
                title="eFG% evolution"
                question="How did accuracy evolve (separate from frequency)?"
                points={evolution
                  .filter((e) => e.efg != null)
                  .map((e) => ({
                    x: e.season,
                    y: (e.efg as number) * 100,
                  }))}
              />
            </div>
          ) : null}

          {log.total > 0 ? (
            <p className="text-[12px]">
              <TransitionLink
                href={playerHref({ playerId, season, view: "games" })}
                scroll={false}
                prefetch={false}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Game log → open a game for flow / PBP →
              </TransitionLink>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

async function AdvancedView({
  playerId,
  season,
  career,
  caps,
}: {
  playerId: string;
  season: string;
  career: PlayerSeason[];
  caps: ReturnType<typeof playerPageCapabilities>;
}) {
  const constrained = slimEdgeProductEnabled();
  const { attachDrblToPlayerSeasons } = await import("@/data/queries/players");
  const [seasonRaw, league, identity] = await Promise.all([
    constrained
      ? Promise.resolve(null)
      : getPlayerSeasonCached(playerId, season).catch(() => null),
    // Bundled BRef peer board + DRBL overlay (getFiltered path) — CF-safe.
    getFilteredPlayerSeasonsCached(season, 15).catch(() => [] as PlayerSeason[]),
    resolvePlayerIdentityCached(playerId).catch(() => null),
  ]);
  const careerSeason = career.find((r) => r.season === season) ?? null;
  const espnId = identity?.espnId ?? null;
  const nbaId = identity?.nbaId ?? null;
  const isFocalPlayer = (row: PlayerSeason) =>
    row.playerId === playerId ||
    (espnId != null && row.playerId === espnId) ||
    (nbaId != null && row.playerId === nbaId);

  // League board already carries sealed DRBL when the season is in-window.
  const peerRow =
    league.find(isFocalPlayer) ??
    null;

  // Career / live season rows often lack DRBL — attach sealed overlay so the
  // marker works even when the player is missing from the GP≥15 peer board.
  const careerWithDrbl = careerSeason
    ? (
        await attachDrblToPlayerSeasons(playerId, [careerSeason]).catch(
          () => [careerSeason]
        )
      )[0] ?? careerSeason
    : null;
  const seasonWithDrbl = seasonRaw
    ? (
        await attachDrblToPlayerSeasons(playerId, [seasonRaw]).catch(
          () => [seasonRaw]
        )
      )[0] ?? seasonRaw
    : null;

  const merged = mergePlayerSeasonStats(
    seasonWithDrbl,
    careerWithDrbl,
    peerRow
  );
  const drblOk = caps.advancedDrbl && merged && hasValidDrblEstimate(merged);

  const percentiles =
    merged && league.length
      ? computePlayerPercentiles(merged, league, 500)
      : [];
  const byKey = new Map(percentiles.map((p) => [p.key, p]));

  const efficiencyRows = [
    {
      label: "TS%",
      valueLabel: merged?.trueShootingPct != null ? formatPct(merged.trueShootingPct) : "—",
      percentile: byKey.get("trueShootingPct")?.percentile ?? null,
    },
    {
      label: "eFG%",
      valueLabel:
        merged?.effectiveFieldGoalPct != null
          ? formatPct(merged.effectiveFieldGoalPct)
          : "—",
      percentile: byKey.get("effectiveFieldGoalPct")?.percentile ?? null,
    },
    {
      label: "3P%",
      valueLabel:
        merged?.threePointPct != null ? formatPct(merged.threePointPct) : "—",
      percentile: byKey.get("threePointPct")?.percentile ?? null,
    },
    {
      label: "FT%",
      valueLabel:
        merged?.freeThrowPct != null ? formatPct(merged.freeThrowPct) : "—",
      percentile: byKey.get("freeThrowPct")?.percentile ?? null,
    },
  ];

  const impactRows = [
    {
      label: "DRBL/100",
      valueLabel: drblOk ? formatNumber(merged!.drbl100, 1) : "n/a",
      percentile: byKey.get("drbl100")?.percentile ?? null,
    },
    {
      label: "WAR1",
      valueLabel:
        drblOk && merged?.r1WinEquivalents != null
          ? formatNumber(merged.r1WinEquivalents, 1)
          : "n/a",
      percentile: byKey.get("r1WinEquivalents")?.percentile ?? null,
    },
  ];

  const drblValues = league
    .filter((r) => hasValidDrblEstimate(r))
    .map((r) => r.drbl100)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  const drblBins = binValues(drblValues, 12);
  const warValues = league
    .filter((r) => hasValidDrblEstimate(r) && r.r1WinEquivalents != null)
    .map((r) => r.r1WinEquivalents)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  const warBins = binValues(warValues, 12);

  const scatterPool = league
    .filter((r) => r.minutes >= 500 && r.trueShootingPct != null)
    .slice(0, 80);
  const scatter = scatterPool.map((r) => ({
    x: r.points / Math.max(1, r.gamesPlayed),
    y: r.trueShootingPct!,
    highlight: isFocalPlayer(r),
    label: r.playerName,
  }));
  if (merged && !scatter.some((p) => p.highlight) && merged.trueShootingPct != null) {
    scatter.push({
      x: merged.points / Math.max(1, merged.gamesPlayed),
      y: merged.trueShootingPct,
      highlight: true,
      label: merged.playerName,
    });
  }

  const validated = PLAYER_SEASON_ADVANCED_METRIC_REGISTRY.filter(
    (m) =>
      m.publicStatus === "PUBLIC" &&
      (m.validationStatus === "VALIDATED" ||
        m.validationStatus === "SOURCE_PROVIDED")
  );

  return (
    <section id="advanced" className="scroll-mt-16 flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Advanced</h2>
        <p className="text-[13px] text-muted-foreground">
          Impact, efficiency, role context — only validated metrics
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {caps.advancedDrbl ? (
          <PlayerImpactMarker
            title="DRBL/100 — how good?"
            valueLabel={drblOk ? formatNumber(merged!.drbl100, 1) : "unavailable"}
            percentile={byKey.get("drbl100")?.percentile ?? null}
            bins={drblBins}
          />
        ) : (
          <div className="rounded-md border border-border px-3 py-2 text-[13px] text-muted-foreground">
            DRBL/100 available 2020-21+ only (never shown as 0 for earlier eras).
          </div>
        )}
        {caps.advancedDrbl ? (
          <PlayerImpactMarker
            title="WAR1 — how much?"
            valueLabel={
              drblOk && merged?.r1WinEquivalents != null
                ? formatNumber(merged.r1WinEquivalents, 1)
                : "unavailable"
            }
            percentile={byKey.get("r1WinEquivalents")?.percentile ?? null}
            bins={warBins}
          />
        ) : (
          <div className="rounded-md border border-border px-3 py-2 text-[13px] text-muted-foreground">
            WAR1 follows the same 2020-21+ support window as DRBL/100.
          </div>
        )}
      </div>

      <PlayerPercentileStrip title="Impact context" rows={impactRows} />
      <PlayerPercentileStrip title="Efficiency percentiles" rows={efficiencyRows} />

      <PlayerContextScatter
        title="Volume vs efficiency"
        question="Where does this player sit on PTS/G vs TS% among qualified peers?"
        points={scatter}
        xLabel="PTS / G"
        yLabel="TS%"
      />

      <section className="flex flex-col gap-2">
        <h3 className="text-[14px] font-bold">Box defensive events</h3>
        <p className="text-[12px] text-muted-foreground">
          BOX DEFENSIVE EVENTS DO NOT REPRESENT TOTAL DEFENSIVE VALUE.
        </p>
        {merged ? (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="STL" value={formatNumber(merged.steals / Math.max(1, merged.gamesPlayed), 1)} />
            <Mini label="BLK" value={formatNumber(merged.blocks / Math.max(1, merged.gamesPlayed), 1)} />
            <Mini label="DRB" value={merged.defensiveRebounds != null ? formatNumber(merged.defensiveRebounds / Math.max(1, merged.gamesPlayed), 1) : "—"} />
            <Mini label="PF" value={formatNumber(merged.personalFouls / Math.max(1, merged.gamesPlayed), 1)} />
          </dl>
        ) : (
          <p className="text-[13px] text-muted-foreground">Season board unavailable.</p>
        )}
      </section>

      <details>
        <summary className="cursor-pointer text-[13px] font-semibold">
          Metric registry ({validated.length} public validated)
        </summary>
        <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
          {PLAYER_SEASON_ADVANCED_METRIC_REGISTRY.map((m) => (
            <li key={m.metricId}>
              <span className="font-semibold text-foreground">{m.name}</span> —{" "}
              {m.validationStatus} · {m.eraCoverage}
            </li>
          ))}
        </ul>
      </details>

      <p className="text-[12px]">
        <TransitionLink
          href="/learn"
          prefetch={false}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Learn DRBL / WAR1 semantics →
        </TransitionLink>
      </p>
    </section>
  );
}

async function HighsView({
  playerId,
  season,
  scopeLabel,
}: {
  playerId: string;
  season: string;
  scopeLabel: string;
}) {
  const highs = await computePlayerGameHighsAsync(playerId, season);
  const timeline = highs.map((h) => ({
    label: h.label,
    value:
      h.key === "minutesNum" ? h.value.toFixed(1) : String(h.value),
    date: `${h.date} vs ${h.opponentAbbr}`,
    href: `/games/${encodeURIComponent(h.gameId)}?season=${encodeURIComponent(h.season)}`,
  }));

  return (
    <section id="highs" className="scroll-mt-16 flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Game highs</h2>
        <p className="text-[13px] text-muted-foreground">{scopeLabel}</p>
      </div>

      {highs.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No game highs available yet for this player.
        </p>
      ) : (
        <>
          <PlayerGameHighTimeline
            title="Season-high timeline"
            events={timeline}
          />
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[36rem] text-left text-[12px]">
              <thead className="border-b border-border bg-secondary/50 text-[10px] font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Stat</th>
                  <th className="px-2 py-2 text-right">High</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Opp</th>
                  <th className="px-2 py-2">Result</th>
                  <th className="px-2 py-2 text-right">MIN</th>
                  <th className="px-2 py-2">Line</th>
                  <th className="px-2 py-2">Ties</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {highs.map((h) => (
                  <tr key={`tbl-${h.key}`}>
                    <td className="px-3 py-2 font-semibold">{h.label}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold">
                      {h.key === "minutesNum" ? h.value.toFixed(1) : h.value}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{h.date}</td>
                    <td className="px-2 py-2">{h.opponentAbbr}</td>
                    <td className="px-2 py-2">{h.result}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {h.minutesNum.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{h.line}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {h.tied > 0 ? `${h.tied + 1} tied` : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <TransitionLink
                        href={`/games/${encodeURIComponent(h.gameId)}?season=${encodeURIComponent(h.season)}`}
                        prefetch={false}
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        Game →
                      </TransitionLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {highs.map((h) => (
              <li key={h.key} className="flex flex-col gap-1 px-3 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{h.label}</span>
                  <span className="tabular-nums font-bold">
                    {h.key === "minutesNum" ? h.value.toFixed(1) : h.value}
                    {h.tied > 0 ? (
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        ({h.tied + 1} games tied)
                      </span>
                    ) : null}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {h.date} · vs {h.opponentAbbr} · {h.result} ·{" "}
                  {h.minutesNum.toFixed(1)} MIN · {h.line}
                </p>
                <TransitionLink
                  href={`/games/${encodeURIComponent(h.gameId)}?season=${encodeURIComponent(h.season)}`}
                  prefetch={false}
                  className="text-[12px] font-semibold underline-offset-2 hover:underline"
                >
                  Open game →
                </TransitionLink>
                {h.tied > 0 ? (
                  <details className="text-[12px]">
                    <summary className="cursor-pointer text-muted-foreground">
                      Explore tied games
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {h.tiedGames.map((g) => (
                        <li key={g.gameId}>
                          <TransitionLink
                            href={`/games/${encodeURIComponent(g.gameId)}?season=${encodeURIComponent(g.season)}`}
                            prefetch={false}
                            className="underline-offset-2 hover:underline"
                          >
                            {g.date}
                          </TransitionLink>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

async function OverviewDepthLinks({
  playerId,
  season,
  caps,
  fromHistory,
  themeMode,
}: {
  playerId: string;
  season: string;
  caps: ReturnType<typeof playerPageCapabilities>;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const recent = caps.gameLogs
    ? await getCompactPlayerGameLogAsync({
        playerId,
        season,
        page: 1,
        pageSize: 5,
      })
    : null;
  const highs = caps.gameHighs
    ? await computePlayerGameHighsAsync(playerId, season)
    : [];

  return (
    <section id="stat-depth" className="scroll-mt-16 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-[13px] font-semibold">
        {(
          [
            ["career", "Career table"],
            caps.gameLogs ? ["games", "Full game log"] : null,
            caps.splits ? ["splits", "Splits"] : null,
            ["shooting", "Shooting"],
            ["advanced", "Advanced"],
            caps.gameHighs ? ["highs", "Game highs"] : null,
          ] as const
        )
          .filter(Boolean)
          .map((item) => {
            const [id, label] = item as [PlayerPageView, string];
            return (
              <TransitionLink
                key={id}
                href={playerHref({
                  playerId,
                  season,
                  view: id,
                  fromHistory,
                  themeMode,
                })}
                scroll={false}
                prefetch={false}
                className="underline-offset-2 hover:underline"
              >
                {label} →
              </TransitionLink>
            );
          })}
      </div>

      {highs.length > 0 ? (
        <div>
          <h3 className="text-[14px] font-bold tracking-tight">
            Game highs preview
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-[12px]">
            {highs.slice(0, 6).map((h) => (
              <li
                key={h.key}
                className="rounded-md border border-border px-2 py-1 tabular-nums"
              >
                {h.label}{" "}
                <span className="font-semibold">
                  {h.key === "minutesNum" ? h.value.toFixed(1) : h.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recent && recent.total > 0 ? (
        <div>
          <h3 className="text-[14px] font-bold tracking-tight">
            Last {recent.rows.length} games
          </h3>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {recent.rows.map((g) => (
              <li key={g.gameId}>
                <TransitionLink
                  href={`/games/${encodeURIComponent(g.gameId)}?season=${encodeURIComponent(season)}`}
                  prefetch={false}
                  className="flex flex-wrap justify-between gap-2 px-3 py-2 text-[13px] hover:bg-secondary/30"
                >
                  <span>
                    {g.date} · {g.homeAway === "home" ? "vs" : "@"}{" "}
                    {g.opponentAbbr} · {g.result}
                  </span>
                  <span className="tabular-nums">{g.points} PTS</span>
                </TransitionLink>
              </li>
            ))}
          </ul>
        </div>
      ) : !caps.gameLogs ? (
        <p className="text-[13px] text-muted-foreground">
          Game logs unavailable before 1996-97. Career stats still apply.
        </p>
      ) : null}
    </section>
  );
}

function binValues(values: number[], bins: number): number[] {
  if (!values.length) return Array.from({ length: bins }, () => 0);
  const min = values[0]!;
  const max = values[values.length - 1]!;
  const span = max - min || 1;
  const out = Array.from({ length: bins }, () => 0);
  for (const v of values) {
    const idx = Math.min(
      bins - 1,
      Math.floor(((v - min) / span) * bins)
    );
    out[idx]! += 1;
  }
  return out;
}

function EraUnavailable({
  title,
  season,
  detail,
}: {
  title: string;
  season: string;
  detail: string;
}) {
  return (
    <section className="scroll-mt-16 flex flex-col gap-2">
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      <p className="text-[13px] text-muted-foreground">
        Not available for {season}. {detail}
      </p>
    </section>
  );
}

function Mini({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {help ? (
          <MetricHelp conceptId={help as "efg"}>{label}</MetricHelp>
        ) : (
          label
        )}
      </p>
      <p className="mt-1 text-[16px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SplitTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    games: number;
    minutes: number;
    ptsPerG: number;
    rebPerG: number;
    astPerG: number;
    tovPerG: number;
    fgPct: number | null;
    threePct: number | null;
    ftPct: number | null;
    ts: number | null;
    efg: number | null;
  }>;
}) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-[14px] font-bold">{title}</h3>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[40rem] text-left text-[12px]">
          <thead className="border-b border-border bg-secondary/50 text-[10px] font-semibold uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{title}</th>
              <th className="px-2 py-2 text-right">G</th>
              <th className="px-2 py-2 text-right">MIN</th>
              <th className="px-2 py-2 text-right">PTS</th>
              <th className="px-2 py-2 text-right">REB</th>
              <th className="px-2 py-2 text-right">AST</th>
              <th className="px-2 py-2 text-right">FG%</th>
              <th className="px-2 py-2 text-right">3P%</th>
              <th className="px-2 py-2 text-right">FT%</th>
              <th className="px-2 py-2 text-right">TS%</th>
              <th className="px-2 py-2 text-right">eFG%</th>
              <th className="px-2 py-2 text-right">TOV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-3 py-2 font-semibold">{r.label}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.games}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.minutes.toFixed(0)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.ptsPerG.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.rebPerG.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.astPerG.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(r.fgPct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(r.threePct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(r.ftPct)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(r.ts)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {pct(r.efg)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.tovPerG.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
