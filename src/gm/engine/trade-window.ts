import type { GmLeagueState } from "@/gm/types";

/** NBA-style franchise trade clock.
 * The in-season deadline is not a permanent ban: once the Finals finish,
 * the offseason trade market reopens, except during the July moratorium.
 * This save models the Finals as a shared release point rather than allowing
 * separate eliminated-team windows during an active playoff bracket.
 */
export function tradeWindowStatus(league: GmLeagueState): { open: boolean; reason: string; label: string } {
  if (league.phase === "regular") return league.tradeDeadlinePassed
    ? { open: false, reason: "Trading resumes after the Finals. Prepare your offseason targets.", label: "Trade deadline passed" }
    : { open: true, reason: "", label: "In-season trades open" };

  if (league.phase === "free_agency" &&
      league.faMarket?.stage === "moratorium" && !league.faMarket.done)
    return { open: false, reason: "Trades pause during the July free-agency moratorium and reopen when signing begins.", label: "Moratorium" };

  if (["offseason", "draft", "free_agency"].includes(league.phase) ||
      (league.phase === "playoffs" && Boolean(league.champion)))
    return { open: true, reason: "", label: "Offseason trades open" };

  return { open: false, reason: "Trading reopens once the Finals finish.", label: "Trading unavailable" };
}
