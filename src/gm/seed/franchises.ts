import type { Conference, GmTeam } from "@/gm/types";

export interface FranchiseSeed {
  id: string;
  abbr: string;
  city: string;
  name: string;
  conference: Conference;
  division: string;
}

export const FRANCHISES: FranchiseSeed[] = [
  { id: "atl", abbr: "ATL", city: "Atlanta", name: "Hawks", conference: "East", division: "Southeast" },
  { id: "bos", abbr: "BOS", city: "Boston", name: "Celtics", conference: "East", division: "Atlantic" },
  { id: "bkn", abbr: "BKN", city: "Brooklyn", name: "Nets", conference: "East", division: "Atlantic" },
  { id: "cha", abbr: "CHA", city: "Charlotte", name: "Hornets", conference: "East", division: "Southeast" },
  { id: "chi", abbr: "CHI", city: "Chicago", name: "Bulls", conference: "East", division: "Central" },
  { id: "cle", abbr: "CLE", city: "Cleveland", name: "Cavaliers", conference: "East", division: "Central" },
  { id: "det", abbr: "DET", city: "Detroit", name: "Pistons", conference: "East", division: "Central" },
  { id: "ind", abbr: "IND", city: "Indiana", name: "Pacers", conference: "East", division: "Central" },
  { id: "mia", abbr: "MIA", city: "Miami", name: "Heat", conference: "East", division: "Southeast" },
  { id: "mil", abbr: "MIL", city: "Milwaukee", name: "Bucks", conference: "East", division: "Central" },
  { id: "nyk", abbr: "NYK", city: "New York", name: "Knicks", conference: "East", division: "Atlantic" },
  { id: "orl", abbr: "ORL", city: "Orlando", name: "Magic", conference: "East", division: "Southeast" },
  { id: "phi", abbr: "PHI", city: "Philadelphia", name: "76ers", conference: "East", division: "Atlantic" },
  { id: "tor", abbr: "TOR", city: "Toronto", name: "Raptors", conference: "East", division: "Atlantic" },
  { id: "was", abbr: "WAS", city: "Washington", name: "Wizards", conference: "East", division: "Southeast" },
  { id: "dal", abbr: "DAL", city: "Dallas", name: "Mavericks", conference: "West", division: "Southwest" },
  { id: "den", abbr: "DEN", city: "Denver", name: "Nuggets", conference: "West", division: "Northwest" },
  { id: "gsw", abbr: "GSW", city: "Golden State", name: "Warriors", conference: "West", division: "Pacific" },
  { id: "hou", abbr: "HOU", city: "Houston", name: "Rockets", conference: "West", division: "Southwest" },
  { id: "lac", abbr: "LAC", city: "LA", name: "Clippers", conference: "West", division: "Pacific" },
  { id: "lal", abbr: "LAL", city: "Los Angeles", name: "Lakers", conference: "West", division: "Pacific" },
  { id: "mem", abbr: "MEM", city: "Memphis", name: "Grizzlies", conference: "West", division: "Southwest" },
  { id: "min", abbr: "MIN", city: "Minnesota", name: "Timberwolves", conference: "West", division: "Northwest" },
  { id: "nop", abbr: "NOP", city: "New Orleans", name: "Pelicans", conference: "West", division: "Southwest" },
  { id: "okc", abbr: "OKC", city: "Oklahoma City", name: "Thunder", conference: "West", division: "Northwest" },
  { id: "phx", abbr: "PHX", city: "Phoenix", name: "Suns", conference: "West", division: "Pacific" },
  { id: "por", abbr: "POR", city: "Portland", name: "Trail Blazers", conference: "West", division: "Northwest" },
  { id: "sac", abbr: "SAC", city: "Sacramento", name: "Kings", conference: "West", division: "Pacific" },
  { id: "sas", abbr: "SAS", city: "San Antonio", name: "Spurs", conference: "West", division: "Southwest" },
  { id: "uta", abbr: "UTA", city: "Utah", name: "Jazz", conference: "West", division: "Northwest" },
];

export function emptyStarters(): GmTeam["starters"] {
  return { PG: null, SG: null, SF: null, PF: null, C: null };
}
