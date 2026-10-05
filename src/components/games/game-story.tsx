import type { ReactNode } from "react";

import type {
  GameAnalysisSummary,
  GameTeamTotals,
  GameWinningFactor,
} from "@/analytics/game-lab";
import { GlassSurface } from "@/components/brand/glass-surface";
import { MatchupWashCard } from "@/components/brand/team-wash-card";
import { MoreInfo } from "@/components/ui/more-info";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Side = "home" | "away";

type TeamColors = { away: string; home: string };

/** Smaller deficits are routine back-and-forth, so they don't get a tile. */
const COMEBACK_MIN = 6;

function TeamDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

function StoryTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
}) {
  return (
    <GlassSurface
      effect="css"
      className="flex min-w-0 flex-col gap-1 px-3.5 py-3"
    >
      <span
        className={cn(
          type.micro,
          "font-bold uppercase tracking-[0.12em] text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span className="text-[24px] font-bold leading-tight tracking-tight tabular-nums">
        {value}
      </span>
      {sub ? (
        <span
          className={cn(
            type.caption,
            "flex min-w-0 items-center gap-1.5 text-muted-foreground"
          )}
        >
          {color ? <TeamDot color={color} /> : null}
          <span className="truncate">{sub}</span>
        </span>
      ) : null}
    </GlassSurface>
  );
}

/**
 * At-a-glance game story from the validated score timeline and period
 * scores. Tiles without source data are left out, never shown as 0.
 */
export function GameStoryStrip({
  analysis,
  colors,
}: {
  analysis: GameAnalysisSummary;
  colors: TeamColors;
}) {
  const { outcome, flow } = analysis;
  const label = (side: Side) =>
    side === "home" ? outcome.homeLabel : outcome.awayLabel;
  const tiles: ReactNode[] = [];
  const story = flow.story;

  if (story) {
    const homeLead = story.largestHomeLead;
    const awayLead = story.largestAwayLead;
    if (homeLead > 0 || awayLead > 0) {
      const side: Side = homeLead >= awayLead ? "home" : "away";
      const other: Side = side === "home" ? "away" : "home";
      const otherLead = other === "home" ? homeLead : awayLead;
      tiles.push(
        <StoryTile
          key="lead"
          label="Biggest lead"
          value={`+${Math.max(homeLead, awayLead)}`}
          color={colors[side]}
          sub={`${label(side)} · ${label(other)} ${otherLead > 0 ? `best +${otherLead}` : "never led"}`}
        />
      );
    }
    tiles.push(
      <StoryTile
        key="changes"
        label="Lead changes"
        value={story.leadChanges}
        sub={`Tied ${story.ties} time${story.ties === 1 ? "" : "s"}`}
      />
    );
    const runHome = story.largestStrictRunHome;
    const runAway = story.largestStrictRunAway;
    if (runHome != null || runAway != null) {
      const side: Side = (runHome ?? -1) >= (runAway ?? -1) ? "home" : "away";
      const run = side === "home" ? runHome : runAway;
      if (run != null && run > 0) {
        tiles.push(
          <StoryTile
            key="run"
            label="Longest run"
            value={`${run}-0`}
            color={colors[side]}
            sub={label(side)}
          />
        );
      }
    }
    const winner = outcome.winner;
    if (
      story.largestDeficitOvercomeByWinner >= COMEBACK_MIN &&
      (winner === "home" || winner === "away")
    ) {
      const side: Side = winner;
      tiles.push(
        <StoryTile
          key="comeback"
          label="Comeback"
          value={`${story.largestDeficitOvercomeByWinner} pts`}
          color={colors[side]}
          sub={`${label(side)} came back to ${analysis.status === "final" ? "win" : "lead"}`}
        />
      );
    }
  }

  const swing = flow.biggestPeriodSwing;
  if (swing) {
    const hi = swing.edge === "home" ? swing.homePoints : swing.awayPoints;
    const lo = swing.edge === "home" ? swing.awayPoints : swing.homePoints;
    tiles.push(
      <StoryTile
        key="swing"
        label="Best quarter"
        value={`${hi}-${lo}`}
        color={colors[swing.edge]}
        sub={`${label(swing.edge)} in ${swing.periodLabel}`}
      />
    );
  }

  if (!tiles.length) return null;
  return (
    <section aria-label="Game story" className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
      {tiles}
    </section>
  );
}

type ComparisonRow = {
  id: string;
  label: string;
  away: number;
  home: number;
  awayDisplay: string;
  homeDisplay: string;
  awaySub?: string;
  homeSub?: string;
  /** Matching winning-factor ids, first hit wins. */
  factorIds: string[];
};

function pct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function buildRows(away: GameTeamTotals, home: GameTeamTotals): ComparisonRow[] {
  const made = (m: number, a: number) => `${m}-${a}`;
  const rows: ComparisonRow[] = [];
  if (away.effectiveFieldGoalPct != null && home.effectiveFieldGoalPct != null) {
    rows.push({
      id: "efg",
      label: "Effective FG%",
      away: away.effectiveFieldGoalPct,
      home: home.effectiveFieldGoalPct,
      awayDisplay: pct(away.effectiveFieldGoalPct),
      homeDisplay: pct(home.effectiveFieldGoalPct),
      awaySub: `${made(away.fieldGoalsMade, away.fieldGoalsAttempted)} FG`,
      homeSub: `${made(home.fieldGoalsMade, home.fieldGoalsAttempted)} FG`,
      factorIds: ["efg"],
    });
  }
  if (away.trueShootingPct != null && home.trueShootingPct != null) {
    rows.push({
      id: "ts",
      label: "True shooting",
      away: away.trueShootingPct,
      home: home.trueShootingPct,
      awayDisplay: pct(away.trueShootingPct),
      homeDisplay: pct(home.trueShootingPct),
      factorIds: ["ts"],
    });
  }
  rows.push({
    id: "fg3",
    label: "Threes",
    away: away.threePointersMade,
    home: home.threePointersMade,
    awayDisplay: made(away.threePointersMade, away.threePointersAttempted),
    homeDisplay: made(home.threePointersMade, home.threePointersAttempted),
    awaySub: away.threePointPct != null ? pct(away.threePointPct) : undefined,
    homeSub: home.threePointPct != null ? pct(home.threePointPct) : undefined,
    factorIds: ["fg3m", "fg3pct", "fg3a"],
  });
  rows.push({
    id: "ft",
    label: "Free throws",
    away: away.freeThrowsMade,
    home: home.freeThrowsMade,
    awayDisplay: made(away.freeThrowsMade, away.freeThrowsAttempted),
    homeDisplay: made(home.freeThrowsMade, home.freeThrowsAttempted),
    awaySub: away.freeThrowPct != null ? pct(away.freeThrowPct) : undefined,
    homeSub: home.freeThrowPct != null ? pct(home.freeThrowPct) : undefined,
    factorIds: ["ftm", "fta"],
  });
  const count = (id: string, label: string, a: number, h: number, factorIds = [id]) =>
    rows.push({ id, label, away: a, home: h, awayDisplay: String(a), homeDisplay: String(h), factorIds });
  count("reb", "Rebounds", away.rebounds, home.rebounds);
  if (away.offensiveRebounds != null && home.offensiveRebounds != null) {
    count("oreb", "Offensive rebounds", away.offensiveRebounds, home.offensiveRebounds);
  }
  count("ast", "Assists", away.assists, home.assists);
  count("stl", "Steals", away.steals, home.steals);
  count("blk", "Blocks", away.blocks, home.blocks);
  count("tov", "Turnovers", away.turnovers, home.turnovers);
  return rows;
}

function SideValue({
  display,
  sub,
  strong,
  align,
}: {
  display: string;
  sub?: string;
  strong: boolean;
  align: "start" | "end";
}) {
  return (
    <div className={cn("flex min-w-0 flex-col", align === "end" ? "items-end text-right" : "items-start text-left")}>
      <span
        className={cn(
          "text-[16px] leading-tight tabular-nums",
          strong ? "font-bold" : "font-medium text-muted-foreground"
        )}
      >
        {display}
      </span>
      {sub ? (
        <span className={cn(type.micro, "tabular-nums text-muted-foreground")}>{sub}</span>
      ) : null}
    </div>
  );
}

function HalfBar({
  value,
  max,
  color,
  emphasis,
  side,
}: {
  value: number;
  max: number;
  color: string;
  emphasis: "edge" | "trail" | "even";
  side: "away" | "home";
}) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div
      className={cn(
        "flex h-2 flex-1 overflow-hidden bg-foreground/[0.06]",
        side === "away" ? "justify-end rounded-l-full" : "rounded-r-full"
      )}
    >
      <div
        className={cn(
          "h-full transition-[width] duration-500",
          side === "away" ? "rounded-l-full" : "rounded-r-full"
        )}
        style={{
          width: `${width}%`,
          background: color,
          opacity: emphasis === "edge" ? 1 : emphasis === "trail" ? 0.28 : 0.5,
        }}
      />
    </div>
  );
}

