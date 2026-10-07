import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TransitionLink } from "@/components/continuity/query-nav";
import { withBudget } from "@/data/queries/budget";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import type { PlayerSeason } from "@/data/types";
import { type, sectionLinkClassName } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { MID_SEASON_MOVES_NOTE } from "@/lib/team-explorer";
import { teamPageHref } from "@/lib/team-destination";
import { teamChartColor } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const TOP = 6;
const R = 70;
const STROKE = 22;
const CIRC = 2 * Math.PI * R;

/** Share of team points by player, from the roster board. Streams after the overview paints. */
export async function TeamScoringShareIsland({
  teamId,
  teamKey,
  season,
}: {
  teamId: string;
  teamKey: string;
  season: string;
}) {
  const roster = (
    await withBudget(getTeamRosterCached(teamId, season, 0), 5_000, null)
  ).value;
  if (!roster || roster.status !== "ok") return null;

  const players = roster.players.filter((p: PlayerSeason) => p.points > 0 && p.gamesPlayed > 0);
  const total = players.reduce((a, p) => a + p.points, 0);
  if (!players.length || total <= 0) return null;

  const sorted = [...players].sort((a, b) => b.points - a.points);
  const top = sorted.slice(0, TOP);
  const rest = sorted.slice(TOP).reduce((a, p) => a + p.points, 0);
  const color = teamChartColor(teamKey).color;
  const opacities = [1, 0.8, 0.64, 0.5, 0.38, 0.28];

  let offset = 0;
  const arcs = [
    ...top.map((p, i) => ({ id: p.playerId, label: p.playerName, share: p.points / total, color, opacity: opacities[i] ?? 0.25 })),
    ...(rest > 0 ? [{ id: "rest", label: "Rest of the roster", share: rest / total, color: "currentColor", opacity: 0.12 }] : []),
  ].map((a) => {
    const len = a.share * CIRC;
    const arc = { ...a, dash: `${Math.max(0, len - 2)} ${CIRC}`, offset: -offset };
    offset += len;
    return arc;
  });

  const topThreeShare = top.slice(0, 3).reduce((a, p) => a + p.points, 0) / total;

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-label="Scoring share">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className={type.heading}>Who carries the scoring</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Share of {season} points by players on this roster.
            {roster.omitsMidSeasonMoves ? ` ${MID_SEASON_MOVES_NOTE}` : ""}
          </p>
        </div>
        <TransitionLink
          href={teamPageHref(teamId, { season, tab: "players" })}
          className={cn(type.caption, sectionLinkClassName)}
        >
          Full roster <span data-motion-arrow aria-hidden>→</span>
        </TransitionLink>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <svg viewBox="0 0 180 180" className="size-44" data-hover-svg role="img" aria-label="Scoring share donut">
            <g data-motion-shape style={{ transformOrigin: "90px 90px" }}>
              <g transform="rotate(-90 90 90)">
                {arcs.map((a) => (
                  <circle
                    key={a.id}
                    cx={90}
                    cy={90}
                    r={R}
                    fill="none"
                    stroke={a.color}
                    strokeOpacity={a.opacity}
                    strokeWidth={STROKE}
                    strokeDasharray={a.dash}
                    strokeDashoffset={a.offset}
                    data-hover-point
                    data-tip={a.label}
                    data-tip-sub={`${formatPct(a.share, 0)} of points`}
                  />
                ))}
              </g>
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={cn(type.title2, "font-bold tabular-nums")}>{formatPct(topThreeShare, 0)}</span>
            <span className={cn(type.micro, "max-w-[6rem] text-muted-foreground")}>from the top 3 scorers</span>
          </div>
        </div>

        <ol className="flex w-full min-w-0 flex-col gap-1.5">
          {top.map((p, i) => {
            const share = p.points / total;
            return (
              <li key={p.playerId}>
                <TransitionLink
                  href={`/players/${p.playerId}?season=${encodeURIComponent(season)}`}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-1.5 py-1 transition hover:bg-muted/60"
                >
                  <PlayerHeadshot playerId={p.playerId} name={p.playerName} teamKey={teamKey} size="sm" />
                  <span className="min-w-0">
                    <span className={cn(type.bodySm, "block truncate font-semibold")}>
                      <span
                        className="mr-1.5 inline-block size-2 rounded-full align-middle"
                        style={{ background: color, opacity: opacities[i] }}
                        aria-hidden
                      />
                      {p.playerName}
                    </span>
                    <span className={cn(type.micro, "block text-muted-foreground tabular-nums")}>
                      {formatNumber(p.points / p.gamesPlayed, 1)} PPG · {formatNumber(p.rebounds / p.gamesPlayed, 1)} RPG ·{" "}
                      {formatNumber(p.assists / p.gamesPlayed, 1)} APG
                      {p.trueShootingPct != null && Number.isFinite(p.trueShootingPct)
                        ? ` · ${formatPct(p.trueShootingPct)} TS`
                        : ""}
                    </span>
                  </span>
                  <span className={cn(type.bodySm, "font-bold tabular-nums")}>{formatPct(share, 0)}</span>
                </TransitionLink>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
