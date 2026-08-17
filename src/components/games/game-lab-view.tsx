"use client";

import { useMemo, useState, type ReactNode } from "react";

import type { GameAnalysisSummary, GameWinningFactor } from "@/analytics/game-lab";
import { TeamLogo } from "@/components/brand/team-logo";
import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { TransitionLink } from "@/components/continuity/query-nav";
import { GameCountdown } from "@/components/sports/game-countdown";
import { GameWatchOptions } from "@/components/sports/game-watch-options";
import { LiveFreshness } from "@/components/sports/live-freshness";
import { LiveIndicator } from "@/components/sports/live-indicator";
import { useLiveGameRefresh } from "@/components/sports/use-live-scoreboard-refresh";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import { conceptIdForFactorId } from "@/lib/learn-column-concepts";
import {
  isFinalStatus,
  isLiveLikeStatus,
  isPreTipStatus,
  periodClockLabel,
  statusHeadline,
  type GameStatusKind,
} from "@/lib/game-status";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import type { GameSummary } from "@/data/types";
import { cn } from "@/lib/utils";

function FactorLabel({ id, label }: { id: string; label: string }) {
  const conceptId = conceptIdForFactorId(id);
  if (!conceptId) {
    return <span className="font-semibold text-foreground">{label}</span>;
  }
  return (
    <MetricHelp conceptId={conceptId} labelClassName="font-semibold text-foreground">
      {label}
    </MetricHelp>
  );
}

