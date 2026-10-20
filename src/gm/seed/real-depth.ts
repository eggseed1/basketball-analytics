/**
 * ESPN depth charts → Franchise Lab starters, positions, and minute books.
 * Name-matched (ESPN athlete ids differ from our player ids).
 */

import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  allocateMinutes,
  clampAndRespread,
  clampRotationDepth,
  DEFAULT_ROTATION_DEPTH,
  maxMinutesForDepth,
  overallOf,
  positionFit,
  rotationTarget,
  starterSeatScore,
} from "@/gm/engine/lineup";
import { coachingOf } from "@/gm/engine/coaching";
import { FRANCHISES } from "@/gm/seed/franchises";
import type { GmLeagueState, GmPlayer, GmPosition, GmTeam } from "@/gm/types";

const SITE_API = "https://site.api.espn.com";
const POS_ORDER = ["pg", "sg", "sf", "pf", "c"] as const;
const POS_MAP: Record<(typeof POS_ORDER)[number], GmPosition> = {
  pg: "PG",
  sg: "SG",
  sf: "SF",
  pf: "PF",
  c: "C",
};

type DepthChartResponse = {
  depthchart?: Array<{
    positions?: Record<
      string,
      {
        athletes?: Array<{
          id?: string | number;
          displayName?: string;
          rank?: number;
        }>;
      }
    >;
  }>;
};

export type DepthAthlete = { name: string; espnId: string };
export type TeamDepthChart = {
  franchiseId: string;
  byPosition: Record<GmPosition, DepthAthlete[]>;
};

