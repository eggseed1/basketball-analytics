import { calendar } from "./career";
import { clamp, rngOf } from "./rng";
import type { AdvisorStyle, Agent, Asset, Finance, LifeState, Lifestyle } from "./types";
import { country } from "./world";

/**
 * Player money (model). Pay arrives monthly, the agent takes a fee, a modeled
 * effective tax comes out, part goes home, lifestyle costs are paid and the
 * rest sits in cash or a portfolio. Tax rates are rough effective rates by
 * income level, not tax advice or real brackets.
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

export const ASSETS: Asset[] = ["savings", "bonds", "index", "stocks", "property", "crypto"];

/**
 * Asset model. `mean` and `sd` are yearly arithmetic figures for the game's
 * simulated market, not forecasts. Costs are charged on the amount bought or
 * sold.
 */
export const ASSET_INFO: Record<Asset, { label: string; short: string; detail: string; mean: number; sd: number; cost: number; color: string }> = {
  savings: { label: "Savings account", short: "Savings", detail: "Bank savings. Never loses money. About 2.5% a year.", mean: 0.025, sd: 0, cost: 0, color: "#8A9B9B" },
  bonds: { label: "Bonds", short: "Bonds", detail: "Government and company bonds. Small, steady returns.", mean: 0.04, sd: 0.06, cost: 0, color: "#48B9AB" },
  index: { label: "Stock index fund", short: "Index", detail: "The whole stock market in one cheap fund.", mean: 0.085, sd: 0.16, cost: 0, color: "#5CBF90" },
  stocks: { label: "Individual stocks", short: "Stocks", detail: "A handful of companies you pick. Bigger swings than the index.", mean: 0.1, sd: 0.3, cost: 0.002, color: "#D6AD51" },
  property: { label: "Real estate", short: "Property", detail: "Rental property: rent plus slow price growth. Buying or selling costs about 3% each way.", mean: 0.065, sd: 0.1, cost: 0.03, color: "#C78A55" },
  crypto: { label: "Crypto", short: "Crypto", detail: "Digital coins. Can double or halve in a year.", mean: 0.3, sd: 0.7, cost: 0.01, color: "#DF668C" },
};

/** Paid managers pick the mix and charge a yearly fee on what they manage. */
export const ADVISOR: Record<AdvisorStyle, { label: string; fee: number; detail: string; target: Record<Asset, number> }> = {
  index: { label: "Index funds", fee: 0.002, detail: "Mostly index funds with some bonds. Swings with the market.", target: mix({ index: 80, bonds: 20 }) },
  balanced: { label: "Wealth manager", fee: 0.01, detail: "Stocks, bonds and some property. Steadier, 1% a year in fees.", target: mix({ bonds: 40, index: 45, property: 15 }) },
  aggressive: { label: "A friend's fund", fee: 0.02, detail: "Hot stocks and crypto. Big years and bad ones.", target: mix({ stocks: 60, crypto: 40 }) },
};

export const PRESETS: { id: string; label: string; target: Record<Asset, number> }[] = [
  { id: "safe", label: "Safe", target: mix({ savings: 50, bonds: 50 }) },
  { id: "balanced", label: "Balanced", target: mix({ bonds: 35, index: 50, property: 15 }) },
  { id: "growth", label: "Growth", target: mix({ bonds: 10, index: 65, stocks: 15, property: 10 }) },
  { id: "risky", label: "High risk", target: mix({ index: 20, stocks: 40, crypto: 40 }) },
];

export function mix(p: Partial<Record<Asset, number>>): Record<Asset, number> {
  return { savings: 0, bonds: 0, index: 0, stocks: 0, property: 0, crypto: 0, ...p };
}

const ones = (): Record<Asset, number> => mix({ savings: 1, bonds: 1, index: 1, stocks: 1, property: 1, crypto: 1 });

export function newFinance(means: number): Finance {
  return {
    cash: 0,
    holdings: mix({}),
    target: mix({ savings: 100 }),
    autoInvest: false,
    advisor: null,
    agent: null,
    lifestyle: "standard",
    endorsements: [],
    sendHomeShare: means <= 2 ? 0.15 : 0.05,
    ytd: { year: 0, gross: 0, tax: 0, fees: 0, spend: 0, returns: 0 },
    years: [],
    market: { ytd: ones(), recent: [], years: [] },
  };
}

export const invested = (f: Finance) => ASSETS.reduce((a, k) => a + f.holdings[k], 0);
export const netWorth = (f: Finance) => Math.round(f.cash + invested(f));

/** Yearly pay from a playing contract or a job after playing. */
export const income = (s: LifeState) => (s.placement.contract?.salary ?? 0) + (s.after?.salary ?? 0);

