/**
 * Stable location and market preferences for Franchise Lab contracts.
 * These are simulated agent preferences, NOT claims about real NBA players.
 * The same player keeps his preference through reloads and future seasons.
 */
import type { GmPlayer, GmTeam } from "@/gm/types";

type Climate = "warm" | "mild" | "four_seasons" | "cold";
type ClimateWish = Climate | "flexible";
type MarketWish = "spotlight" | "quieter" | "flexible";

const CLIMATE: Record<Climate, string[]> = {
  warm: ["ATL", "CHA", "DAL", "HOU", "MIA", "NOP", "ORL", "PHO", "SAS", "MEM"],
  mild: ["GSW", "LAC", "LAL", "POR", "SAC"],
  four_seasons: ["DEN", "OKC", "UTA", "WAS"],
  cold: ["BOS", "BRK", "BKN", "CHI", "CLE", "DET", "IND", "MIL", "MIN", "NYK", "PHI", "TOR"],
};
const SPOTLIGHT = new Set(["NYK", "BRK", "BKN", "LAL", "LAC", "GSW", "CHI", "MIA", "BOS", "PHI"]);

function stableHash(id: string): number {
  let n = 2166136261;
  for (let i = 0; i < id.length; i++) {
    n = Math.imul(n ^ id.charCodeAt(i), 16777619);
  }
  return n >>> 0;
}

export function climateOf(team: GmTeam): Climate {
  const abbr = team.abbr.toUpperCase();
  return (Object.keys(CLIMATE) as Climate[]).find(c => CLIMATE[c].includes(abbr)) ?? "four_seasons";
}

export function faLocationPreferences(player: GmPlayer): {
  climate: ClimateWish;
  market: MarketWish;
  climateLabel: string;
  marketLabel: string;
} {
  const hash = stableHash(player.nbaPlayerId ?? player.id);
  const climates: ClimateWish[] = ["flexible", "warm", "mild", "four_seasons", "cold", "flexible"];
  const markets: MarketWish[] = ["flexible", "spotlight", "quieter", "flexible"];
  const climate = climates[hash % climates.length]!;
  const market = markets[(Math.floor(hash / 17)) % markets.length]!;
  const climateLabel: Record<ClimateWish, string> = {
    flexible: "Open to any climate", warm: "Prefers warm weather",
    mild: "Likes milder weather", four_seasons: "Comfortable with four seasons",
    cold: "Comfortable with colder cities",
  };
  const marketLabel: Record<MarketWish, string> = {
    flexible: "Market size isn't decisive", spotlight: "Likes a high-profile market",
    quieter: "Likes a lower-profile market",
  };
  return { climate, market, climateLabel: climateLabel[climate], marketLabel: marketLabel[market] };
}

export function locationAppeal(player: GmPlayer, team: GmTeam): number {
  const pref = faLocationPreferences(player);
  const climate = climateOf(team);
  let weather = pref.climate === "flexible" ? 65 : pref.climate === climate ? 94 :
    (pref.climate === "warm" && climate === "cold") || (pref.climate === "cold" && climate === "warm") ? 23 : 52;
  // Even an undesired climate should never outweigh a superstar contract.
  weather = Math.max(20, weather);
  const highProfile = SPOTLIGHT.has(team.abbr.toUpperCase());
  const market = pref.market === "flexible" ? 62 :
    (pref.market === "spotlight") === highProfile ? 90 : 36;
  return Math.round(weather * 0.65 + market * 0.35);
}

export function teamLocationSummary(team: GmTeam): string {
  const names: Record<Climate, string> = {
    warm: "Warm weather", mild: "Mild weather",
    four_seasons: "Four seasons", cold: "Colder winters",
  };
  return names[climateOf(team)] + " · " +
    (SPOTLIGHT.has(team.abbr.toUpperCase()) ? "major media market" : "smaller media market");
}
