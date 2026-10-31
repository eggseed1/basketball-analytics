import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { exceptionAmounts, maxSalaryForAge } from "@/gm/engine/cap";
import { askingSalary } from "@/gm/engine/free-agency-ask";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { cbaSeason } from "@/gm/engine/season-flow-state";

export type ExtensionQuote = { eligible: boolean; reason: string; kind: "rookie" | "veteran"; startsSeason: number; maxYears: number; maxSalaryM: number; askingSalaryM: number };
const round = (value: number) => Math.round(value * 100) / 100;

/** Final-year extensions. Published books do not contain original signing dates. */
export function extensionQuote(league: GmLeagueState, player: GmPlayer): ExtensionQuote {
  const season = cbaSeason(league), contract = player.contract;
  const rookie = player.draftYear != null && (player.draftPick ?? 99) <= 30 && season - player.draftYear <= 4 && (player.serviceYears ?? 0) <= 4;
  const last = contract?.years?.at(-1);
  const ceiling = round(Math.min(maxSalaryForAge(player.age, league.settings), rookie ? Infinity : (last?.salaryM ?? contract?.annualSalaryM ?? 0) * (season >= 2024 ? 1.4 : 1.2)));
  const ask = round(Math.max(exceptionAmounts(league.settings).minimumM, askingSalary(player, getCbaRules(season)) * (player.morale >= 70 ? 0.95 : player.morale < 45 ? 1.08 : 1) * (player.rolePromise?.status === "unmet" ? 1.08 : 1)));
  const quote: ExtensionQuote = { eligible: true, reason: "Adds future years. This season's salary stays in place.", kind: rookie ? "rookie" : "veteran", startsSeason: (last?.season ?? season + (contract?.yearsRemaining ?? 1) - 1) + 1, maxYears: rookie && season >= 2024 ? 5 : 4, maxSalaryM: ceiling, askingSalaryM: ask };
  const no = (reason: string): ExtensionQuote => ({ ...quote, eligible: false, reason });
  if (player.teamId !== league.userTeamId || !contract) return no("Only players under contract to your club can extend.");
  if (contract.extension) return no("An extension is already signed.");
  if (contract.yearsRemaining !== 1) return no("This desk handles the final year of a contract.");
  if (contract.option) return no("Resolve the contract option in summer before negotiating.");
  if (!["regular", "free_agency", "offseason"].includes(league.phase)) return no("Extensions reopen after the Finals.");
  if (league.phase === "free_agency" && !["open", "fill"].includes(league.faMarket?.stage ?? "")) return no("Extensions can sign when the free-agency signing window opens.");
  if (rookie && league.seasonFlow?.stage && !league.seasonFlow.contractsRolled) return no("The rookie extension deadline passed before last season. Resolve his expiring rights in free agency.");
  if (rookie && league.phase === "regular" && league.schedule.some(game => game.played && !game.postseason && !game.exhibition)) return no("The rookie extension window closed at opening night. Keep his rights for summer.");
  if (contract.originalYears != null && contract.originalYears < (rookie ? 4 : 3)) return no("This contract is too short for this extension window.");
  if (contract.originalYears != null && season - contract.signedSeason < (rookie || contract.originalYears >= 5 ? 3 : 2)) return no("The extension anniversary has not arrived.");
  if (player.morale < 30) return no("He prefers to test free agency. Improving his role may change his mind.");
  if (ask > ceiling + 0.05) return no("His asking price exceeds the extension ceiling. Retain his rights for free agency.");
  return quote;
}

export function offerExtension(league: GmLeagueState, playerId: string, salaryM: number, years: number): { ok: boolean; state: GmLeagueState; reason: string } {
  const player = league.players.find(row => row.id === playerId);
  const fail = (reason: string) => ({ ok: false, state: league, reason });
  if (!player) return fail("Player not found.");
  const quote = extensionQuote(league, player);
  if (!quote.eligible) return fail(quote.reason);
  if (!Number.isInteger(years) || years < 1 || years > quote.maxYears) return fail("Choose between 1 and " + quote.maxYears + " added years.");
  if (!Number.isFinite(salaryM) || salaryM < quote.askingSalaryM - 0.05) return fail("He is asking for $" + quote.askingSalaryM.toFixed(1) + "M per year.");
  if (salaryM > quote.maxSalaryM + 0.05) return fail("The extension ceiling is $" + quote.maxSalaryM.toFixed(1) + "M.");
  const contract = player.contract!;
  const existing = contract.years?.length ? [...contract.years] : Array.from({ length: contract.yearsRemaining }, (_, index) => ({ season: cbaSeason(league) + index, salaryM: contract.annualSalaryM }));
  const future = Array.from({ length: years }, (_, index) => ({ season: quote.startsSeason + index, salaryM: round(salaryM) }));
  const players = league.players.map(row => row.id !== player.id ? row : { ...row, morale: Math.min(100, row.morale + 3), contract: { ...contract, birdStartSeason: contract.birdStartSeason ?? contract.signedSeason, years: [...existing, ...future], yearsRemaining: existing.length + future.length, extension: { signedSeason: cbaSeason(league), startsSeason: quote.startsSeason, years, annualSalaryM: round(salaryM) } } });
  const reason = player.name + " signed " + years + " added years at $" + salaryM.toFixed(1) + "M, starting in " + quote.startsSeason + ".";
  return { ok: true, reason, state: { ...league, players, news: [{ id: "extension-" + league.season + "-" + player.id, season: league.season, day: league.day, headline: player.name + " extends", body: reason, tone: "good" as const }, ...league.news].slice(0, 50) } };
}
