/**
 * Play-by-play / possession contracts.
 * Historical PBP will plug in here — do not SSR-scan raw history per request.
 * Until ingest lands, executors must return empty / unsupported rather than invent events.
 */

export type PbpEventType =
  | "shot"
  | "miss"
  | "ft"
  | "reb"
  | "ast"
  | "tov"
  | "foul"
  | "sub"
  | "timeout"
  | "period"
  | "other";

export type PbpEvent = {
  id: string;
  gameId: string;
  period: number;
  /** Clock remaining in period, seconds. */
  clockSeconds?: number;
  wallTime?: string;
  type: PbpEventType;
  teamId?: string;
  playerId?: string;
  description?: string;
  /** Points scored on this event, if any. */
  points?: number;
  locX?: number;
  locY?: number;
};

export type Possession = {
  id: string;
  gameId: string;
  period: number;
  offenseTeamId: string;
  defenseTeamId: string;
  startEventId?: string;
  endEventId?: string;
  points: number;
  eventIds: string[];
};

export type PbpCapability = {
  gamesIndexed: boolean;
  possessionsDerived: boolean;
  shotLocations: boolean;
  lineups: boolean;
};

/** Honest capability report until PBP ingest lands. */
export function getPbpCapability(): PbpCapability {
  return {
    gamesIndexed: false,
    possessionsDerived: false,
    shotLocations: false,
    lineups: false,
  };
}
