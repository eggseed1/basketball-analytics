import { TransitionLink } from "@/components/continuity/query-nav";
import { PlayerIdentity } from "@/components/players/player-identity";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import type { PlayerSeason } from "@/data/types";
import {
  buildRosterBuckets,
  buildRotationLadder,
  rotationMinutesPct,
} from "@/lib/team-explorer";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

function valueCell(player: PlayerSeason): string {
  if (hasValidDrblEstimate(player)) {
    const parts = [`${formatNumber(player.drbl100, 1)} DRBL`];
    if (
      player.r1WinEquivalents != null &&
      Number.isFinite(player.r1WinEquivalents)
    ) {
      parts.push(`${formatNumber(player.r1WinEquivalents, 1)} WAR1`);
    }
    return parts.join(" · ");
  }
  if (player.darkoDpm != null && Number.isFinite(player.darkoDpm)) {
    return `${formatNumber(player.darkoDpm, 2)} DPM`;
  }
  return "—";
}

function mpgOf(player: PlayerSeason): number {
  return player.gamesPlayed > 0 ? player.minutes / player.gamesPlayed : 0;
}

function RotationTable({
  rows,
  teamGames,
  teamKey,
  season,
}: {
  rows: PlayerSeason[];
  teamGames: number;
  teamKey: string;
  season: string;
}) {
  if (!rows.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>None yet.</p>
    );
  }

  return (
    <table className="w-full min-w-[640px] text-left text-[13px]">
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th className="py-2 pr-3 font-medium">#</th>
          <th className="py-2 pr-3 font-medium">Player</th>
          <th className="py-2 pr-3 font-medium">Pos</th>
          <th className="py-2 pr-3 text-right font-medium">GS</th>
          <th className="py-2 pr-3 text-right font-medium">GP</th>
          <th className="py-2 pr-3 text-right font-medium">MPG</th>
          <th className="py-2 pr-3 text-right font-medium">MIN%</th>
          <th className="py-2 pr-3 text-right font-medium">USG%</th>
          <th className="py-2 text-right font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, i) => {
          const minPct = rotationMinutesPct(p, teamGames);
          const usg =
            p.usagePct != null && Number.isFinite(p.usagePct) && p.usagePct > 0
              ? formatPct(p.usagePct, 0)
              : "—";
          return (
            <tr
              key={p.playerId}
              className="border-b border-border/60 last:border-0"
            >
              <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                {i + 1}
              </td>
              <td className="py-2 pr-3">
                <PlayerIdentity
                  playerId={p.playerId}
                  name={p.playerName}
                  teamKey={teamKey}
                  position={p.position}
                  season={season}
                  variant="compact"
                />
              </td>
              <td className="py-2 pr-3 text-muted-foreground">
                {p.position ?? "—"}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {p.gamesStarted}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {p.gamesPlayed}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatNumber(mpgOf(p), 1)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {minPct != null ? formatPct(minPct, 0) : "—"}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{usg}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {valueCell(p)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SideList({
  title,
  hint,
  rows,
  season,
  teamKey,
  detail,
}: {
  title: string;
  hint: string;
  rows: PlayerSeason[];
  season: string;
  teamKey: string;
  detail: (p: PlayerSeason) => string;
}) {
  if (!rows.length) return null;
  return (
    <div className="sports-card flex flex-col gap-2 p-4 sm:p-5">
      <div>
        <h3 className={cn(type.bodySm, "font-semibold")}>{title}</h3>
        <p className={cn(type.caption, "text-muted-foreground")}>{hint}</p>
      </div>
      <ul className="flex flex-col">
        {rows.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center gap-3 border-b border-border/50 py-2 last:border-0"
          >
            <PlayerIdentity
              playerId={p.playerId}
              name={p.playerName}
              teamKey={teamKey}
              position={p.position}
              season={season}
              variant="compact"
              className="min-w-0 flex-1"
            />
            <span
              className={cn(
                type.caption,
                "shrink-0 tabular-nums text-muted-foreground"
              )}
            >
              {detail(p)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Rotation tab — box-score minutes ladder + usage/value context.
 * True five-man lineup nets need PBP; this stays honest about that.
 */
export async function TeamLineupsIsland({
  teamId,
  season,
  teamKey,
}: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  // minGames 0 — early season still shows who has played minutes.
  const roster = await getTeamRosterCached(teamId, season, 0);

  if (roster.status !== "ok") {
    return (
      <section
        id="lineups"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Rotation"
      >
        <h2 className="text-[20px] font-bold tracking-tight">Rotation</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {roster.warning ??
            (roster.status === "unsupported"
              ? `Rotation minutes unavailable for ${season}.`
              : `Rotation data could not be loaded for ${season}.`)}
        </p>
      </section>
    );
  }

  const buckets = buildRosterBuckets(roster.players, {
    rotationLimit: 12,
    listLimit: 5,
  });
  const ladder = buildRotationLadder(roster.players);
  const empty =
    ladder.starters.length + ladder.bench.length + ladder.spot.length === 0;
  const playersHref = teamPageHref(teamId, { season, tab: "players" });
  const defenseHref = teamPageHref(teamId, { season, tab: "defense" });

  return (
    <section
      id="lineups"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Rotation"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Rotation</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Starter / bench ladder from box-score minutes and starts for{" "}
            {season}. Five-man on/off nets need play-by-play — this tab does not
            invent them.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <TransitionLink
            href={playersHref}
            className={cn(type.caption, "font-semibold underline")}
          >
            Full roster →
          </TransitionLink>
          <TransitionLink
            href={defenseHref}
            className={cn(type.caption, "font-semibold underline")}
          >
            Hustle / defense →
          </TransitionLink>
        </div>
      </div>

      {empty ? (
        <div className="sports-card p-4 sm:p-5">
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ?? "No rotation minutes for this team-season yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="sports-card overflow-x-auto p-4 sm:p-5">
            <h3 className={cn(type.bodySm, "mb-1 font-semibold")}>
              Likely starters
            </h3>
            <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
              Started at least half their games (min 5 GP). Sorted by total
              minutes. MIN% is minutes ÷ (team games × 48).
            </p>
            <RotationTable
              rows={ladder.starters}
              teamGames={ladder.teamGames}
              teamKey={teamKey}
              season={season}
            />
          </div>

          <div className="sports-card overflow-x-auto p-4 sm:p-5">
            <h3 className={cn(type.bodySm, "mb-1 font-semibold")}>
              Bench regulars
            </h3>
            <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
              Next eight by minutes among non-starters.
            </p>
            <RotationTable
              rows={ladder.bench}
              teamGames={ladder.teamGames}
              teamKey={teamKey}
              season={season}
            />
          </div>

          {ladder.spot.length ? (
            <div className="sports-card overflow-x-auto p-4 sm:p-5">
              <h3 className={cn(type.bodySm, "mb-1 font-semibold")}>
                Spot minutes
              </h3>
              <p className={cn(type.caption, "mb-3 text-muted-foreground")}>
                Deeper board — still played, thinner share.
              </p>
              <RotationTable
                rows={ladder.spot}
                teamGames={ladder.teamGames}
                teamKey={teamKey}
                season={season}
              />
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <SideList
              title="Minutes core"
              hint="Top minutes overall (same board as Players)"
              rows={buckets.rotation}
              season={season}
              teamKey={teamKey}
              detail={(p) =>
                `${formatNumber(mpgOf(p), 1)} MPG · ${formatNumber(p.minutes, 0)} MIN`
              }
            />
            <SideList
              title="Creation load"
              hint="Highest usage among players with minutes"
              rows={[...roster.players]
                .filter(
                  (p) =>
                    p.usagePct != null &&
                    Number.isFinite(p.usagePct) &&
                    p.usagePct > 0 &&
                    p.minutes > 0
                )
                .sort((a, b) => (b.usagePct ?? 0) - (a.usagePct ?? 0))
                .slice(0, 5)}
              season={season}
              teamKey={teamKey}
              detail={(p) => formatPct(p.usagePct as number, 0)}
            />
            <SideList
              title="Leading scorers"
              hint="PPG on this roster board"
              rows={buckets.leadingScorers}
              season={season}
              teamKey={teamKey}
              detail={(p) =>
                `${formatNumber(p.points / Math.max(1, p.gamesPlayed), 1)} PPG`
              }
            />
            <SideList
              title="Highest value"
              hint={
                buckets.highestValue.some(hasValidDrblEstimate)
                  ? "DRBL/100 when available (WAR1 when present)"
                  : "DARKO DPM when DRBL is absent"
              }
              rows={buckets.highestValue}
              season={season}
              teamKey={teamKey}
              detail={valueCell}
            />
          </div>
        </>
      )}
    </section>
  );
}
