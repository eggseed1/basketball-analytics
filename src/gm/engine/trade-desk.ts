/**
 * A concise front-office read for the Trade Desk. The exact acceptance decision
 * remains evaluateTrade. This explains that decision without inventing odds or
 * claiming that a legal trade is automatically attractive to its partner.
 */
import type { GmLeagueState, GmTradeAsset } from "@/gm/types";
import { assetSalary, evaluateTrade } from "@/gm/engine/trades";
import { rosterProfile } from "@/gm/engine/roster-fit";
import { tradeStance } from "@/gm/engine/value";

export type TradeDeskRead = {
  status: "incomplete" | "ready" | "value" | "rules";
  headline: string;
  detail: string;
  need: string;
  sendsSalaryM: number;
  receivesSalaryM: number;
  differenceM: number;
};

export function tradeDeskRead(
  league: GmLeagueState,
  partnerId: string,
  youSend: GmTradeAsset[],
  youReceive: GmTradeAsset[]
): TradeDeskRead {
  const partner = league.teams.find(t => t.id === partnerId);
  const partnerName = partner?.abbr ?? "That team";
  const sendsSalaryM = youSend.reduce((sum, asset) => sum + assetSalary(asset, league.players), 0);
  const receivesSalaryM = youReceive.reduce((sum, asset) => sum + assetSalary(asset, league.players), 0);
  const profile = partner ? rosterProfile(league, partnerId) : null;
  const stance = partner ? tradeStance(league, partnerId) : "stay";
  const need = stance === "sell"
    ? "They value young players and future picks."
    : stance === "buy"
      ? `They want immediate help, especially at ${profile?.needs.slice(0, 2).join(" or ") ?? "thin positions"}.`
      : `They need a clear upgrade, especially at ${profile?.needs.slice(0, 2).join(" or ") ?? "thin positions"}.`;
  const base = { need, sendsSalaryM, receivesSalaryM, differenceM: receivesSalaryM - sendsSalaryM };
  if (!youSend.length || !youReceive.length) {
    return { ...base, status: "incomplete", headline: "Build a two-sided offer",
      detail: "Choose at least one asset from each team, then review their response." };
  }
  const verdict = evaluateTrade(league, league.userTeamId, partnerId, youSend, youReceive);
  if (verdict.ok) {
    return { ...base, status: "ready", headline: "They would accept this deal",
      detail: `${partnerName} approves the current terms. Proposing the trade will complete it.` };
  }
  if (verdict.reason?.includes("rejects: not enough value")) {
    const alreadySentPick = youSend.some(a => a.type === "pick");
    const request = stance === "sell"
      ? alreadySentPick ? "They may need a better pick or a younger prospect." : "Try a future pick or a young prospect."
      : stance === "buy"
        ? "Try a rotation player who fills one of their needs."
        : "Try improving the quality of the package.";
    return { ...base, status: "value", headline: "They want a stronger return",
      detail: `${partnerName} is not satisfied with the offer. ${request}` };
  }
  return { ...base, status: "rules", headline: "This deal isn't legal yet",
    detail: verdict.reason ?? "Change the assets or salaries to meet the league rules." };
}
