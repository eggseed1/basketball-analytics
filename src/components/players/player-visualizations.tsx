import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerShotMapView } from "@/components/players/player-shot-map";
import { type } from "@/lib/design-system";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { loadPlayerSeasonShotIndex } from "@/data/history/player-season-shots";
import { getPlayerSeasonShotMap } from "@/data/queries/player-shots";
import { playerSeasonShotIndexToMap } from "@/lib/player-season-shot-map-adapter";
import type { PlayerShotMap } from "@/lib/player-shot-map";
import type { PlayerSeasonKind } from "@/lib/player-destination";
import { cn } from "@/lib/utils";

const PLANNED = [
  {
    title: "Rolling form",
    detail:
      "Game-by-game scoring and true shooting over the last 10 / 25 games - how the season is actually going, not just the average.",
  },
  {
    title: "Shot diet",
    detail:
      "Share of attempts at the rim, midrange, and three, plus free-throw rate. Shows whether the player is a driver, jumper, or spacer.",
  },
  {
    title: "Usage vs efficiency",
    detail:
      "Where this player sits among the league: high-usage scorers vs efficient role players, for the selected season.",
  },
  {
    title: "Creation",
    detail:
      "Assists, potential assists, and unassisted shot share - who is generating offense vs finishing it.",
  },
  {
    title: "Play types",
    detail:
      "Isolation, pick-and-roll, spot-up, putbacks, and transition frequency plus efficiency when the tracking feed covers the season.",
  },
  {
    title: "On/off",
    detail:
      "Team scoring and allowed points with the player on the floor vs off, with lineup size disclosed so tiny samples stay honest.",
  },
  {
    title: "Availability",
    detail:
      "Games played, games missed, and minute load across the career - the health and workload half of the trajectory.",
  },
] as const;

export function PlayerPlannedVisualizations({
  teamKey,
}: {
  teamKey?: string | null;
}) {
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  return (
    <GlassSurface
      effect="css"
      accentColor={wash?.colorA}
      accentColorB={wash?.colorB}
      className="flex flex-col gap-3 p-4 sm:p-5"
    >
      <div>
        <h2 className={type.heading}>Planned visualizations</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          Shot maps load from the offline index when present, otherwise NBA
          Stats live. The rest stay listed until the underlying feed is wired.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {PLANNED.map((item) => (
          <li key={item.title}>
            <p className={cn(type.bodySm, "font-semibold")}>{item.title}</p>
            <p className={cn(type.caption, "mt-0.5 text-muted-foreground")}>
              {item.detail}
            </p>
          </li>
        ))}
      </ul>
    </GlassSurface>
  );
}

/**
 * Hannah Visualizations island - exact frontend, P18 shot index data.
 * No synthetic coordinates. Coverage disclosed when incomplete.
 */
export async function PlayerVisualizationsIsland({
  playerId,
  nbaId,
  season,
  seasons,
  seasonType,
  teamKey,
  teamLabel,
  teamAbbr,
}: {
  playerId: string;
  nbaId?: string | null;
  season: string;
  seasons: string[];
  seasonType: PlayerSeasonKind;
  teamKey?: string | null;
  teamLabel?: string | null;
  teamAbbr?: string | null;
}) {
  const index = loadPlayerSeasonShotIndex(playerId, season);
  const label = teamLabel || teamKey || "NBA";
  const coverageLabel =
    index && index.coordinateShots > 0
      ? `Coordinate-covered FGA: ${index.coordinateShots} of ${index.boxFga} box FGA (${(
          index.coverage * 100
        ).toFixed(1)}%)`
      : null;

  let map: PlayerShotMap;
  if (index && index.coordinateShots > 0) {
    map = playerSeasonShotIndexToMap({
      index,
      season,
      teamLabel: label,
      seasonType,
    });
  } else {
    map = await getPlayerSeasonShotMap({
      playerId,
      nbaId,
      season,
      seasonType,
      teamAbbr: teamAbbr ?? "TOT",
      teamLabel: label,
    });
  }

  return (
    <section
      id="shooting"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Shooting"
    >
      {coverageLabel ? (
        <GlassSurface effect="css" className="px-3 py-2">
          <p className={cn(type.caption, "font-semibold text-foreground")}>
            Season shot chart · {season}
          </p>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {coverageLabel}
          </p>
        </GlassSurface>
      ) : null}
      <PlayerShotMapView map={map} seasons={seasons} />
      <PlayerPlannedVisualizations teamKey={teamKey} />
    </section>
  );
}
