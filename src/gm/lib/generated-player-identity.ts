import { drawName, poolFor } from "@/one-shot/names";
import { createStreams, hashString, Rng } from "@/one-shot/rng";
import type { GmPlayer, GmPlayerIdentity } from "@/gm/types";
import { isFictionalGmPlayer } from "@/gm/lib/player-portrait-ids";

/**
 * A separate identity RNG domain. Adding hometowns or portraits must never
 * change NBA draft order, potential, injuries, or any other gameplay roll.
 * All players receive a permanent profile; saves store it verbatim.
 */
type Origin = { code: string; label: string; cities: readonly string[]; weight: number; competition?: string };
const ORIGINS: readonly Origin[] = [
  { code: "US", label: "United States", cities: ["Atlanta, GA", "Chicago, IL", "Houston, TX", "Los Angeles, CA", "New York, NY", "Brooklyn, NY", "Philadelphia, PA", "Memphis, TN", "New Orleans, LA", "Detroit, MI", "Dallas, TX", "Baltimore, MD", "Oakland, CA", "Charlotte, NC", "Seattle, WA", "Miami, FL", "Indianapolis, IN", "Cleveland, OH", "St. Louis, MO", "Washington, DC", "San Antonio, TX", "Minneapolis, MN", "Columbus, OH"], weight: 0 },
  { code: "CA", label: "Canada", cities: ["Toronto, Ontario", "Montreal, Quebec", "Vancouver, British Columbia", "Ottawa, Ontario"], weight: 13, competition: "Canadian basketball" },
  { code: "FR", label: "France", cities: ["Paris", "Lyon", "Marseille", "Strasbourg", "Bordeaux"], weight: 12, competition: "French Pro A" },
  { code: "RS", label: "Serbia", cities: ["Belgrade", "Novi Sad", "Niš", "Kragujevac"], weight: 8, competition: "Adriatic League" },
  { code: "LT", label: "Lithuania", cities: ["Kaunas", "Vilnius", "Klaipėda", "Šiauliai"], weight: 7, competition: "Lithuanian LKL" },
  { code: "AU", label: "Australia", cities: ["Melbourne", "Sydney", "Perth", "Brisbane", "Adelaide"], weight: 7, competition: "NBL Australia" },
  { code: "ES", label: "Spain", cities: ["Madrid", "Barcelona", "Valencia", "Málaga", "Seville"], weight: 6, competition: "Spain ACB" },
  { code: "DE", label: "Germany", cities: ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt"], weight: 6, competition: "German BBL" },
  { code: "NG", label: "Nigeria", cities: ["Lagos", "Abuja", "Ibadan", "Enugu", "Kano"], weight: 6, competition: "African basketball" },
  { code: "HR", label: "Croatia", cities: ["Zagreb", "Split", "Zadar", "Rijeka"], weight: 5, competition: "Adriatic League" },
  { code: "SI", label: "Slovenia", cities: ["Ljubljana", "Maribor", "Celje", "Kranj"], weight: 5, competition: "Adriatic League" },
  { code: "GR", label: "Greece", cities: ["Athens", "Thessaloniki", "Patras", "Larissa"], weight: 5, competition: "Greek Basket League" },
  { code: "TR", label: "Turkey", cities: ["Istanbul", "Ankara", "Izmir", "Bursa"], weight: 5, competition: "Turkish BSL" },
  { code: "BR", label: "Brazil", cities: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Brasília"], weight: 4, competition: "Brazilian NBB" },
  { code: "DO", label: "Dominican Republic", cities: ["Santo Domingo", "Santiago", "La Romana"], weight: 4, competition: "Dominican LNB" },
  { code: "CM", label: "Cameroon", cities: ["Douala", "Yaoundé", "Bafoussam"], weight: 3, competition: "African basketball" },
  { code: "SN", label: "Senegal", cities: ["Dakar", "Thiès", "Saint-Louis"], weight: 3, competition: "African basketball" },
  { code: "JP", label: "Japan", cities: ["Tokyo", "Osaka", "Yokohama", "Kyoto"], weight: 3, competition: "Japan B.League" },
  { code: "KR", label: "South Korea", cities: ["Seoul", "Busan", "Incheon", "Daegu"], weight: 2, competition: "Korean KBL" },
  { code: "LV", label: "Latvia", cities: ["Riga", "Liepāja", "Daugavpils"], weight: 3, competition: "Latvian-Estonian League" },
  { code: "GE", label: "Georgia", cities: ["Tbilisi", "Batumi", "Kutaisi"], weight: 2, competition: "Georgian Superliga" },
  { code: "IT", label: "Italy", cities: ["Rome", "Milan", "Bologna", "Naples"], weight: 4, competition: "Italian LBA" },
  { code: "NZ", label: "New Zealand", cities: ["Auckland", "Wellington", "Christchurch"], weight: 3, competition: "NBL New Zealand" },
  { code: "CN", label: "China", cities: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen"], weight: 3, competition: "Chinese CBA" },
  { code: "PH", label: "Philippines", cities: ["Manila", "Quezon City", "Cebu City"], weight: 2, competition: "Philippine PBA" },
  { code: "MX", label: "Mexico", cities: ["Mexico City", "Monterrey", "Guadalajara"], weight: 3, competition: "Mexican LNBP" },
  { code: "BS", label: "Bahamas", cities: ["Nassau", "Freeport"], weight: 2, competition: "Caribbean basketball" },
  { code: "GB", label: "United Kingdom", cities: ["London", "Manchester", "Birmingham"], weight: 3, competition: "British Super League" },
];
const US = ORIGINS[0]!;
const INTERNATIONAL = ORIGINS.filter(origin => origin.code !== "US");
const TEMPERAMENTS = ["Quiet competitor", "Expressive leader", "Team-first", "Unflappable", "Intense", "Easygoing", "Independent thinker", "High-energy"] as const;
const INTERESTS = ["Film room regular", "Gym rat", "Community-minded", "Music lover", "Family-oriented", "Sneaker collector", "Student of the game", "Low-key off court"] as const;

export function originLabel(code: string | undefined): string {
  return ORIGINS.find(origin => origin.code === code)?.label ?? "Unknown";
}
export function developmentLeagueForOrigin(code: string): string {
  return ORIGINS.find(origin => origin.code === code)?.competition ?? "International basketball";
}
export function portraitSeedForId(id: string): number {
  return hashString("gm-player-face:" + id);
}

function chooseOrigin(rng: Rng, pipeline: GmPlayer["pipeline"]): Origin {
  // International routes are foreign-born. College and G League routes can
  // include international players; NBA-like US majority without a race proxy.
  const foreignShare = pipeline === "international" ? 1
    : pipeline === "ncaa" ? 0.12 : pipeline === "gleague" ? 0.08 : 0.22;
  if (rng.next() >= foreignShare) return US;
  return rng.weighted(INTERNATIONAL, origin => origin.weight);
}

export function generatedPlayerIdentity(
  player: Pick<GmPlayer, "id" | "pipeline" | "personality">,
  usedNames?: Set<string>,
): { name: string; identity: GmPlayerIdentity } {
  const rng = new Rng(createStreams(hashString("gm-identity:" + player.id)), "generation");
  const origin = chooseOrigin(rng, player.pipeline);
  const familyOrigin = origin.code === "US" && rng.chance(0.22)
    ? rng.weighted(INTERNATIONAL, entry => entry.weight)
    : null;
  const nameCountry = familyOrigin?.code ?? origin.code;
  let name = "";
  for (let attempt = 0; attempt < 200; attempt++) {
    name = drawName(rng, poolFor(nameCountry)).displayName;
    if (!usedNames?.has(name)) break;
  }
  // Never endlessly loop if a class grows larger than an existing name pool.
  if (usedNames?.has(name)) name += " " + String((portraitSeedForId(player.id) % 900) + 100);
  usedNames?.add(name);
  const identity: GmPlayerIdentity = {
    version: 1,
    countryCode: origin.code,
    hometown: rng.pick(origin.cities),
    ...(familyOrigin ? { familyOriginCode: familyOrigin.code } : {}),
    portraitSeed: portraitSeedForId(player.id),
    temperament: player.personality >= 18 ? "Expressive leader"
      : player.personality <= -10 ? "Quiet competitor"
      : rng.pick(TEMPERAMENTS),
    interest: rng.pick(INTERESTS),
  };
  return { name, identity };
}

/** Old saves keep all their names, contracts and development values intact. */
export function withGeneratedPlayerIdentity(
  player: GmPlayer,
  opts: { preserveName?: boolean; usedNames?: Set<string> } = {},
): GmPlayer {
  if (!isFictionalGmPlayer(player) || player.identity) {
    opts.usedNames?.add(player.name);
    return player;
  }
  const next = generatedPlayerIdentity(player, opts.usedNames);
  return { ...player, name: opts.preserveName ? player.name : next.name, identity: next.identity };
}
