import type { Game } from "@/data/types/game";
import type {
  ConferenceStandings,
  LeagueStandings,
  StandingRow,
} from "@/data/types/standings";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { TEAM_BRANDS } from "@/lib/nba-brand";

const NBA_TEAM_IDS = new Set(Object.keys(ESPN_TEAM_META));

type TeamAccum = {
  teamId: string;
  abbreviation: string;
  displayName: string;
  conference: "East" | "West";
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
};

function brandForTeamId(teamId: string) {
  for (const brand of Object.values(TEAM_BRANDS)) {
    if (brand.espnTeamId === teamId) return brand;
  }
  return null;
}

function compareStandingRows(a: StandingRow, b: StandingRow): number {
  if (b.winPct !== a.winPct) return b.winPct - a.winPct;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.losses - b.losses;
}

/** Last-resort standings from the bundled ESPN schedule when live ESPN misses on CF. */
export function computeStandingsFromGameArchive(
  season: string,
  games: Game[]
): LeagueStandings | null {
  const byTeam = new Map<string, TeamAccum>();

  for (const game of games) {
    if (game.season !== season) continue;
    if (game.status !== "final") continue;
    if (game.gameType !== "regular") continue;

    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? game.homeTeamId : game.awayTeamId;
      if (!NBA_TEAM_IDS.has(teamId)) continue;
      const meta = ESPN_TEAM_META[teamId]!;
      const brand = brandForTeamId(teamId);
      const hit =
        byTeam.get(teamId) ??
        ({
          teamId,
          abbreviation:
            (side === "home" ? game.homeTeamAbbr : game.awayTeamAbbr) ??
            brand?.abbr ??
            teamId,
          displayName:
            (side === "home" ? game.homeTeamName : game.awayTeamName) ??
            brand?.abbr ??
            teamId,
          conference: meta.conference,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        } satisfies TeamAccum);
      byTeam.set(teamId, hit);
    }

    const home = byTeam.get(game.homeTeamId);
    const away = byTeam.get(game.awayTeamId);
    if (!home || !away) continue;

    home.pointsFor += game.homeScore;
    home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore;
    away.pointsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (game.awayScore > game.homeScore) {
      away.wins += 1;
      home.losses += 1;
    }
  }

  if (!byTeam.size) return null;

  const conferences: ConferenceStandings[] = (["East", "West"] as const).map(
    (conference) => {
      const rows = [...byTeam.values()]
        .filter((team) => team.conference === conference)
        .map((team) => {
          const gamesPlayed = team.wins + team.losses;
          const winPct = gamesPlayed > 0 ? team.wins / gamesPlayed : 0;
          const differential =
            gamesPlayed > 0
              ? Math.round(
                  ((team.pointsFor - team.pointsAgainst) / gamesPlayed) * 10
                ) / 10
              : 0;
          const ppg =
            gamesPlayed > 0
              ? Math.round((team.pointsFor / gamesPlayed) * 10) / 10
              : 0;
          const oppPpg =
            gamesPlayed > 0
              ? Math.round((team.pointsAgainst / gamesPlayed) * 10) / 10
              : 0;
          return {
            teamId: team.teamId,
            abbreviation: team.abbreviation,
            displayName: team.displayName,
            conference,
            rank: 0,
            wins: team.wins,
            losses: team.losses,
            winPct,
            gamesBehind: 0,
            differential,
            ppg,
            oppPpg,
            streak: "—",
            homeRecord: "—",
            roadRecord: "—",
            lastTen: "—",
            playoffSeed: null,
          } satisfies StandingRow;
        })
        .sort(compareStandingRows)
        .map((row, index) => ({ ...row, rank: index + 1 }));

      const leader = rows[0];
      if (leader) {
        for (const row of rows) {
          if (row.teamId === leader.teamId) {
            row.gamesBehind = 0;
            continue;
          }
          row.gamesBehind =
            Math.round(
              ((leader.wins - row.wins + (row.losses - leader.losses)) / 2) *
                10
            ) / 10;
        }
      }

      return { conference, rows };
    }
  );

  return { season, conferences };
}

export function isNbaFranchiseTeamId(teamId: string): boolean {
  return NBA_TEAM_IDS.has(String(teamId ?? "").trim());
}

export function conferenceForTeamId(teamId: string): "East" | "West" | null {
  return ESPN_TEAM_META[String(teamId ?? "").trim()]?.conference ?? null;
}
