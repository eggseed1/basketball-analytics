/**
 * Bundled NBA team on/off splits per player.
 *
 * Built by scripts/build-runtime-playtype-onoff-snapshot.py.
 * Row: [nbaId, teamId, gp, onMin, onOrtg, onDrtg, offMin, offOrtg, offDrtg]
 */
import snapshot from "./on-off-snapshot.json";
import { NBA_TEAM_META } from "@/data/providers/nba/nba-team-meta";

type OnOffFile = {
  version?: number;
  generatedAt?: string;
  seasons?: Record<string, Array<[string, string, number, number, number, number, number, number, number]>>;
};

const data = snapshot as unknown as OnOffFile;

export type OnOffSide = { minutes: number; ortg: number; drtg: number; net: number };

export type PlayerOnOffStint = {
  season: string;
  nbaTeamId: string;
  teamAbbr: string | null;
  gamesPlayed: number;
  on: OnOffSide;
  off: OnOffSide;
};

const side = (minutes: number, ortg: number, drtg: number): OnOffSide => ({
  minutes,
  ortg,
  drtg,
  net: Math.round((ortg - drtg) * 10) / 10,
});

/** One row per team the player suited up for, most on-court minutes first. */
export function getPlayerOnOff(
  season: string,
  playerIds: Array<string | null | undefined>
): PlayerOnOffStint[] {
  const ids = new Set(playerIds.filter((id): id is string => Boolean(id)));
  if (!ids.size) return [];
  return (data.seasons?.[season] ?? [])
    .filter((row) => ids.has(String(row[0])))
    .map(([, teamId, gp, onMin, onO, onD, offMin, offO, offD]) => ({
      season,
      nbaTeamId: String(teamId),
      teamAbbr: NBA_TEAM_META[String(teamId)]?.abbreviation ?? null,
      gamesPlayed: gp,
      on: side(onMin, onO, onD),
      off: side(offMin, offO, offD),
    }))
    .sort((a, b) => b.on.minutes - a.on.minutes);
}
