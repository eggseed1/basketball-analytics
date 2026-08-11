/**
 * ESPN team id → conference / division / city.
 * Verified against site.api.espn.com/.../nba/teams.
 */
export const ESPN_TEAM_META: Record<
  string,
  { conference: "East" | "West"; division: string; city: string }
> = {
  "1": { conference: "East", division: "Southeast", city: "Atlanta" },
  "2": { conference: "East", division: "Atlantic", city: "Boston" },
  "3": { conference: "West", division: "Southwest", city: "New Orleans" },
  "4": { conference: "East", division: "Central", city: "Chicago" },
  "5": { conference: "East", division: "Central", city: "Cleveland" },
  "6": { conference: "West", division: "Southwest", city: "Dallas" },
  "7": { conference: "West", division: "Northwest", city: "Denver" },
  "8": { conference: "East", division: "Central", city: "Detroit" },
  "9": { conference: "West", division: "Pacific", city: "Golden State" },
  "10": { conference: "West", division: "Southwest", city: "Houston" },
  "11": { conference: "East", division: "Central", city: "Indiana" },
  "12": { conference: "West", division: "Pacific", city: "LA Clippers" },
  "13": { conference: "West", division: "Pacific", city: "Los Angeles" },
  "14": { conference: "East", division: "Southeast", city: "Miami" },
  "15": { conference: "East", division: "Central", city: "Milwaukee" },
  "16": { conference: "West", division: "Northwest", city: "Minnesota" },
  "17": { conference: "East", division: "Atlantic", city: "Brooklyn" },
  "18": { conference: "East", division: "Atlantic", city: "New York" },
  "19": { conference: "East", division: "Southeast", city: "Orlando" },
  "20": { conference: "East", division: "Atlantic", city: "Philadelphia" },
  "21": { conference: "West", division: "Pacific", city: "Phoenix" },
  "22": { conference: "West", division: "Northwest", city: "Portland" },
  "23": { conference: "West", division: "Pacific", city: "Sacramento" },
  "24": { conference: "West", division: "Southwest", city: "San Antonio" },
  "25": { conference: "West", division: "Northwest", city: "Oklahoma City" },
  "26": { conference: "West", division: "Northwest", city: "Utah" },
  "27": { conference: "East", division: "Southeast", city: "Washington" },
  "28": { conference: "East", division: "Atlantic", city: "Toronto" },
  "29": { conference: "West", division: "Southwest", city: "Memphis" },
  "30": { conference: "East", division: "Southeast", city: "Charlotte" },
};