function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Depth chart for one ESPN team id. */
export async function fetchTeamDepthChart(
  espnTeamId: string
): Promise<Record<GmPosition, DepthAthlete[]>> {
  const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/depthcharts`;
  const payload = await espnFetchJson<DepthChartResponse>(url, {
    ttlMs: 1000 * 60 * 60 * 6,
    retries: 1,
  }).catch(() => ({}) as DepthChartResponse);

  const positions = payload.depthchart?.[0]?.positions ?? {};
  const out: Record<GmPosition, DepthAthlete[]> = {
    PG: [],
    SG: [],
    SF: [],
    PF: [],
    C: [],
  };
  for (const key of POS_ORDER) {
    const slot = POS_MAP[key];
    const athletes = positions[key]?.athletes ?? [];
    out[slot] = athletes
      .filter((row) => row.displayName)
      .map((row) => ({
        name: row.displayName!,
        espnId: String(row.id ?? ""),
      }));
  }
  return out;
}

/** One depth chart per franchise. Failures become empty charts. */
export async function fetchLeagueDepthCharts(): Promise<TeamDepthChart[]> {
  const charts = await Promise.all(
    FRANCHISES.map(async (franchise) => {
      const brand = resolveTeamBrand(franchise.id);
      const espnTeamId = brand?.espnTeamId;
      if (!espnTeamId) {
        return {
          franchiseId: franchise.id,
          byPosition: { PG: [], SG: [], SF: [], PF: [], C: [] } as Record<
            GmPosition,
            DepthAthlete[]
          >,
        };
      }
      const byPosition = await fetchTeamDepthChart(espnTeamId);
      return { franchiseId: franchise.id, byPosition };
    })
  );
  return charts;
}

/**
 * After positional fill, swap in unused players who are clearly better at a
 * seat they can cover. Stops end-of-bench bodies from locking a spot when a
 * star lists a neighboring position.
 */
function promoteBetterCovers(
  roster: GmPlayer[],
  starters: GmTeam["starters"],
  used: Set<string>
): void {
  const slots: GmPosition[] = ["C", "PG", "SG", "SF", "PF"];
  let guard = 0;
  while (guard++ < 8) {
    let swapped = false;
    const bench = roster
      .filter((player) => !used.has(player.id))
      .sort((a, b) => starterSeatScore(b) - starterSeatScore(a));
    for (const challenger of bench) {
      let bestSlot: GmPosition | null = null;
      let bestGain = 0;
      for (const slot of slots) {
        const starterId = starters[slot];
        if (!starterId) continue;
        const starter = roster.find((player) => player.id === starterId);
        if (!starter) continue;
        if (positionFit(challenger, slot) < 0.88) continue;
        const gain = starterSeatScore(challenger) - starterSeatScore(starter);
        if (gain < 2) continue;
        // Prefer claiming the weakest seat they beat clearly.
        if (gain > bestGain) {
          bestGain = gain;
          bestSlot = slot;
        }
      }
      if (!bestSlot) continue;
      const displaced = starters[bestSlot]!;
      starters[bestSlot] = challenger.id;
      used.delete(displaced);
      used.add(challenger.id);
      swapped = true;
      break;
    }
    if (!swapped) break;
  }
}

/**
 * Build a 240-minute book from real MPG, ordered by depth-chart / wish.
 * Caps individuals so leftovers never dump onto one star.
 */
export function minutesFromRealMpg(
  roster: GmPlayer[],
  starters: GmTeam["starters"],
  depth?: number
): { minutes: Record<string, number>; coverSlot: Record<string, GmPosition> } {
  // Prefer at least the default deep book when seeding from real MPG so
  // leftovers do not inflate specialists (Merrill, etc.) toward starter minutes.
  const want = clampRotationDepth(
    Math.max(depth ?? DEFAULT_ROTATION_DEPTH, 11)
  );
  const cap = maxMinutesForDepth(want);
  const coverSlot: Record<string, GmPosition> = {};
  const used = new Set<string>();
  const rows: { id: string; minutes: number }[] = [];
  let wishSum = 0;

  for (const slot of ["PG", "SG", "SF", "PF", "C"] as GmPosition[]) {
    const id = starters[slot];
    if (!id) continue;
    const player = roster.find((entry) => entry.id === id);
    if (!player || used.has(player.id)) continue;
    used.add(player.id);
    coverSlot[player.id] = slot;
    const wish = rotationTarget(player);
    // Starters keep most of their real minutes; never invent a 30+ night for a 19 MPG guy.
    const minutes = Math.min(cap, Math.max(wish, Math.min(wish + 4, 26)));
    rows.push({ id: player.id, minutes });
    wishSum += minutes;
  }

  const backups = roster
    .filter((player) => !used.has(player.id) && rotationTarget(player) >= 6)
    .sort((a, b) => rotationTarget(b) - rotationTarget(a));
  for (const player of backups) {
    if (rows.length >= want && wishSum >= 225) break;
    if (rows.length >= 11) break;
    used.add(player.id);
    coverSlot[player.id] = player.position;
    const minutes = Math.min(cap, rotationTarget(player));
    rows.push({ id: player.id, minutes });
    wishSum += minutes;
  }

  const minutes = allocateMinutes(
    rows.map((row) => ({
      ...row,
      minutes: Math.min(row.minutes, cap),
    })),
    want
  );
  // Clamp any leftover dump and re-spread onto the short end of the book.
  return { minutes: clampAndRespread(minutes, cap), coverSlot };
}

/**
 * Overlay ESPN depth charts onto a seeded league: positions, starters, minutes.
 * No-ops teams whose chart could not be fetched or matched.
 */
export function applyDepthCharts(
  league: GmLeagueState,
  charts: TeamDepthChart[]
): GmLeagueState {
  const byFranchise = new Map(charts.map((chart) => [chart.franchiseId, chart]));
  // Keep seed natural listings (height / weight / playstyle). The chart only
  // places starters and minutes — a career four can start at SF without
  // becoming a SG/SF on the sheet.
  const players = league.players;

  const teams = league.teams.map((team) => {
    const chart = byFranchise.get(team.id);
    const roster = players.filter((player) => player.teamId === team.id);
    if (!chart || roster.length < 5) {
      return seedMinutesIfMissing(team, roster);
    }

    const starters: GmTeam["starters"] = {
      PG: null,
      SG: null,
      SF: null,
      PF: null,
      C: null,
    };
    const used = new Set<string>();
    // ESPN rank-1 is often a mismatched wing (Walsh/Garza over Tatum/Brown).
    // Prefer primary/secondary at the seat ranked by overall; only stretch-slide
    // when nobody listed can take it (never park a star PF at center).
    for (const slot of ["C", "PG", "SG", "SF", "PF"] as GmPosition[]) {
      const chartNames = new Map(
        chart.byPosition[slot].map((athlete, index) => [
          nameKey(athlete.name),
          index,
        ])
      );
      const open = roster.filter((player) => !used.has(player.id));
      const listed = open.filter(
        (player) =>
          player.position === slot || player.secondaryPosition === slot
      );
      const slides = open.filter(
        (player) =>
          positionFit(player, slot) >= 0.88 &&
          player.position !== slot &&
          player.secondaryPosition !== slot
      );
      const pool = listed.length ? listed : slides;
      const pick = [...pool].sort((a, b) => {
        const score = (player: GmPlayer) => {
          const chartRank = chartNames.get(nameKey(player.name));
          const onChart = chartRank != null;
          return (
            starterSeatScore(player) * 10 +
            (player.position === slot ? 5 : 0) +
            (onChart ? Math.max(0, 4 - Math.min(chartRank!, 4)) : 0)
          );
        };
        return score(b) - score(a);
      })[0];
      if (!pick) continue;
      starters[slot] = pick.id;
      used.add(pick.id);
    }
    // Fill any hole the chart missed with the best remaining cover.
    for (const slot of ["C", "PG", "SG", "SF", "PF"] as GmPosition[]) {
      if (starters[slot]) continue;
      const natural = roster
        .filter(
          (player) =>
            !used.has(player.id) &&
            (player.position === slot || player.secondaryPosition === slot)
        )
        .sort(
          (a, b) =>
            overallOf(b) - overallOf(a) || rotationTarget(b) - rotationTarget(a)
        )[0];
      if (!natural) continue;
      starters[slot] = natural.id;
      used.add(natural.id);
    }

    // Promote clearly better unused players into a coverable seat (Jalen W.
    // shouldn't watch Kenrich start; Bridges shouldn't lose PF to Dadiet).
    promoteBetterCovers(roster, starters, used);

    const depth = clampRotationDepth(team.coaching?.rotationDepth);
    const book = minutesFromRealMpg(roster, starters, depth);
    const benchOrder = roster
      .filter((player) => !Object.values(starters).includes(player.id))
      .sort(
        (a, b) =>
          (book.minutes[b.id] ?? 0) - (book.minutes[a.id] ?? 0) ||
          rotationTarget(b) - rotationTarget(a)
      )
      .map((player) => player.id);

    return {
      ...team,
      starters,
      benchOrder,
      coaching: {
        ...coachingOf(team),
        minutes: book.minutes,
        coverSlot: book.coverSlot,
        rotationDepth: depth,
      },
    };
  });

  return { ...league, players, teams };
}

function seedMinutesIfMissing(team: GmTeam, roster: GmPlayer[]): GmTeam {
  if (team.coaching?.minutes && Object.keys(team.coaching.minutes).length >= 5) {
    return team;
  }
  const book = minutesFromRealMpg(roster, team.starters, team.coaching?.rotationDepth);
  return {
    ...team,
    coaching: {
      ...coachingOf(team),
      minutes: book.minutes,
      coverSlot: book.coverSlot,
    },
  };
}

/** Fetch + apply. Safe to call when offline (returns league unchanged on total miss). */
export async function applyLiveDepthCharts(
  league: GmLeagueState
): Promise<GmLeagueState> {
  try {
    const charts = await fetchLeagueDepthCharts();
    const matched = charts.filter((chart) =>
      (["PG", "SG", "SF", "PF", "C"] as GmPosition[]).some(
        (slot) => chart.byPosition[slot].length > 0
      )
    );
    if (matched.length < 10) return league;
    return applyDepthCharts(league, charts);
  } catch {
    return league;
  }
}
