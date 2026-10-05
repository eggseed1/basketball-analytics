import { PlayerOnOffPanel, type PlayerOnOffStint } from "@/components/players/player-on-off-panel";
import { teamColorAuto } from "@/components/players/player-play-types";
import { getOnOffSeasons, getPlayerOnOffData, type PlayerOnOffStintData } from "@/data/queries/on-off";
import { playerDetail } from "@/lib/on-off/derive";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const DETAIL_OPTIONS = { teammates: 10, lineups: 8 };

function toStints(data: PlayerOnOffStintData[]): PlayerOnOffStint[] {
  const stints: PlayerOnOffStint[] = [];
  for (const { file, league, playerId } of data) {
    const all = playerDetail(file, league, playerId, "all", DETAIL_OPTIONS);
    if (!all) continue;
    stints.push({
      teamAbbr: file.teamAbbr,
      color: teamColorAuto(file.teamAbbr),
      games: file.games,
      views: {
        all,
        clean: playerDetail(file, league, playerId, "clean", DETAIL_OPTIONS),
        clutch: playerDetail(file, league, playerId, "clutch", DETAIL_OPTIONS),
      },
    });
  }
  return stints;
}

export async function PlayerOnOffIsland({
  nbaIds,
  season,
  playerName,
}: {
  nbaIds: Array<string | null | undefined>;
  season: string;
  playerName: string;
}) {
  const [regularData, playoffData] = await Promise.all([
    getPlayerOnOffData(nbaIds, season),
    getPlayerOnOffData(nbaIds, season, "playoffs"),
  ]);
  const regular = toStints(regularData);
  const playoffs = toStints(playoffData);

  if (!regular.length) {
    const seasons = await getOnOffSeasons();
    return (
      <section id="onoff" className="scroll-mt-16 flex flex-col gap-2" aria-label="On/off">
        <h2 className="text-[20px] font-bold tracking-tight">On/off</h2>
        <p className={cn(type.bodySm, "max-w-prose text-muted-foreground")}>
          {seasons.includes(season)
            ? `No regular-season possessions for ${playerName} in ${season}.`
            : `Possession-level on/off isn't built for ${season}. It covers ${
                seasons.length ? seasons.slice().reverse().join(", ") : "no seasons yet"
              }.`}
        </p>
      </section>
    );
  }

  return (
    <PlayerOnOffPanel
      playerName={playerName}
      season={season}
      phases={{ regular, ...(playoffs.length ? { playoffs } : {}) }}
    />
  );
}