function FactorList({
  title,
  factors,
  teamLabel,
}: {
  title: string;
  factors: GameWinningFactor[];
  teamLabel: string;
}) {
  if (!factors.length) {
    return (
      <div>
        <h3 className="text-[13px] font-bold tracking-tight">{title}</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          No meaningful advantages for {teamLabel}.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-[13px] font-bold tracking-tight">{title}</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {factors.map((f) => (
          <li key={f.id} className="text-[13px] text-muted-foreground">
            <FactorLabel id={f.id} label={f.label} />
            <span className="ml-2 tabular-nums">{f.deltaDisplay}</span>
            <span className="ml-1 text-[11px]">
              ({f.homeDisplay} home · {f.awayDisplay} away)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HighlightBlock({
  title,
  rows,
}: {
  title: string;
  rows: GameAnalysisSummary["playerHighlights"]["scoring"];
}) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-[13px] font-bold tracking-tight">{title}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={`${title}-${row.playerId}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-white/50">
              <PlayerIdentity
                playerId={row.playerId}
                name={row.playerName}
                teamLabel={row.teamLabel}
                href={row.playerHref}
                variant="compact"
                nameClassName="text-[13px] font-semibold"
              >
                <span>
                  {row.playerName}
                  <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                    {row.teamLabel}
                  </span>
                </span>
              </PlayerIdentity>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {row.display}
              </span>
            </div>
            {row.detail ? (
              <p className="px-1 text-[11px] text-muted-foreground">{row.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function heroConceptId(id: string, label: string): string | null {
  const fromId = conceptIdForFactorId(id);
  if (fromId) return fromId;
  const lower = label.toLowerCase();
  if (lower.includes("efg")) return "efg";
  if (lower.includes("true shooting") || lower.includes("ts%")) return "ts";
  if (lower.includes("turnover")) return "tov";
  if (lower.includes("rebound")) return "reb";
  if (lower.includes("margin") || lower.includes("lead")) return "diff";
  return null;
}

export function GameLabView({
  analysis,
  arrival,
  children,
  omitHero = false,
}: {
  analysis: GameAnalysisSummary;
  /** Optional Season Evidence arrival banner. */
  arrival?: { label: string } | null;
  children?: ReactNode;
  /**
   * When true, skip the matchup hero — page already shows a stable
   * GameIdentityShell so the header does not remount when analysis arrives.
   */
  omitHero?: boolean;
}) {
  const [showMethod, setShowMethod] = useState(false);
  const { outcome, flow, coverage } = analysis;

  const seed = useMemo((): GameSummary => {
    return {
      id: analysis.gameId,
      season: analysis.season,
      gameDate: analysis.gameDate,
      tipOffAt: analysis.tipOffAt,
      status: analysis.status as GameStatusKind,
      homeTeamId: outcome.homeTeamId,
      awayTeamId: outcome.awayTeamId,
      homeScore: outcome.homeScore,
      awayScore: outcome.awayScore,
      period: analysis.period,
      displayClock: analysis.displayClock,
      broadcasts: analysis.broadcasts,
      gameType: "regular",
      totalPoints: outcome.totalPoints,
      margin: outcome.margin,
      absMargin: Math.abs(outcome.margin),
    };
  }, [analysis, outcome]);

  const { game: liveOverlay } = useLiveGameRefresh(seed, {
    season: analysis.season,
    enabled: !isFinalStatus(analysis.status as GameStatusKind),
  });

  const status = (liveOverlay?.status ?? analysis.status) as GameStatusKind;
  const live = isLiveLikeStatus(status);
  const preTip = isPreTipStatus(status);
  const final = isFinalStatus(status);
  const showScores = live || final || status === "suspended";
  const homeScore = liveOverlay?.homeScore ?? outcome.homeScore;
  const awayScore = liveOverlay?.awayScore ?? outcome.awayScore;
  const tipOffAt = liveOverlay?.tipOffAt ?? analysis.tipOffAt;
  const liveClock = periodClockLabel({
    status,
    period: liveOverlay?.period ?? analysis.period,
    displayClock: liveOverlay?.displayClock ?? analysis.displayClock,
  });

  // Prefer era abbr/label for chrome (logos/wash). Never key historical SEA off
  // franchise id 25 alone — that resolves to modern OKC branding.
  const awayThemeKey =
    outcome.awayLabel || analysis.away?.teamId || outcome.awayTeamId;
  const homeThemeKey =
    outcome.homeLabel || analysis.home?.teamId || outcome.homeTeamId;

  const awayBrand = resolveHistoricalTeamBrand(
    outcome.awayTeamId,
    analysis.season,
    "era"
  );
  const homeBrand = resolveHistoricalTeamBrand(
    outcome.homeTeamId,
    analysis.season,
    "era"
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Game hero (omitted when page owns stable GameIdentityShell) ——— */}
      {!omitHero ? (
      <MatchupWashCard
        awayTeamKey={awayThemeKey}
        homeTeamKey={homeThemeKey}
        intensity="hero"
        className="flex flex-col gap-4 p-4 sm:p-5"
        as="header"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {analysis.gameDate} · {analysis.season}
            {arrival?.label ? (
              <>
                {" · "}
                <MetricHelp conceptId="season_evidence" labelClassName="font-bold uppercase tracking-[0.12em]">
                  Season Evidence
                </MetricHelp>
                {" · "}
                {arrival.label}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {live ? (
              <span className="flex flex-col items-end gap-0.5">
                <span className="flex items-center gap-2">
                  <LiveIndicator />
                  {liveClock ? (
                    <span className="text-[12px] font-semibold tabular-nums">
                      {liveClock}
                    </span>
                  ) : null}
                </span>
                <LiveFreshness retrievedAt={liveOverlay?.retrievedAt} />
              </span>
            ) : preTip ? (
              <GameCountdown tipOffAt={tipOffAt} />
            ) : (
              <span className="text-[12px] font-bold uppercase tracking-wide">
                {statusHeadline(status)}
              </span>
            )}
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {coverage.availability === "scoreboard" ? (
                <MetricHelp
                  conceptId="scoreboard_only"
                  labelClassName="font-semibold uppercase tracking-wide"
                >
                  Scoreboard only
                </MetricHelp>
              ) : (
                <>Coverage · {coverage.depth}</>
              )}
            </p>
          </div>
        </div>

        {coverage.availability === "scoreboard" ? (
          <p className="text-[12px] text-muted-foreground">
            <MetricHelp conceptId="scoreboard_only">
              Scoreboard data available
            </MetricHelp>{" "}
            · detailed box score unavailable
          </p>
        ) : null}

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2">
              <TeamLogo
                teamKey={awayBrand?.abbreviation ?? awayThemeKey}
                size="md"
                logoUrl={awayBrand?.logoUrl}
                logoSource={awayBrand?.source}
                textAbbr={awayBrand?.abbreviation}
                logoPalette={awayBrand?.palette}
              />
              <TransitionLink
                href={`/teams/${encodeURIComponent(outcome.awayTeamId)}?season=${encodeURIComponent(analysis.season)}`}
                className="text-[18px] font-bold tracking-tight underline-offset-4 hover:underline sm:text-[22px]"
              >
                {outcome.awayLabel}
              </TransitionLink>
              {showScores ? (
                <span className="text-[28px] font-bold tabular-nums tracking-tight sm:text-[36px]">
                  {awayScore}
                </span>
              ) : null}
            </div>
            <span className="text-[14px] font-bold text-muted-foreground">
              {showScores ? "—" : "vs"}
            </span>
            <div className="flex items-center gap-2">
              {showScores ? (
                <span className="text-[28px] font-bold tabular-nums tracking-tight sm:text-[36px]">
                  {homeScore}
                </span>
              ) : null}
              <TransitionLink
                href={`/teams/${encodeURIComponent(outcome.homeTeamId)}?season=${encodeURIComponent(analysis.season)}`}
                className="text-[18px] font-bold tracking-tight underline-offset-4 hover:underline sm:text-[22px]"
              >
                {outcome.homeLabel}
              </TransitionLink>
              <TeamLogo
                teamKey={homeBrand?.abbreviation ?? homeThemeKey}
                size="md"
                logoUrl={homeBrand?.logoUrl}
                logoSource={homeBrand?.source}
                textAbbr={homeBrand?.abbreviation}
                logoPalette={homeBrand?.palette}
              />
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {outcome.awayName} at {outcome.homeName}
          </p>
          {showScores && final && homeScore !== awayScore ? (
            <p className="text-[15px] font-bold tracking-tight">
              {homeScore > awayScore ? outcome.homeLabel : outcome.awayLabel}{" "}
              <span className="tabular-nums text-muted-foreground">
                +{Math.abs(homeScore - awayScore)}
              </span>
            </p>
          ) : showScores && final ? (
            <p className="text-[15px] font-bold tracking-tight">Final · tied</p>
          ) : showScores && homeScore === awayScore ? (
            <p className="text-[15px] font-bold tracking-tight text-muted-foreground">
              Score tied
            </p>
          ) : null}
        </div>

        {showScores ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {analysis.heroMetrics.map((m) => {
              const conceptId = heroConceptId(m.id, m.label);
              return (
                <div key={m.id}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {conceptId ? (
                      <MetricHelp
                        conceptId={conceptId}
                        labelClassName="uppercase tracking-wide"
                      >
                        {m.label}
                      </MetricHelp>
                    ) : (
                      m.label
                    )}
                  </dt>
                  <dd className="text-[15px] font-bold tabular-nums">
                    {m.display}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        <GameWatchOptions
          broadcasts={analysis.broadcasts}
          className="border-t border-border/60 pt-3"
        />
      </MatchupWashCard>
      ) : null}

      {/* ——— Game flow ——— */}
      <MatchupWashCard
        awayTeamKey={awayThemeKey}
        homeTeamKey={homeThemeKey}
        intensity="subtle"
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Game flow</h2>
          <p className="text-[13px] text-muted-foreground">
            {flow.available
              ? "Period scoring and end-of-period lead — when did the score shift?"
              : "Period scoring is not available for this game."}
          </p>
          {!flow.available ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              <MetricHelp conceptId="unavailable">Unavailable</MetricHelp>
              {" — "}
              linescores were not provided for this game.
            </p>
          ) : null}
        </div>

        {flow.available ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">Period</th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      {outcome.awayLabel}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      {outcome.homeLabel}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      After
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {flow.periods.map((p) => (
                    <tr key={p.periodIndex} className="border-t border-border/70">
                      <td className="px-2 py-1.5 font-semibold">{p.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {p.awayPoints}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {p.homePoints}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {p.awayCumulative}–{p.homeCumulative}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {p.leader === "even"
                          ? "Tied"
                          : `${p.leader === "home" ? outcome.homeLabel : outcome.awayLabel} ${p.margin > 0 ? "+" : ""}${p.margin}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Compact cumulative bars */}
            <ul className="flex flex-col gap-2">
              {flow.periods.map((p) => {
                const total = Math.max(1, p.homeCumulative + p.awayCumulative);
                const homePct = (p.homeCumulative / total) * 100;
                return (
                  <li key={`bar-${p.periodIndex}`} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {p.label}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-foreground/80"
                        style={{ width: `${homePct}%` }}
                        title={`${outcome.homeLabel} share of cumulative points`}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {p.awayCumulative}–{p.homeCumulative}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Bar fill = {outcome.homeLabel} share of cumulative points after each
              period.
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {flow.notes[0]}
          </p>
        )}

        {/* Future Lineup Lab insertion point — intentionally not rendered empty. */}
      </MatchupWashCard>

      {/* ——— What decided it ——— */}
      <MatchupWashCard
        awayTeamKey={awayThemeKey}
        homeTeamKey={homeThemeKey}
        intensity="subtle"
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            What decided the game?
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Measurable team differences from the box score —{" "}
            <MetricHelp conceptId="game_lab">Game Lab</MetricHelp> winning
            factors, not possession narratives.
          </p>
        </div>

        {analysis.winningFactors.length ? (
          <ul className="flex flex-col gap-2">
            {analysis.winningFactors.slice(0, 6).map((f) => {
              const edgeLabel =
                f.edge === "home" ? outcome.homeLabel : outcome.awayLabel;
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                >
                  <FactorLabel id={f.id} label={f.label} />
                  <span className="text-[13px] tabular-nums text-muted-foreground">
                    <span className="font-bold text-foreground">{edgeLabel}</span>
                    {" · "}
                    {f.deltaDisplay}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {analysis.overallReason}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FactorList
            title={`${outcome.homeLabel} advantages`}
            factors={analysis.homeAdvantages}
            teamLabel={outcome.homeLabel}
          />
          <FactorList
            title={`${outcome.awayLabel} advantages`}
            factors={analysis.awayAdvantages}
            teamLabel={outcome.awayLabel}
          />
        </div>

        <p className="text-[14px] font-semibold">
          Overall game edge:{" "}
          <span className="text-foreground">{analysis.overallEdgeDisplay}</span>
        </p>
        <p className="text-[12px] text-muted-foreground">{analysis.overallReason}</p>
      </MatchupWashCard>

      {/* ——— What changed ——— */}
      <MatchupWashCard
        awayTeamKey={awayThemeKey}
        homeTeamKey={homeThemeKey}
        intensity="subtle"
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">What changed?</h2>
          <p className="text-[13px] text-muted-foreground">
            {analysis.whatChanged.length
              ? "Period-level scoring swings from available linescores."
              : "Period scoring unavailable for this game."}
          </p>
        </div>
        {analysis.whatChanged.length ? (
          <ul className="flex flex-col gap-2">
            {analysis.whatChanged.map((line) => (
              <li
                key={line}
                className="text-[14px] leading-relaxed text-muted-foreground"
              >
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </MatchupWashCard>

      {/* ——— How unusual / What stood out (V1.1) ——— */}
      {(() => {
        const ctx = analysis.gameSeasonContext;
        if (!ctx) return null;
        if (ctx.availability === "hidden_live" || ctx.availability === "hidden_incomplete") {
          return (
            <MatchupWashCard
            awayTeamKey={awayThemeKey}
            homeTeamKey={homeThemeKey}
            intensity="subtle"
            className="flex flex-col gap-2 p-4 sm:p-5"
          >
              <h2 className="text-[17px] font-bold tracking-tight">
                How unusual was this game?
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {ctx.availabilityNote}
              </p>
            </MatchupWashCard>
          );
        }
        if (ctx.availability === "unavailable") {
          return (
            <MatchupWashCard
            awayTeamKey={awayThemeKey}
            homeTeamKey={homeThemeKey}
            intensity="subtle"
            className="flex flex-col gap-2 p-4 sm:p-5"
          >
              <h2 className="text-[17px] font-bold tracking-tight">
                How unusual was this game?
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {ctx.availabilityNote ??
                  "Season baselines unavailable for a trustworthy comparison."}
              </p>
            </MatchupWashCard>
          );
        }

        const sides = [ctx.away, ctx.home].filter(
          (t): t is NonNullable<typeof t> => Boolean(t?.available)
        );

        return (
          <MatchupWashCard
            awayTeamKey={awayThemeKey}
            homeTeamKey={homeThemeKey}
            intensity="subtle"
            className="flex flex-col gap-5 p-4 sm:p-5"
          >
            <div>
              <h2 className="text-[17px] font-bold tracking-tight">
                How unusual was this game?
              </h2>
              <p className="text-[13px] text-muted-foreground">
                Game values vs each team&apos;s{" "}
                <MetricHelp conceptId="season_baseline">
                  season baseline
                </MetricHelp>{" "}
                for {analysis.season}. Descriptive context — not a win cause.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {sides.map((team) => (
                <div key={team.side} className="flex flex-col gap-3">
                  <h3 className="text-[14px] font-bold tracking-tight">
                    {team.name}
                  </h3>
                  <ul className="flex flex-col gap-2.5">
                    {team.highlightMetrics.map((m) => (
                      <li key={m.id}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {m.conceptId ? (
                            <MetricHelp
                              conceptId={m.conceptId}
                              labelClassName="font-semibold uppercase tracking-wide"
                            >
                              {m.label}
                            </MetricHelp>
                          ) : (
                            m.label
                          )}
                        </p>
                        <p className="text-[18px] font-bold tabular-nums tracking-tight">
                          {m.gameDisplay}
                        </p>
                        <p
                          className={cn(
                            "text-[13px]",
                            m.meaningful
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {m.meaningful
                            ? m.deltaDisplay
                            : "Near season normal"}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {team.fingerprint.some((f) => f.band !== "unavailable") ? (
                    <div className="mt-1 border-t border-border/60 pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Game fingerprint
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-0.5">
                        {team.fingerprint
                          .filter((f) => f.band !== "unavailable")
                          .map((f) => (
                            <li
                              key={f.id}
                              className="text-[13px] text-muted-foreground"
                            >
                              <span className="font-semibold text-foreground">
                                {f.label}:
                              </span>{" "}
                              {f.band}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {ctx.findings.length ? (
              <div className="border-t border-border/60 pt-4">
                <h3 className="text-[15px] font-bold tracking-tight">
                  What stood out?
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Deterministic findings from vs-
                  <MetricHelp
                    conceptId="season_baseline"
                    labelClassName="font-normal"
                  >
                    season
                  </MetricHelp>{" "}
                  deltas — not causal claims.
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {ctx.findings.map((f) => (
                    <li
                      key={f.id}
                      className="text-[14px] leading-relaxed text-muted-foreground"
                    >
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No metric cleared its unusualness tolerance — this night looks
                essentially normal vs each team&apos;s season baseline.
              </p>
            )}

            {ctx.depth === "minimal" || ctx.depth === "partial" ? (
              <p className="text-[11px] text-muted-foreground">
                Coverage: {ctx.depth}
                {ctx.depth === "minimal"
                  ? " (scoreboard context only)"
                  : " (some box rates unavailable)"}
                .
              </p>
            ) : null}
          </MatchupWashCard>
        );
      })()}

      {/* ——— Player performance ——— */}
      <MatchupWashCard
        awayTeamKey={awayThemeKey}
        homeTeamKey={homeThemeKey}
        intensity="subtle"
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Who mattered?
          </h2>
          {coverage.availability === "scoreboard" ||
          !coverage.hasBoxScore ? (
            <p className="text-[13px] text-muted-foreground">
              Player-level game data unavailable — box score lines were not
              provided for this game.
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Transparent category leaders from the box score — not a single
              player grade. Tap a name for the player page; use{" "}
              <span className="font-semibold text-foreground">i</span> in the box
              score for vs-season context.
            </p>
          )}
        </div>
        {coverage.hasBoxScore ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <HighlightBlock
            title="Best scoring performances"
            rows={analysis.playerHighlights.scoring}
          />
          <HighlightBlock
            title="Best all-around performances"
            rows={analysis.playerHighlights.allAround}
          />
          {analysis.playerHighlights.plusMinus.length ? (
            <div>
              <h3 className="text-[13px] font-bold tracking-tight">
                <MetricHelp conceptId="plus_minus">Plus/minus</MetricHelp>{" "}
                leaders
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {analysis.playerHighlights.plusMinus.map((row) => (
                  <li key={`pm-${row.playerId}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-white/50">
                      <PlayerIdentity
                        playerId={row.playerId}
                        name={row.playerName}
                        teamLabel={row.teamLabel}
                        href={row.playerHref}
                        variant="compact"
                        nameClassName="text-[13px] font-semibold"
                      >
                        <span>
                          {row.playerName}
                          <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                            {row.teamLabel}
                          </span>
                        </span>
                      </PlayerIdentity>
                      <span className="text-[12px] tabular-nums text-muted-foreground">
                        {row.display}
                      </span>
                    </div>
                    {row.detail ? (
                      <p className="px-1 text-[11px] text-muted-foreground">
                        {row.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <HighlightBlock
            title="Largest vs season average (points)"
            rows={analysis.playerHighlights.vsSeason}
          />
        </div>
        ) : null}
      </MatchupWashCard>

      {/* ——— Box score ——— */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Box score</h2>
          <p className="text-[13px] text-muted-foreground">
            {coverage.hasBoxScore
              ? "Full traditional and advanced lines · player-self context intact."
              : "Box score unavailable for this game."}
          </p>
        </div>
        {children}
      </section>

      {/* ——— Capability + methodology ——— */}
      <section className="sports-card flex flex-col gap-2 px-4 py-4 sm:px-5">
        {!coverage.pbpAvailable ? (
          <p className="text-[12px] text-muted-foreground">
            Deeper possession analysis will appear when possession-level data is
            available.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setShowMethod((v) => !v)}
          className={cn(
            "self-start text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          )}
          aria-expanded={showMethod}
        >
          How is this calculated?
        </button>
        {showMethod ? (
          <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
            <p>
              <MetricHelp conceptId="game_lab">Game Lab</MetricHelp> methodology
              v{analysis.methodology.version} · {analysis.methodology.scope}
            </p>
            <p>{analysis.methodology.teamTotalsRule}</p>
            <p>{analysis.methodology.winningFactorsRule}</p>
            <p>{analysis.methodology.teamContextRule}</p>
            <p>{analysis.methodology.gameSeasonContextRule}</p>
            <p>{analysis.methodology.flowRule}</p>
            <p>{analysis.methodology.playerHighlightsRule}</p>
            <p>{analysis.methodology.missingDataRule}</p>
            <p>{analysis.methodology.setLimits}</p>
            {coverage.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