/** Adults with their own money pay their own way; before that the family does. */
export function selfFunded(s: LifeState): boolean {
  return s.ageMonths >= 216 && (s.finance.cash > 0 || invested(s.finance) > 0 || income(s) > 0);
}

export function wallet(s: LifeState): number {
  return (selfFunded(s) ? s.finance.cash + invested(s.finance) : 0) + s.family.savings;
}

const SELL_ORDER: Asset[] = ["savings", "bonds", "index", "stocks", "crypto", "property"];

/** Sells holdings (cheapest to sell first) until `need` in cash is raised. Returns cash raised. */
function liquidate(f: Finance, need: number): number {
  let raised = 0;
  for (const k of SELL_ORDER) {
    if (raised >= need) break;
    const net = 1 - ASSET_INFO[k].cost;
    const sell = Math.min(f.holdings[k], (need - raised) / net);
    f.holdings[k] -= sell;
    raised += sell * net;
  }
  return raised;
}

export function charge(s: LifeState, amount: number) {
  let left = amount;
  if (selfFunded(s)) {
    const f = s.finance;
    const fromCash = Math.min(left, Math.max(0, f.cash));
    f.cash -= fromCash;
    left -= fromCash;
    if (left > 0) left -= liquidate(f, left);
    s.finance.ytd.spend += amount - Math.max(0, left);
  }
  s.family.savings = Math.max(0, s.family.savings - Math.max(0, left));
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

/** Puts `amount` of cash into holdings by the target mix, paying buy costs. */
export function buyByTarget(f: Finance, amount: number) {
  const amt = Math.min(amount, Math.max(0, f.cash));
  if (amt <= 0) return;
  const total = ASSETS.reduce((a, k) => a + f.target[k], 0) || 100;
  f.cash -= amt;
  for (const k of ASSETS) f.holdings[k] += ((amt * f.target[k]) / total) * (1 - ASSET_INFO[k].cost);
}

/** Moves existing holdings to the target mix. Returns what the trades cost. */
export function rebalance(f: Finance): number {
  const total = invested(f);
  if (total <= 0) return 0;
  const tsum = ASSETS.reduce((a, k) => a + f.target[k], 0) || 100;
  let pool = 0;
  let cost = 0;
  for (const k of ASSETS) {
    const want = (total * f.target[k]) / tsum;
    if (f.holdings[k] > want) {
      const sell = f.holdings[k] - want;
      f.holdings[k] = want;
      pool += sell * (1 - ASSET_INFO[k].cost);
      cost += sell * ASSET_INFO[k].cost;
    }
  }
  const short = ASSETS.map((k) => ({ k, gap: Math.max(0, (total * f.target[k]) / tsum - f.holdings[k]) }));
  const gapSum = short.reduce((a, x) => a + x.gap, 0);
  for (const { k, gap } of short) {
    if (gapSum <= 0) break;
    const spendK = (pool * gap) / gapSum;
    f.holdings[k] += spendK * (1 - ASSET_INFO[k].cost);
    cost += spendK * ASSET_INFO[k].cost;
  }
  return cost;
}

/** Estimated cost of `rebalance` without changing anything. */
export function rebalanceCost(f: Finance): number {
  const copy: Finance = { ...f, holdings: { ...f.holdings } };
  return rebalance(copy);
}

/** Sells everything into cash. Returns what selling cost. */
export function cashOut(f: Finance): number {
  let cost = 0;
  for (const k of ASSETS) {
    cost += f.holdings[k] * ASSET_INFO[k].cost;
    f.cash += f.holdings[k] * (1 - ASSET_INFO[k].cost);
    f.holdings[k] = 0;
  }
  return cost;
}

/**
 * One month of the simulated market. Always draws six numbers, so the
 * market's path depends only on the seed, never on what the player owns.
 * A rare crash month hits stocks and crypto together.
 */
export function marketMonth(s: LifeState): Record<Asset, number> {
  const rng = rngOf(s.rng, "finance");
  const m = rng.normal(0, 1);
  const b = rng.normal(0, 1);
  const z = rng.normal(0, 1);
  const p = rng.normal(0, 1);
  const c = rng.normal(0, 1);
  const crash = rng.next() < 0.005 ? -0.15 : 0;
  const k = Math.sqrt(12);
  const A = ASSET_INFO;
  const idx = A.index.mean / 12 + (A.index.sd / k) * m + crash;
  const r: Record<Asset, number> = {
    savings: A.savings.mean / 12,
    bonds: A.bonds.mean / 12 + (A.bonds.sd / k) * (-0.2 * m + 0.98 * b),
    index: idx,
    stocks: A.stocks.mean / 12 + 1.15 * (idx - A.index.mean / 12) + (0.24 / k) * z,
    property: A.property.mean / 12 + (A.property.sd / k) * (0.3 * m + 0.95 * p),
    crypto: A.crypto.mean / 12 + (A.crypto.sd / k) * (0.3 * m + 0.95 * c) + 2 * crash,
  };
  for (const a of ASSETS) r[a] = Math.max(-0.6, r[a]);
  return r;
}

/** Monthly money step. The market moves every month, whether or not he owns anything. */
export function stepFinance(s: LifeState) {
  const f = s.finance;
  const { month, year } = calendar(s);
  if (f.ytd.year === 0) f.ytd.year = year;
  if (month === 1 && f.ytd.year < year) closeYear(s, year);
  const playing = s.placement.contract?.salary ?? 0;
  const job = s.after?.salary ?? 0;
  const endorse = f.endorsements.reduce((a, e) => a + e.perYear, 0);
  const grossYear = playing + job + endorse;
  let netMonth = 0;
  if (grossYear > 0) {
    const gross = grossYear / 12;
    const fees = f.agent ? (playing * f.agent.fee + endorse * 0.15) / 12 : 0;
    const where = s.after ? s.after.countryId : s.placement.countryId;
    const tax = (gross - fees) * taxRate(where, grossYear);
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
      f.cash += liquidate(f, -f.cash);
      if (f.cash < 0) {
        f.cash = 0;
        s.flags.broke = s.ageMonths;
      }
    }
  }
  const r = marketMonth(s);
  let ret = 0;
  for (const a of ASSETS) {
    const d = f.holdings[a] * r[a];
    f.holdings[a] = Math.max(0, f.holdings[a] + d);
    ret += d;
    f.market.ytd[a] *= 1 + r[a];
  }
  f.market.recent.push(r.index);
  if (f.market.recent.length > 12) f.market.recent.shift();
  if (f.advisor) {
    const fee = (invested(f) * ADVISOR[f.advisor].fee) / 12;
    if (fee > 0) {
      liquidate(f, fee);
      f.ytd.fees += fee;
    }
  }
  f.ytd.returns += ret;
  if (f.autoInvest || f.advisor) {
    const reserve = monthlySpend(s, 0) * 6;
    if (f.cash > reserve + 500) buyByTarget(f, f.cash - reserve);
  }
}

