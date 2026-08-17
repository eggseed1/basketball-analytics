/**
 * Build Franchise Lab schedule from real NBA games (BallDontLie / cache).
 * Matchups + tip dates mirror the real season; results start unplayed for sim.
 */

import type { Game } from "@/data/types";
import type { GmScheduleGame } from "@/gm/types";
import { resolveTeamBrand } from "@/lib/nba-brand";

function franchiseFromGameSide(
  teamId: string,
  abbr?: string,
  name?: string
): string | null {
  const brand =
    resolveTeamBrand(abbr) ??
    resolveTeamBrand(name) ??
    resolveTeamBrand(teamId);
  return brand?.id ?? null;
}

/**
 * Convert canonical Game rows → GmScheduleGame list.
 * Only regular-season games. Day index = order of unique tip dates.
 */
export function buildScheduleFromRealGames(
  games: Game[],
  seasonEndYear: number
): GmScheduleGame[] {
  const regular = games
    .filter((g) => g.gameType === "regular" && g.gameDate)
    .slice()
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? a.id.localeCompare(b.id)
        : a.gameDate.localeCompare(b.gameDate)
    );

  const dates = [...new Set(regular.map((g) => g.gameDate))];
  const dayByDate = new Map(dates.map((d, i) => [d, i]));

  const out: GmScheduleGame[] = [];
  for (const g of regular) {
    const home = franchiseFromGameSide(
      g.homeTeamId,
      g.homeTeamAbbr,
      g.homeTeamName
    );
    const away = franchiseFromGameSide(
      g.awayTeamId,
      g.awayTeamAbbr,
      g.awayTeamName
    );
    if (!home || !away || home === away) continue;
    out.push({
      id: `nba_${g.id}`,
      season: seasonEndYear,
      day: dayByDate.get(g.gameDate) ?? 0,
      gameDate: g.gameDate,
      homeTeamId: home,
      awayTeamId: away,
      played: false,
    });
  }
  return out;
}

export function scheduleLooksComplete(schedule: GmScheduleGame[]): boolean {
  // Modern 30-team seasons ≈ 1230 games; allow shorter (lockouts / truncated).
  return schedule.length >= 600;
}

/** Format YYYY-MM-DD → "JAN 28". */
export function formatTipDate(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const [, m, d] = iso.split("-");
  const month = months[Number(m) - 1] ?? "";
  return `${month} ${Number(d)}`;
}

export function formatTipDateLong(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const dt = new Date(`${iso}T12:00:00Z`);
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export function parseIsoParts(iso: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}
