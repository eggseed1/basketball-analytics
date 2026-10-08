import worldJson from "./data/world.json";

export type ResearchStatus = "verified" | "partial" | "unknown" | "inactive" | "confirmed-absence";
export type FibaRegion = "africa" | "americas" | "asia" | "europe" | "oceania" | "none";

export interface LeagueModel {
  strength: number;
  exposure: number;
  coaching: number;
  salaryUsd: [number, number];
  games: number;
  minutesCap: number;
  season: { startMonth: number; months: number };
  minAge: number;
}

export interface LeagueProfile {
  id: string;
  name: string;
  countries: string[];
  category: string;
  selective: boolean;
  crossBorder: boolean;
  research: { status: ResearchStatus; evidence: string; source: string; url: string; checkedAt: string };
  model: LeagueModel | null;
}

export interface CountryBasketballProfile {
  id: string;
  iso3: string;
  isoNumeric: string | null;
  isoListed: boolean;
  name: string;
  isoName?: string;
  kind: "sovereign" | "territory" | "special" | "uninhabited";
  administeredBy: string | null;
  note: string | null;
  inhabited: boolean;
  citizenship: string;
  capital: string | null;
  region: FibaRegion;
  income: { level: "HIC" | "UMC" | "LMC" | "LIC" | "INX"; label: string; source: string };
  draw: { weight: number; births: number | null; year: number | null; source: string | null; method: string; estimated: boolean };
  federation: { fibaCode: string; fibaName: string; name: string; fibaRegion: string; website: string | null; source: string } | null;
  competitions: { domestic: string[]; crossBorder: string[]; selective: string[] };
  routeNotes: { system: string; text: string; basis: "confirmed" | "model"; sources: string[] }[];
  model: { costIndex: number; coachingAccess: number; exposureBase: number; verifiedPro: boolean };
  research: { status: ResearchStatus; reason: string; checkedAt: string };
}

interface WorldData {
  meta: {
    worldSnapshotVersion: string;
    disclaimer: string;
    sources: Record<string, string>;
    draftRule: string;
    modelNote: string;
    localSeniorModel: LeagueModel;
  };
  countries: CountryBasketballProfile[];
  leagues: LeagueProfile[];
}

const world = worldJson as unknown as WorldData;

export const WORLD_META = world.meta;
export const WORLD_VERSION = world.meta.worldSnapshotVersion;
export const COUNTRIES = world.countries;
export const LEAGUES = world.leagues;

const countryById = new Map(COUNTRIES.map((c) => [c.id, c]));
const leagueById = new Map(LEAGUES.map((l) => [l.id, l]));

export const PLAYABLE_COUNTRIES = COUNTRIES.filter((c) => c.inhabited && c.draw.weight > 0);

export function country(id: string): CountryBasketballProfile {
  const c = countryById.get(id);
  if (!c) throw new Error(`Unknown country ${id}`);
  return c;
}

export function maybeCountry(id: string | null | undefined): CountryBasketballProfile | null {
  return id ? (countryById.get(id) ?? null) : null;
}

export function league(id: string): LeagueProfile {
  const l = leagueById.get(id);
  if (!l) throw new Error(`Unknown league ${id}`);
  return l;
}

export function maybeLeague(id: string | null | undefined): LeagueProfile | null {
  return id ? (leagueById.get(id) ?? null) : null;
}

/** Verified leagues with model parameters that a club in this country can play in. */
export function domesticProLeagues(countryId: string): LeagueProfile[] {
  const c = countryById.get(countryId);
  if (!c) return [];
  return c.competitions.domestic
    .map((id) => leagueById.get(id)!)
    .filter((l) => l && l.research.status === "verified" && l.model && isClubLeague(l))
    .sort((a, b) => b.model!.strength - a.model!.strength);
}

const NON_CLUB = new Set(["nba", "g-league", "ncaa", "nfhs", "nbl-next-stars", "bwb", "liga-proximo-ar", "bfi", "nba-academy-africa"]);

export function isClubLeague(l: LeagueProfile): boolean {
  return !NON_CLUB.has(l.id) && !l.crossBorder && !l.selective && l.category !== "federation" && l.category !== "university" && l.category !== "school" && l.category !== "academy";
}

/** Foreign destinations a player could plausibly be invited to. */
export function foreignProLeagues(excludeCountry: string): LeagueProfile[] {
  return LEAGUES.filter(
    (l) =>
      l.research.status === "verified" &&
      l.model &&
      isClubLeague(l) &&
      l.countries.length > 0 &&
      !l.countries.includes(excludeCountry) &&
      l.model.strength >= 50,
  );
}

export function localSeniorModel(): LeagueModel {
  return world.meta.localSeniorModel;
}

export function regionLabel(r: FibaRegion): string {
  return { africa: "Africa", americas: "Americas", asia: "Asia", europe: "Europe", oceania: "Oceania", none: "None" }[r];
}

export function countryFlag(id: string): string {
  if (!/^[A-Z]{2}$/.test(id)) return "";
  return String.fromCodePoint(...[...id].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
}