/** Index return over the last 12 months (compounded). */
export function trailingIndex(f: Finance): number {
  return f.market.recent.reduce((a, r) => a * (1 + r), 1) - 1;
}

function closeYear(s: LifeState, year: number) {
  const f = s.finance;
  const y = f.ytd;
  if (y.gross > 0 || y.spend > 0 || y.returns !== 0) {
    f.years.push({ ...y, gross: Math.round(y.gross), tax: Math.round(y.tax), fees: Math.round(y.fees), spend: Math.round(y.spend), returns: Math.round(y.returns), netWorth: netWorth(f) });
    if (f.years.length > 24) f.years.shift();
  }
  if (y.year > 0) {
    const r = mix({});
    for (const a of ASSETS) r[a] = Math.round((f.market.ytd[a] - 1) * 1000) / 1000;
    f.market.years.push({ year: y.year, r });
    if (f.market.years.length > 40) f.market.years.shift();
  }
  f.market.ytd = ones();
  f.ytd = { year, gross: 0, tax: 0, fees: 0, spend: 0, returns: 0 };
  for (const e of f.endorsements) e.yearsLeft -= 1;
  f.endorsements = f.endorsements.filter((e) => e.yearsLeft > 0);
}

/** Player actions on the portfolio. None of them draw randomness. */
export type MoneyAction = { type: "target"; target: Record<Asset, number> } | { type: "auto"; on: boolean } | { type: "rebalance" } | { type: "cashout" } | { type: "invest" };

export function applyMoney(s: LifeState, a: MoneyAction): string | null {
  const f = s.finance;
  switch (a.type) {
    case "target": {
      const t = mix({});
      for (const k of ASSETS) t[k] = clamp(Math.round(a.target[k] ?? 0), 0, 100);
      const sum = ASSETS.reduce((x, k) => x + t[k], 0);
      if (sum !== 100) return "The mix has to add up to 100%.";
      f.target = t;
      if (f.advisor) {
        f.advisor = null;
        return "You take over from your manager. No more management fees.";
      }
      return null;
    }
    case "auto":
      f.autoInvest = a.on;
      return null;
    case "rebalance": {
      const c = rebalance(f);
      f.ytd.fees += c;
      return null;
    }
    case "invest": {
      const reserve = monthlySpend(s, 0) * 3;
      buyByTarget(f, f.cash - reserve);
      return null;
    }
    case "cashout": {
      const c = cashOut(f);
      f.ytd.fees += c;
      f.autoInvest = false;
      f.advisor = null;
      return null;
    }
  }
}
