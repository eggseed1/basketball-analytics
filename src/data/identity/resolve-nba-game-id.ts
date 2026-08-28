/**
 * Resolve ESPN event ids (`40…`) → NBA Stats GameIDs (`00########`).
 *
 * Scoreboard / game links are ESPN-native. Play-by-play + possession pipelines
 * require NBA CDN GameIDs. Crosswalk via public data.nba.com season schedules
 * (works from Vercel; does not use stats.nba.com).
 */

import { sharedGetOrSet } from "@/data/cache/shared-ttl-cache";
import { looksLikeEspnEventId, looksLikeNbaStatsGameId } from "@/data/identity/game-id";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { fetchEspnCdnGameSummary } from "@/data/providers/nba/espn-cdn-summary";
import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";
import type { EspnSummaryResponse } from "@/data/transformers/espn";

const SCHEDULE_TTL_MS = 1000 * 60 * 60 * 12;
const MAP_TTL_MS = 1000 * 60 * 60 * 24;

type NbaMobileGame = {
  gid?: string;
  gdte?: string;
  h?: { ta?: string };
  v?: { ta?: string };
};

type NbaMobileSchedule = {
  lscd?: Array<{
    mscd?: {
      g?: NbaMobileGame[];
    };
  }>;
};

type EspnGameMeta = {
  tipOffAt: string | null;
  homeAbbr: string;
  awayAbbr: string;
  seasonEndYear: number | null;
};

function normalizeAbbr(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

/** America/New_York calendar day for a tip-off instant. */
export function etDateFromInstant(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function candidateDates(tipOffAt: string | null): string[] {
  if (!tipOffAt) return [];
  const dates = new Set<string>();
  const et = etDateFromInstant(tipOffAt);
  if (et) dates.add(et);
  const utc = tipOffAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(utc)) dates.add(utc);
  // Tip near midnight UTC can land on the previous ET day — already covered by ET.
  return [...dates];
}

async function loadNbaSeasonSchedule(
  seasonStartYear: number
): Promise<NbaMobileGame[]> {
  return sharedGetOrSet(
    `nba-mobile-schedule:${seasonStartYear}`,
    {
      ttlMs: SCHEDULE_TTL_MS,
      staleMs: SCHEDULE_TTL_MS * 2,
      tags: ["nba-schedule", `nba-schedule:${seasonStartYear}`],
    },
    async () => {
      const url =
        `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/` +
        `${seasonStartYear}/league/00_full_schedule.json`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; +educational)",
          Referer: "https://www.nba.com/",
        },
        signal: AbortSignal.timeout(12_000),
        next: { revalidate: Math.floor(SCHEDULE_TTL_MS / 1000) },
      } as RequestInit);
      if (!response.ok) {
        throw new Error(
          `NBA schedule unavailable (${response.status}) for ${seasonStartYear}`
        );
      }
      const payload = (await response.json()) as NbaMobileSchedule;
      const games: NbaMobileGame[] = [];
      for (const month of payload.lscd ?? []) {
        for (const game of month.mscd?.g ?? []) {
          if (game?.gid) games.push(game);
        }
      }
      return games;
    }
  );
}

function matchScheduleGame(
  games: NbaMobileGame[],
  homeAbbr: string,
  awayAbbr: string,
  dates: string[]
): string | null {
  const home = normalizeAbbr(homeAbbr);
  const away = normalizeAbbr(awayAbbr);
  if (!home || !away || dates.length === 0) return null;

  for (const date of dates) {
    const hit = games.find(
      (game) =>
        String(game.gdte ?? "").slice(0, 10) === date &&
        normalizeAbbr(game.h?.ta) === home &&
        normalizeAbbr(game.v?.ta) === away &&
        looksLikeNbaStatsGameId(String(game.gid ?? ""))
    );
    if (hit?.gid) return String(hit.gid);
  }
  return null;
}

async function loadEspnGameMeta(espnEventId: string): Promise<EspnGameMeta | null> {
  const fromSummary = (summary: EspnSummaryResponse & {
    gameInfo?: { date?: string };
  }): EspnGameMeta | null => {
    const competition = summary.header?.competitions?.[0];
    if (!competition) return null;

    const competitors = competition.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    const homeAbbr = normalizeAbbr(home?.team?.abbreviation);
    const awayAbbr = normalizeAbbr(away?.team?.abbreviation);
    if (!homeAbbr || !awayAbbr) return null;

    const tipOffAt =
      summary.gameInfo?.date ??
      (competition as { date?: string }).date ??
      null;
    const seasonEndYear =
      typeof summary.header?.season?.year === "number"
        ? summary.header.season.year
        : null;

    return { tipOffAt, homeAbbr, awayAbbr, seasonEndYear };
  };

  // CDN first — site.api is often blocked from Cloudflare Workers.
  try {
    const fromCdn = await fetchEspnCdnGameSummary(espnEventId);
    const meta = fromCdn ? fromSummary(fromCdn) : null;
    if (meta) return meta;
  } catch {
    // fall through
  }

  const url =
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary` +
    `?event=${encodeURIComponent(espnEventId)}`;
  const summary = await espnFetchJson<EspnSummaryResponse & {
    gameInfo?: { date?: string };
  }>(url, {
    ttlMs: CACHE_TTL_MS.boxScore ?? 1000 * 60 * 5,
    retries: 1,
  });

  return fromSummary(summary);
}

/**
 * Map an ESPN event id to an NBA GameID, or null when unresolved.
 * Pass-through when the input is already an NBA GameID.
 */
export async function resolveNbaGameId(
  gameId: string
): Promise<string | null> {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  if (looksLikeNbaStatsGameId(id)) return id;
  if (!looksLikeEspnEventId(id)) return null;

  return sharedGetOrSet(
    `espn-nba-game-id:${id}`,
    {
      ttlMs: MAP_TTL_MS,
      staleMs: MAP_TTL_MS * 2,
      tags: ["espn-nba-game-id", `espn-nba-game-id:${id}`],
    },
    async () => {
      const meta = await loadEspnGameMeta(id);
      if (!meta) return null;

      const dates = candidateDates(meta.tipOffAt);
      const years = new Set<number>();
      if (meta.seasonEndYear != null) {
        years.add(meta.seasonEndYear - 1);
        years.add(meta.seasonEndYear);
      }
      for (const date of dates) {
        const y = Number(date.slice(0, 4));
        if (Number.isFinite(y)) {
          years.add(y);
          years.add(y - 1);
        }
      }

      for (const year of years) {
        try {
          const schedule = await loadNbaSeasonSchedule(year);
          const matched = matchScheduleGame(
            schedule,
            meta.homeAbbr,
            meta.awayAbbr,
            dates
          );
          if (matched) return matched;
        } catch {
          // try next year
        }
      }
      return null;
    }
  );
}
