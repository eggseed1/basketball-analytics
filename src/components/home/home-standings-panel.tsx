import { HomeStandingsBoard } from "@/components/home/home-standings-board";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { getLeagueStandings } from "@/data/queries";
import type { StandingRow } from "@/data/types";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

/** Compact homepage table only reads these fields — drop the rest from Flight. */
function slimHomeStandingRow(row: StandingRow): StandingRow {
  return {
    teamId: row.teamId,
    abbreviation: row.abbreviation,
    displayName: row.displayName,
    conference: row.conference,
    rank: row.rank,
    wins: row.wins,
    losses: row.losses,
    winPct: Math.round(row.winPct * 1000) / 1000,
    gamesBehind: 0,
    differential: Math.round(row.differential * 10) / 10,
    ppg: 0,
    oppPpg: 0,
    streak: "",
    homeRecord: "",
    roadRecord: "",
    lastTen: "",
    playoffSeed: null,
  };
}

export async function HomeStandingsPanel({
  season,
  race = false,
}: {
  season: string;
  race?: boolean;
}) {
  const shown = race ? 10 : 8;
  try {
    // In the offseason, skip a guaranteed-empty current-season request and
    // load the completed standings directly.
    const initialSeason = isPreseasonRosterSeason(season)
      ? shiftCanonicalSeason(season, -1)
      : season;
    const data = await getLeagueStandings(initialSeason);
    let east =
      data.conferences.find((c) => c.conference === "East")?.rows ?? [];
    let west =
      data.conferences.find((c) => c.conference === "West")?.rows ?? [];
    let displaySeason = initialSeason;

    if (
      !east.length &&
      !west.length &&
      initialSeason === season &&
      isPreseasonRosterSeason(season)
    ) {
      const priorSeason = shiftCanonicalSeason(season, -1);
      const prior = await getLeagueStandings(priorSeason);
      east =
        prior.conferences.find((c) => c.conference === "East")?.rows ?? [];
      west =
        prior.conferences.find((c) => c.conference === "West")?.rows ?? [];
      displaySeason = priorSeason;
    }

    if (!east.length && !west.length) return null;

    return (
      <HomeStandingsBoard
        season={displaySeason}
        east={east.slice(0, shown).map(slimHomeStandingRow)}
        west={west.slice(0, shown).map(slimHomeStandingRow)}
        race={race && displaySeason === season}
      />
    );
  } catch {
    return null;
  }
}
