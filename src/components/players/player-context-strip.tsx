import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { StatComp } from "@/lib/player-stat-comps";
import Link from "next/link";

/**
 * Context section — similar players from the existing percentile comps.
 * Does not replace or recompute the similarity algorithm.
 */
export function PlayerContextStrip({
  metricLabel,
  leagueComps,
  historicalComps,
  compareHref,
}: {
  metricLabel: string;
  leagueComps: StatComp[];
  historicalComps: StatComp[];
  compareHref: string;
}) {
  const league = leagueComps.slice(0, 4);
  const historical = historicalComps.slice(0, 4);
  if (!league.length && !historical.length) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Similar-player comps for {metricLabel} are not available for this season
        row.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {league.length ? (
        <CompList title={`Similar this season · ${metricLabel}`} comps={league} />
      ) : null}
      {historical.length ? (
        <CompList
          title={`Similar historically · ${metricLabel}`}
          comps={historical}
        />
      ) : null}
      <p className="text-[13px] text-muted-foreground">
        <Link
          href={compareHref}
          className="font-semibold underline-offset-2 hover:underline"
        >
          Open full player compare →
        </Link>
      </p>
    </div>
  );
}

function CompList({ title, comps }: { title: string; comps: StatComp[] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {comps.map((c) => (
          <li
            key={`${c.playerId}-${c.season}-${c.value}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-white/40 px-3 py-2 text-[13px]"
          >
            <PlayerIdentity
              playerId={c.playerId}
              name={c.playerName}
              teamKey={c.teamKey}
              teamLabel={c.teamKey}
              season={c.season}
              variant="compact"
              className="min-w-0 flex-1"
              nameClassName="w-full gap-2 no-underline hover:underline"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                {c.teamKey ? <TeamLogo teamKey={c.teamKey} size="2xs" /> : null}
                <span className="truncate font-semibold">{c.playerName}</span>
                <span className="shrink-0 text-muted-foreground">{c.season}</span>
              </span>
            </PlayerIdentity>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {c.display}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
