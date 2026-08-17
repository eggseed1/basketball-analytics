/**
 * Soft-fail team catalog for Explore (and any UI that needs Team[] filters).
 *
 * Hierarchy: live ESPN (incl. espnFetchJson memory cache) → process-local
 * last-good ESPN → canonical identity map.
 *
 * Provider outages (403/429/5xx/timeout) must not crash pages.
 */

import {
  listCanonicalTeams,
  resolveCanonicalTeam,
} from "@/data/identity/team-map";
import { getDataProvider } from "@/data/providers";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import type { Team } from "@/data/types";

export type TeamCatalogSource =
  | "live-espn"
  | "cached-espn"
  | "canonical-fallback"
  | "local-sample";

export type TeamsCatalogResult = {
  teams: Team[];
  source: TeamCatalogSource;
  warnings: string[];
};

const LIVE_TIMEOUT_MS = 6_000;

const FALLBACK_WARNING =
  "Live team metadata temporarily unavailable; using verified team identities.";

const CACHED_WARNING =
  "Live team metadata temporarily unavailable; using recently cached ESPN teams.";

/** Process-local last successful live catalog (survives within a warm instance). */
let lastSuccessfulLiveTeams: Team[] | null = null;

type LiveTeamsLoader = () => Promise<Team[]>;

let liveLoaderOverride: LiveTeamsLoader | null = null;

/** Nickname by abbr — mirrors team-map without exporting private maps. */
const NICKNAMES: Record<string, string> = {
  ATL: "Hawks",
  BOS: "Celtics",
  BKN: "Nets",
  CHA: "Hornets",
  CHI: "Bulls",
  CLE: "Cavaliers",
  DAL: "Mavericks",
  DEN: "Nuggets",
  DET: "Pistons",
  GSW: "Warriors",
  HOU: "Rockets",
  IND: "Pacers",
  LAC: "Clippers",
  LAL: "Lakers",
  MEM: "Grizzlies",
  MIA: "Heat",
  MIL: "Bucks",
  MIN: "Timberwolves",
  NOP: "Pelicans",
  NYK: "Knicks",
  OKC: "Thunder",
  ORL: "Magic",
  PHI: "76ers",
  PHX: "Suns",
  POR: "Trail Blazers",
  SAC: "Kings",
  SAS: "Spurs",
  TOR: "Raptors",
  UTA: "Jazz",
  WAS: "Wizards",
};

/** Build Team[] from the static canonical identity layer (never network). */
export function teamsFromCanonicalIdentity(): Team[] {
  return listCanonicalTeams().map((t) => {
    const meta = ESPN_TEAM_META[t.canonicalTeamId];
    const abbr = t.abbr.toUpperCase();
    const nickname = NICKNAMES[abbr] ?? abbr;
    return {
      id: t.canonicalTeamId,
      abbreviation: abbr,
      fullName: t.displayName,
      city: meta?.city ?? "",
      nickname,
      conference: meta?.conference ?? "East",
      division: meta?.division ?? "",
    } satisfies Team;
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Team metadata request timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function classifyProviderError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown provider error";
  const status = /ESPN request failed \((\d+)\)/.exec(error.message)?.[1];
  if (status) return `ESPN HTTP ${status}`;
  if (/timed out/i.test(error.message)) return "timeout";
  return error.message.slice(0, 160);
}

function defaultLiveLoader(): Promise<Team[]> {
  return getDataProvider().getTeams();
}

/**
 * Soft-fail team list for filters / explore tooling.
 * Never throws for provider unavailability.
 */
export async function getTeamsCatalog(): Promise<TeamsCatalogResult> {
  const provider = getDataProvider();
  const load = liveLoaderOverride ?? defaultLiveLoader;

  if (provider.name === "local" && !liveLoaderOverride) {
    const teams = await provider.getTeams();
    return { teams, source: "local-sample", warnings: [] };
  }

  try {
    const teams = await withTimeout(load(), LIVE_TIMEOUT_MS);
    if (Array.isArray(teams) && teams.length > 0) {
      lastSuccessfulLiveTeams = teams;
      const source: TeamCatalogSource = liveLoaderOverride
        ? "live-espn"
        : provider.name === "local"
          ? "local-sample"
          : "live-espn";
      return {
        teams,
        source,
        warnings: [],
      };
    }
    console.warn(
      "[teams-catalog] live team metadata empty; using fallback hierarchy"
    );
  } catch (error) {
    console.warn(
      `[teams-catalog] live team metadata unavailable (${classifyProviderError(error)}); activating fallback`
    );
  }

  if (lastSuccessfulLiveTeams && lastSuccessfulLiveTeams.length > 0) {
    return {
      teams: lastSuccessfulLiveTeams,
      source: "cached-espn",
      warnings: [CACHED_WARNING],
    };
  }

  const teams = teamsFromCanonicalIdentity();
  return {
    teams,
    source: "canonical-fallback",
    warnings: [FALLBACK_WARNING],
  };
}

/** @deprecated Prefer getTeamsCatalog when source/warnings matter. Soft-fail. */
export async function getTeamsSoft(): Promise<Team[]> {
  return (await getTeamsCatalog()).teams;
}

/**
 * Resolve a filter param against the catalog (and identity layer).
 * Invalid tokens stay unresolved — not confused with provider outage.
 */
export function resolveTeamFilterAgainstCatalog(
  teamParam: string,
  catalog: Team[]
): { status: "all" | "resolved" | "unresolved"; team?: Team; canonicalId?: string } {
  const raw = teamParam.trim();
  if (!raw || raw.toUpperCase() === "ALL") {
    return { status: "all" };
  }

  const identity = resolveCanonicalTeam(raw);
  if (identity.status === "resolved") {
    const id = identity.team.canonicalTeamId;
    const hit =
      catalog.find((t) => t.id === id) ??
      catalog.find(
        (t) => t.abbreviation.toUpperCase() === identity.team.abbr.toUpperCase()
      );
    if (hit) {
      return { status: "resolved", team: hit, canonicalId: id };
    }
    // Identity knows the team even if catalog row missing — synthesize from identity.
    const synthesized = teamsFromCanonicalIdentity().find((t) => t.id === id);
    if (synthesized) {
      return { status: "resolved", team: synthesized, canonicalId: id };
    }
  }

  const upper = raw.toUpperCase();
  const byAbbr = catalog.find((t) => t.abbreviation.toUpperCase() === upper);
  if (byAbbr) {
    return { status: "resolved", team: byAbbr, canonicalId: byAbbr.id };
  }
  const byId = catalog.find((t) => t.id === raw);
  if (byId) {
    return { status: "resolved", team: byId, canonicalId: byId.id };
  }

  return { status: "unresolved" };
}

/** Test hooks */
export function __setTeamsLiveLoaderForTests(loader: LiveTeamsLoader | null) {
  liveLoaderOverride = loader;
}

export function __resetTeamsCatalogForTests() {
  liveLoaderOverride = null;
  lastSuccessfulLiveTeams = null;
}

export function __seedCachedLiveTeamsForTests(teams: Team[] | null) {
  lastSuccessfulLiveTeams = teams;
}