/**
 * Mirrored team bars from the box score. Solid color marks a metric where
 * one side cleared the winning-factor tolerance; close metrics stay muted.
 */
export function GameTeamComparison({
  analysis,
  colors,
}: {
  analysis: GameAnalysisSummary;
  colors: TeamColors;
}) {
  const {
    outcome,
    away,
    home,
    winningFactors,
    awayAdvantages,
    homeAdvantages,
    gameSeasonContext,
    coverage,
    methodology,
  } = analysis;
  const factors = new Map<string, GameWinningFactor>(
    winningFactors.map((f) => [f.id, f])
  );
  const rows = coverage.hasTeamTotals && away && home ? buildRows(away, home) : [];
  const findings =
    gameSeasonContext.availability === "ready"
      ? gameSeasonContext.findings.slice(0, 3)
      : [];

  return (
    <MatchupWashCard
      awayTeamKey={outcome.awayTeamId}
      homeTeamKey={outcome.homeTeamId}
      intensity="subtle"
      className="flex h-full flex-col gap-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <h2 className={type.heading}>Team comparison</h2>
          <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
            Solid bars mark a clear box score edge. Edges describe the game and
            don&apos;t establish cause.
          </p>
        </div>
        {rows.length ? (
          <span
            className={cn(
              type.caption,
              "glass-pill inline-flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1 font-semibold tabular-nums"
            )}
            title="Metrics where each team cleared the edge tolerance"
          >
            <span className="text-muted-foreground">Clear edges</span>
            <span className="inline-flex items-center gap-1">
              <TeamDot color={colors.away} />
              {outcome.awayLabel} {awayAdvantages.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <TeamDot color={colors.home} />
              {outcome.homeLabel} {homeAdvantages.length}
            </span>
          </span>
        ) : null}
      </div>

      {rows.length ? (
        <>
          <div
            className={cn(
              type.micro,
              "grid grid-cols-[5rem_minmax(0,1fr)_5rem] font-bold uppercase tracking-[0.1em] text-muted-foreground"
            )}
            aria-hidden
          >
            <span className="flex items-center gap-1.5">
              <TeamDot color={colors.away} />
              {outcome.awayLabel}
            </span>
            <span />
            <span className="flex items-center justify-end gap-1.5">
              {outcome.homeLabel}
              <TeamDot color={colors.home} />
            </span>
          </div>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const factor = row.factorIds
                .map((id) => factors.get(id))
                .find(Boolean);
              const edge: Side | null = factor?.edge ?? null;
              const max = Math.max(row.away, row.home);
              const emph = (side: Side) =>
                edge == null ? "even" : edge === side ? "edge" : "trail";
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-[5rem_minmax(0,1fr)_5rem] items-center gap-x-2"
                  aria-label={`${row.label}: ${outcome.awayLabel} ${row.awayDisplay}, ${outcome.homeLabel} ${row.homeDisplay}${edge ? `, clear edge ${edge === "home" ? outcome.homeLabel : outcome.awayLabel}` : ""}`}
                >
                  <SideValue
                    display={row.awayDisplay}
                    sub={row.awaySub}
                    strong={edge === "away"}
                    align="start"
                  />
                  <div className="flex min-w-0 flex-col items-center gap-1">
                    <span className={cn(type.caption, "truncate font-semibold")}>
                      {row.label}
                      {row.id === "tov" ? (
                        <span className="font-normal text-muted-foreground"> · fewer is better</span>
                      ) : null}
                    </span>
                    <div className="flex w-full gap-0.5">
                      <HalfBar value={row.away} max={max} color={colors.away} emphasis={emph("away")} side="away" />
                      <HalfBar value={row.home} max={max} color={colors.home} emphasis={emph("home")} side="home" />
                    </div>
                  </div>
                  <SideValue
                    display={row.homeDisplay}
                    sub={row.homeSub}
                    strong={edge === "home"}
                    align="end"
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Team box totals aren&apos;t available for this game, so there&apos;s
          nothing to compare yet.
        </p>
      )}

      {findings.length ? (
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-3">
          <p
            className={cn(
              type.micro,
              "font-bold uppercase tracking-[0.1em] text-muted-foreground"
            )}
          >
            Against season averages
          </p>
          <ul className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
            {findings.map((f) => (
              <li key={f.id} className="flex gap-2">
                <span aria-hidden className="mt-[0.45em] size-1 shrink-0 rounded-full bg-current" />
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <MoreInfo>
        <p>{methodology.winningFactorsRule}</p>
      </MoreInfo>
    </MatchupWashCard>
  );
}
