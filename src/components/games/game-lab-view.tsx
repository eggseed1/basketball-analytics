"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { GameAnalysisSummary, GameWinningFactor } from "@/analytics/game-lab";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { cn } from "@/lib/utils";

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
            <span className="font-semibold text-foreground">{f.label}</span>
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
            <Link
              href={row.playerHref}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-white/50"
            >
              <span className="text-[13px] font-semibold">
                {row.playerName}
                <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                  {row.teamLabel}
                </span>
              </span>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {row.display}
              </span>
            </Link>
            {row.detail ? (
              <p className="px-1 text-[11px] text-muted-foreground">{row.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GameLabView({
  analysis,
  children,
}: {
  analysis: GameAnalysisSummary;
  children?: ReactNode;
}) {
  const [showMethod, setShowMethod] = useState(false);
  const { outcome, flow, coverage } = analysis;
  const winnerKey =
    outcome.winner === "home"
      ? analysis.home?.teamId
      : outcome.winner === "away"
        ? analysis.away?.teamId
        : analysis.home?.teamId;

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Game hero ——— */}
      <TeamWashCard
        teamKey={analysis.away?.teamId}
        secondaryTeamKey={analysis.home?.teamId}
        className="flex flex-col gap-4 p-4 sm:p-5"
        as="header"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {analysis.gameDate} · {analysis.season} ·{" "}
            <span className="capitalize">{analysis.status}</span>
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Coverage · {coverage.depth}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2">
              <TeamLogo teamKey={analysis.away?.teamId ?? outcome.awayLabel} size="md" />
              <span className="text-[18px] font-bold tracking-tight sm:text-[22px]">
                {outcome.awayLabel}
              </span>
              <span className="text-[28px] font-bold tabular-nums tracking-tight sm:text-[36px]">
                {outcome.awayScore}
              </span>
            </div>
            <span className="text-[14px] font-bold text-muted-foreground">—</span>
            <div className="flex items-center gap-2">
              <span className="text-[28px] font-bold tabular-nums tracking-tight sm:text-[36px]">
                {outcome.homeScore}
              </span>
              <span className="text-[18px] font-bold tracking-tight sm:text-[22px]">
                {outcome.homeLabel}
              </span>
              <TeamLogo teamKey={analysis.home?.teamId ?? outcome.homeLabel} size="md" />
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {outcome.awayName} at {outcome.homeName}
          </p>
          {outcome.winner !== "even" ? (
            <p className="text-[15px] font-bold tracking-tight">
              {outcome.winner === "home" ? outcome.homeLabel : outcome.awayLabel}{" "}
              <span className="tabular-nums text-muted-foreground">
                {outcome.winner === "home"
                  ? outcome.marginDisplay
                  : `+${Math.abs(outcome.margin)}`}
              </span>
            </p>
          ) : (
            <p className="text-[15px] font-bold tracking-tight">Final · tied</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {analysis.heroMetrics.map((m) => (
            <div key={m.id}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.label}
              </dt>
              <dd className="text-[15px] font-bold tabular-nums">{m.display}</dd>
            </div>
          ))}
        </dl>
      </TeamWashCard>

      {/* ——— Game flow ——— */}
      <TeamWashCard
        teamKey={winnerKey}
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Game flow</h2>
          <p className="text-[13px] text-muted-foreground">
            {flow.available
              ? "Period scoring and end-of-period lead — when did the score shift?"
              : "Period scoring is not available for this game."}
          </p>
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
      </TeamWashCard>

      {/* ——— What decided it ——— */}
      <TeamWashCard
        teamKey={winnerKey}
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            What decided the game?
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Measurable team differences from the box score — not possession
            narratives.
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
                  <span className="text-[14px] font-semibold">{f.label}</span>
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
      </TeamWashCard>

      {/* ——— What changed ——— */}
      {analysis.whatChanged.length ? (
        <TeamWashCard teamKey={winnerKey} className="flex flex-col gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">What changed?</h2>
            <p className="text-[13px] text-muted-foreground">
              Period-level scoring swings from available linescores.
            </p>
          </div>
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
        </TeamWashCard>
      ) : null}

      {/* ——— Team performance context ——— */}
      {analysis.teamContext.length ? (
        <TeamWashCard
          teamKey={analysis.home?.teamId}
          secondaryTeamKey={analysis.away?.teamId}
          className="flex flex-col gap-3 p-4 sm:p-5"
        >
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">
              Team performance context
            </h2>
            <p className="text-[13px] text-muted-foreground">
              This game vs each team&apos;s {analysis.season} season average.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["away", "home"] as const).map((side) => {
              const rows = analysis.teamContext.filter((m) => m.side === side);
              if (!rows.length) return null;
              const label =
                side === "home" ? outcome.homeLabel : outcome.awayLabel;
              return (
                <div key={side}>
                  <h3 className="text-[13px] font-bold tracking-tight">{label}</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {rows.map((m) => (
                      <li key={m.id}>
                        <p className="text-[15px] font-bold tabular-nums">
                          {m.gameDisplay}{" "}
                          <span className="text-[12px] font-semibold text-muted-foreground">
                            {m.label}
                          </span>
                        </p>
                        {m.seasonAvgDisplay && m.vsSeasonDisplay ? (
                          <p className="text-[12px] text-muted-foreground">
                            Season avg {m.seasonAvgDisplay} ·{" "}
                            <span className="font-semibold text-foreground">
                              {m.vsSeasonDisplay}
                            </span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </TeamWashCard>
      ) : null}

      {/* ——— Player performance ——— */}
      <TeamWashCard
        teamKey={winnerKey}
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            Who mattered?
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Transparent category leaders from the box score — not a single
            player grade. Tap a name for the player page; use{" "}
            <span className="font-semibold text-foreground">i</span> in the box
            score for vs-season context.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <HighlightBlock
            title="Best scoring performances"
            rows={analysis.playerHighlights.scoring}
          />
          <HighlightBlock
            title="Best all-around performances"
            rows={analysis.playerHighlights.allAround}
          />
          <HighlightBlock
            title="Plus/minus leaders"
            rows={analysis.playerHighlights.plusMinus}
          />
          <HighlightBlock
            title="Largest vs season average (points)"
            rows={analysis.playerHighlights.vsSeason}
          />
        </div>
      </TeamWashCard>

      {/* ——— Box score ——— */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Box score</h2>
          <p className="text-[13px] text-muted-foreground">
            Full traditional and advanced lines · player-self context intact.
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
              Game Lab methodology v{analysis.methodology.version} ·{" "}
              {analysis.methodology.scope}
            </p>
            <p>{analysis.methodology.teamTotalsRule}</p>
            <p>{analysis.methodology.winningFactorsRule}</p>
            <p>{analysis.methodology.teamContextRule}</p>
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
