import type { RaptorRating } from "@/data/types";

/**
 * Tiny seed for local/API demos when the baked overlay and CSV are missing.
 * Prefer `npm run impact:sync` (538 RAPTOR bake) for real coverage.
 *
 * Optional override CSV: `data/impact/raptor.csv`
 * Headers: player_name,season,raptor,o_raptor,d_raptor,war,team,team_abbr,player_id
 */
export const SAMPLE_RAPTOR_RATINGS: RaptorRating[] = [
  {
    playerId: "3112335",
    nbaPlayerId: "203999",
    playerName: "Nikola Jokic",
    teamName: "Denver Nuggets",
    teamAbbr: "DEN",
    season: "2021-22",
    source: "raptor",
    impact: 9.25,
    offensive: 8.6,
    defensive: 0.65,
    winsAdded: 17.5,
  },
  {
    playerId: "3032977",
    nbaPlayerId: "203507",
    playerName: "Giannis Antetokounmpo",
    teamName: "Milwaukee Bucks",
    teamAbbr: "MIL",
    season: "2021-22",
    source: "raptor",
    impact: 6.8,
    offensive: 4.1,
    defensive: 2.7,
    winsAdded: 12.1,
  },
  {
    playerId: "3975",
    nbaPlayerId: "201939",
    playerName: "Stephen Curry",
    teamName: "Golden State Warriors",
    teamAbbr: "GSW",
    season: "2021-22",
    source: "raptor",
    impact: 6.2,
    offensive: 7.4,
    defensive: -1.2,
    winsAdded: 10.4,
  },
];
