import { calendar } from "./career";
import { clamp, rngOf } from "./rng";
import type { AdvisorStyle, Agent, Finance, LifeState, Lifestyle } from "./types";
import { country } from "./world";

/**
 * Player money (model). Salary and endorsements arrive monthly, the agent
 * takes a fee, a modeled effective tax comes out, part goes home, lifestyle
 * costs are paid and the rest sits in cash or an advised portfolio. Tax rates
 * are rough effective rates by income level, not tax advice or real brackets.
 */

const TOP_TAX: Record<string, number> = { HIC: 0.42, UMC: 0.3, LMC: 0.25, LIC: 0.2, INX: 0.3 };

/** Effective tax on a year's gross income where the player works (model). */
export function taxRate(countryId: string, grossPerYear: number): number {
  const top = TOP_TAX[country(countryId).income.level] ?? 0.3;
  if (grossPerYear <= 0) return 0;
  return top * clamp(Math.log10(grossPerYear / 10_000) / 2, 0.3, 1);
}

export const LIFESTYLE: Record<Lifestyle, { label: string; base: number; share: number; detail: string }> = {
  frugal: { label: "Frugal", base: 600, share: 0.1, detail: "Shared apartment, public transport." },
  standard: { label: "Comfortable", base: 1500, share: 0.2, detail: "Your own place and a reliable car." },
  lavish: { label: "Lavish", base: 4000, share: 0.4, detail: "Downtown condo, nice cars, an entourage." },
};

export const ADVISOR: Record<AdvisorStyle, { label: string; mean: number; sd: number; fee: number; detail: string }> = {
  index: { label: "Index funds", mean: 0.065, sd: 0.15, fee: 0.002, detail: "Low-cost index funds. Swings with the market." },
  balanced: { label: "Wealth manager", mean: 0.05, sd: 0.09, fee: 0.01, detail: "Stocks and bonds. Steadier, 1% a year in fees." },
  aggressive: { label: "A friend's fund", mean: 0.08, sd: 0.32, fee: 0.02, detail: "Concentrated bets. Big years and bad ones." },
};

export function newFinance(means: number): Finance {
  return {
    cash: 0,
    invested: 0,
    advisor: null,
    agent: null,
    lifestyle: "standard",
    endorsements: [],
    sendHomeShare: means <= 2 ? 0.15 : 0.05,
    ytd: { year: 0, gross: 0, tax: 0, fees: 0, spend: 0, returns: 0 },
    years: [],
  };
}

export const netWorth = (f: Finance) => Math.round(f.cash + f.invested);

/** Adults with their own money pay their own way; before that the family does. */
export function selfFunded(s: LifeState): boolean {
  return s.ageMonths >= 216 && (s.finance.cash > 0 || (s.placement.contract?.salary ?? 0) > 0);
}

export function wallet(s: LifeState): number {
  return (selfFunded(s) ? s.finance.cash + s.finance.invested : 0) + s.family.savings;
}

export function charge(s: LifeState, amount: number) {
  let left = amount;
  if (selfFunded(s)) {
    const fromCash = Math.min(left, Math.max(0, s.finance.cash));
    s.finance.cash -= fromCash;
    left -= fromCash;
    const fromInv = Math.min(left, s.finance.invested);
    s.finance.invested -= fromInv;
    left -= fromInv;
    s.finance.ytd.spend += amount - left;
  }
  s.family.savings = Math.max(0, s.family.savings - left);
}

export function canPay(s: LifeState, amount: number): boolean {
  return wallet(s) + s.family.monthlyBudget * 3 >= amount;
}

export function monthlySpend(s: LifeState, netPerMonth: number): number {
  const l = LIFESTYLE[s.finance.lifestyle];
  return Math.round(l.base * country(s.residence.countryId).model.costIndex + Math.max(0, netPerMonth) * l.share);
}

export function makeAgent(name: string, firm: string, fee: number, reach: Agent["reach"], since: number): Agent {
  return { name, firm, fee, reach, since };
}

/** Monthly money step. Draws from the finance stream only when there is a portfolio. */
export function stepFinance(s: LifeState) {
  const f = s.finance;
  const { month, year } = calendar(s);
  if (f.ytd.year === 0) f.ytd.year = year;
  if (month === 1 && f.ytd.year < year) closeYear(s, year);
  const salary = s.placement.contract?.salary ?? 0;
  const endorse = f.endorsements.reduce((a, e) => a + e.perYear, 0);
  const grossYear = salary + endorse;
  let netMonth = 0;
  if (grossYear > 0) {
    const gross = grossYear / 12;
    const fees = f.agent ? (salary * f.agent.fee + endorse * 0.15) / 12 : 0;
    const tax = (gross - fees) * taxRate(s.placement.countryId, grossYear);
    const net = gross - fees - tax;
    netMonth = net;
    const home = net * f.sendHomeShare;
    s.family.savings += home;
    f.cash += net - home;
    s.earnings += gross;
    f.ytd.gross += gross;
    f.ytd.fees += fees;
    f.ytd.tax += tax;
  }
  if (selfFunded(s)) {
    const spend = monthlySpend(s, netMonth);
    f.cash -= spend;
    f.ytd.spend += spend;
    if (f.cash < 0) {
      const pull = Math.min(-f.cash, f.invested);
      f.invested -= pull;
      f.cash += pull;
      if (f.cash < 0) {
        f.cash = 0;
        s.flags.broke = s.ageMonths;
      }
    }
  }
  if (f.advisor) {
    const reserve = monthlySpend(s, 0) * 6;
    if (f.cash > reserve) {
      f.invested += f.cash - reserve;
      f.cash = reserve;
    }
  }
  if (f.advisor && f.invested > 0) {
    const a = ADVISOR[f.advisor];
    const r = rngOf(s.rng, "finance").normal(a.mean / 12, a.sd / Math.sqrt(12)) - a.fee / 12;
    const ret = f.invested * Math.max(-0.5, r);
    f.invested = Math.max(0, f.invested + ret);
    f.ytd.returns += ret;
  }
}

function closeYear(s: LifeState, year: number) {
  const f = s.finance;
  const y = f.ytd;
  if (y.gross > 0 || y.spend > 0 || y.returns !== 0) {
    f.years.push({ ...y, gross: Math.round(y.gross), tax: Math.round(y.tax), fees: Math.round(y.fees), spend: Math.round(y.spend), returns: Math.round(y.returns), netWorth: netWorth(f) });
    if (f.years.length > 24) f.years.shift();
  }
  f.ytd = { year, gross: 0, tax: 0, fees: 0, spend: 0, returns: 0 };
  for (const e of f.endorsements) e.yearsLeft -= 1;
  f.endorsements = f.endorsements.filter((e) => e.yearsLeft > 0);
}
