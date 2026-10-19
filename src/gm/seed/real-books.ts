/**
 * Published contracts and future picks. The cap uses this year's salary.
 * Picks the club holds can be traded. Picks it owes stay on the book.
 */

import type { GmContract, GmContractYear, GmDraftPick, GmLeagueState, GmPlayer } from "@/gm/types";
import { bundledTeamContracts } from "@/data/runtime/bref-team-contracts";
import { bundledFuturePicks, type FuturePick } from "@/data/runtime/future-picks-snapshot";
import { resolveTeamBrand } from "@/lib/nba-brand";

function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function endYear(label: string): number {
  const match = /^(\d{4})/.exec(label);
  return match ? Number(match[1]) + 1 : 0;
}

export function contractFromPublished(
  seasons: string[],
  years: Array<{ amount: number; option?: "player" | "team"; notGuaranteed?: true } | null>,
  note: string | undefined,
  leagueSeason: number,
  bird: GmContract["birdRights"]
): GmContract | null {
  const book: GmContractYear[] = [];
  seasons.forEach((label, index) => {
    const cell = years[index];
    const season = endYear(label);
    if (!cell || !(cell.amount > 0) || season < leagueSeason) return;
    book.push({
      season,
      salaryM: Math.round((cell.amount / 1_000_000) * 100) / 100,
      option: cell.option ?? null,
      guaranteed: cell.notGuaranteed ? false : undefined,
    });
  });
  const current = book.find((year) => year.season === leagueSeason) ?? book[0];
  if (!current) return null;
  const last = book[book.length - 1]!;
  return {
    yearsRemaining: book.length,
    annualSalaryM: current.salaryM,
    birdRights: bird,
    option: last.option ?? null,
    signedSeason: book[0]!.season,
    years: book,
    note,
  };
}

function franchiseOf(teamId: string) {
  return resolveTeamBrand(teamId);
}

function pickFromPublished(pick: FuturePick, ownerId: string): GmDraftPick {
  const origin = resolveTeamBrand(pick.origin);
  const swap = pick.swapWith ? resolveTeamBrand(pick.swapWith) : undefined;
  return {
    id: `pick-${pick.year}-${pick.round}-${pick.origin}-${pick.swapWith ?? "own"}`,
    season: pick.year,
    round: pick.round,
    originalTeamId: origin?.id ?? ownerId,
    ownerTeamId: ownerId,
    swapWithTeamId: swap?.id,
    terms: pick.terms,
    frozen: pick.frozen || undefined,
  };
}

function booksForTeam(teamId: string, leagueSeason: number): { held: GmDraftPick[]; owed: GmDraftPick[] } | null {
  const brand = franchiseOf(teamId);
  if (!brand) return null;
  const book = bundledFuturePicks(brand.espnTeamId);
  if (!book) return null;
  const held: GmDraftPick[] = [];
  const owed: GmDraftPick[] = [];
  for (const pick of book.picks) {
    if (pick.year < leagueSeason) continue;
    const holder = resolveTeamBrand(pick.holder);
    const row = pickFromPublished(pick, holder?.id ?? teamId);
    if (holder?.id === teamId) held.push({ ...row, ownerTeamId: teamId });
    else owed.push(row);
  }
  return { held, owed };
}

function dealFor(player: GmPlayer, leagueSeason: number): GmContract | null {
  const brand = player.teamId ? franchiseOf(player.teamId) : undefined;
  if (!brand) return null;
  const book = bundledTeamContracts(brand.espnTeamId);
  if (!book) return null;
  const key = nameKey(player.name);
  const row = book.rows.find((entry) => nameKey(entry.name) === key);
  if (!row) return null;
  return contractFromPublished(
    book.seasons,
    row.years,
    book.notes[row.brefId],
    leagueSeason,
    player.contract?.birdRights ?? "none"
  );
}

/** Write the published book once. A later trade or signing is left alone. */
export function applyRealBooks(league: GmLeagueState): GmLeagueState {
  if (league.booksBook === 1 || league.season !== 2027) return league;
  const tradedPick = league.tradeLog.some((deal) =>
    [...deal.fromAssets, ...deal.toAssets].some((asset) => asset.type === "pick")
  );
  const players = league.players.map((player) => {
    const deal = dealFor(player, league.season);
    if (!deal) return player;
    return { ...player, contract: deal };
  });
  const teams = league.teams.map((team) => {
    if (tradedPick) return team;
    const book = booksForTeam(team.id, league.season);
    if (!book) return team;
    return { ...team, draftPicks: book.held, owedPicks: book.owed };
  });
  return { ...league, players, teams, booksBook: 1 };
}

/** Move the cap number to the next published season. */
export function advanceContractYear(contract: GmContract): GmContract {
  if (!contract.years?.length) {
    return { ...contract, yearsRemaining: Math.max(0, contract.yearsRemaining - 1) };
  }
  const spent = contract.years[0]!;
  const years = contract.years.slice(1);
  const head = years[0];
  const last = years[years.length - 1];
  return {
    ...contract,
    years,
    yearsRemaining: years.length,
    annualSalaryM: head?.salaryM ?? spent.salaryM,
    option: years.length ? (last?.option ?? null) : (spent.option ?? contract.option ?? null),
  };
}
