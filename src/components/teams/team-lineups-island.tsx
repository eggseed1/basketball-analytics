import Link from "next/link";

import { PlayerIdentity } from "@/components/players/player-identity";
import { getTeamRosterCached } from "@/data/queries/request-cache";
import { buildRosterBuckets } from "@/lib/team-explorer";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Rotation tab — minutes-ranked rotation core from the actual roster.
 * True five-man lineup nets need PBP; this ships honest rotation data on CF.
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
  const roster = await getTeamRosterCached(teamId, season, 10);
  const buckets = buildRosterBuckets(roster.players, {
    rotationLimit: 10,
    listLimit: 5,
  });
  const rotation = buckets.rotation;

  return (
    <section
      id="lineups"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Rotation"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Rotation</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Minutes-ranked rotation for {season}. Five-man on/off lineup nets
            need play-by-play — this tab shows who actually played, not lineup
            plus-minus.
          </p>
        </div>
        <Link
          href={`/teams/${teamId}?tab=players&season=${encodeURIComponent(season)}`}
          className={cn(type.caption, "font-semibold underline")}
        >
          Full roster →
        </Link>
      </div>

      <div className="sports-card overflow-x-auto p-4 sm:p-5">
        {rotation.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {roster.warning ?? "No rotation minutes for this team-season yet."}
          </p>
        ) : (
          <>
            <h3 className={cn(type.bodySm, "mb-3 font-semibold")}>
              Core rotation
            </h3>
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Player</th>
                  <th className="py-2 pr-3 font-medium">Pos</th>
                  <th className="py-2 pr-3 text-right font-medium">GP</th>
                  <th className="py-2 pr-3 text-right font-medium">MPG</th>
                  <th className="py-2 text-right font-medium">MIN</th>
                </tr>
              </thead>
              <tbody>
                {rotation.map((p, i) => {
                  const mpg =
                    p.gamesPlayed > 0 ? p.minutes / p.gamesPlayed : 0;
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
                          variant="compact"
                        />
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {p.position ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {p.gamesPlayed}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatNumber(mpg, 1)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatNumber(p.minutes, 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
