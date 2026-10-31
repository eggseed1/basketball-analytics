"use client";

import { useState } from "react";

import {
  ADVISOR,
  ASSET_INFO,
  ASSETS,
  cashReserve,
  income,
  indexSpark,
  invested,
  LIFESTYLE,
  monthlySpend,
  netWorth,
  PRESETS,
  REGIME_LABEL,
  rebalanceCost,
  taxRate,
  unrealized,
  unrealizedTotal,
  type MoneyAction,
} from "@/one-shot/finance";
import type { Asset, LifeState } from "@/one-shot/types";

import { Btn, Kv, money, Panel, Segmented } from "./ui";

const pctText = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const tone = (v: number) => (v > 0.0005 ? "text-[var(--os-green)]" : v < -0.0005 ? "text-[var(--os-rose)]" : "text-[var(--os-dim)]");

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.01);
  const w = 120;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <polyline fill="none" stroke={up ? "var(--os-green)" : "var(--os-rose)"} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

export function MoneyPanel({ life, onMoney }: { life: LifeState; onMoney: (a: MoneyAction) => void }) {
  const f = life.finance;
  const [draft, setDraft] = useState<Record<Asset, number> | null>(null);
  const [tradeAsset, setTradeAsset] = useState<Asset>("index");
  const [tradeAmt, setTradeAmt] = useState("");
  const pay = income(life);
  const endorse = f.endorsements.reduce((a, e) => a + e.perYear, 0);
  const total = invested(f);
  const show = life.ageMonths >= 16 * 12 && (pay > 0 || f.cash > 0 || total > 0 || f.agent !== null || life.earnings > 0);
  if (!show) return null;
  const target = draft ?? f.target;
  const sum = ASSETS.reduce((a, k) => a + target[k], 0);
  const reserve = cashReserve(life);
  const cost = rebalanceCost(f);
  const lastMarket = f.market.years.at(-1);
  const lastYear = f.years.at(-1);
  const where = life.after?.countryId ?? life.placement.countryId;
  const gain = unrealizedTotal(f);
  const spark = indexSpark(f);
  const regime = f.market.regime ?? "neutral";
  const step = (k: Asset, d: number) => setDraft({ ...target, [k]: Math.max(0, Math.min(100, target[k] + d)) });
  const amt = Math.round(Number(tradeAmt) || 0);
  return (
    <Panel id="os-money" title="Money" action={<span className="font-mono text-[11.5px] tabular-nums">{money(netWorth(f))} net worth</span>}>
      <dl>
        {life.placement.contract ? (
          <Kv
            k="Contract"
            v={`${money(life.placement.contract.salary)}/yr · ${life.placement.contract.yearsLeft} yr${life.placement.contract.yearsLeft === 1 ? "" : "s"}${life.placement.contract.guaranteed ? "" : " · non-guaranteed"}`}
            mono
          />
        ) : null}
        {life.after ? <Kv k="Job" v={`${money(life.after.salary)}/yr`} mono /> : null}
        {endorse > 0 ? <Kv k="Endorsements and side income" v={`${money(endorse)}/yr`} mono /> : null}
        {life.placement.contract || f.agent ? <Kv k="Agent" v={f.agent ? `${f.agent.name} · ${Math.round(f.agent.fee * 100)}%` : "None"} /> : null}
        {pay + endorse > 0 ? <Kv k="Tax (model)" v={`about ${Math.round(taxRate(where, pay + endorse) * 100)}%`} mono /> : null}
        <Kv k="Lifestyle" v={`${LIFESTYLE[f.lifestyle].label} · ${money(monthlySpend(life, 0))}+/mo`} />
        <Kv k="Sends home" v={`${Math.round(f.sendHomeShare * 100)}% of take-home`} mono />
        <Kv k="Cash" v={money(f.cash)} mono />
        {life.earnings > 0 ? <Kv k="Career earnings, pre-tax" v={money(life.earnings)} mono /> : null}
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--os-border)] pt-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">{REGIME_LABEL[regime]}</p>
          <p className="mt-0.5 text-[12px] text-[var(--os-text)]/90">{f.market.headline ?? "Markets open quietly."}</p>
        </div>
        <Sparkline values={spark} />
      </div>

      <h3 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">
        Portfolio · {money(total)}
        {total > 0 ? (
          <span className={`ml-2 font-mono font-normal normal-case tracking-normal ${tone(gain)}`}>
            {gain >= 0 ? "+" : "−"}
            {gain >= 0 ? "+" : ""}
            {money(gain)} open
          </span>
        ) : null}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse whitespace-nowrap text-[12px] tabular-nums">
          <thead className="text-[var(--os-dim)]">
            <tr className="text-right font-mono text-[10.5px] [&>th]:px-1 [&>th]:py-1 [&>th]:font-normal">
              <th className="text-left">Asset</th>
              <th>Value</th>
              <th title="Unrealized gain or loss vs what you paid">P/L</th>
              <th>Now</th>
              <th className="text-center">Target</th>
              <th title="Price change so far this year">YTD</th>
            </tr>
          </thead>
          <tbody>
            {ASSETS.map((k) => {
              const info = ASSET_INFO[k];
              const ytd = f.market.ytd[k] - 1;
              const pl = unrealized(f, k);
              return (
                <tr key={k} className="border-t border-[var(--os-border)]/50 text-right [&>td]:px-1 [&>td]:py-1">
                  <td className="text-left" title={`${info.detail} Yield about ${(info.yield * 100).toFixed(1)}%/yr.`}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: info.color }} aria-hidden />
                    {info.short}
                  </td>
                  <td className="font-mono">{money(f.holdings[k])}</td>
                  <td className={`font-mono ${f.holdings[k] > 0 ? tone(pl) : "text-[var(--os-dim)]"}`}>{f.holdings[k] > 0 ? money(pl) : "—"}</td>
                  <td className="font-mono text-[var(--os-dim)]">{total > 0 ? `${Math.round((f.holdings[k] / total) * 100)}%` : "—"}</td>
                  <td>
                    <span className="inline-flex items-center gap-0.5">
                      <button type="button" aria-label={`Less ${info.short}`} onClick={() => step(k, -5)} className="h-6 w-5 rounded-lg border border-[var(--os-border)] font-mono text-[12px] text-[var(--os-dim)] hover:text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]">
                        −
                      </button>
                      <span className="w-8 text-center font-mono">{target[k]}%</span>
                      <button type="button" aria-label={`More ${info.short}`} onClick={() => step(k, 5)} className="h-6 w-5 rounded-lg border border-[var(--os-border)] font-mono text-[12px] text-[var(--os-dim)] hover:text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]">
                        +
                      </button>
                    </span>
                  </td>
                  <td className={`font-mono ${tone(ytd)}`}>{info.sd === 0 && ytd === 0 ? "—" : pctText(ytd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Preset mixes">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setDraft({ ...p.target })}
            className="rounded-lg border border-[var(--os-border)] px-2 py-0.5 font-mono text-[11px] text-[var(--os-dim)] hover:text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]"
          >
            {p.label}
          </button>
        ))}
      </div>
      {draft ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
          <span className={`font-mono tabular-nums ${sum === 100 ? "text-[var(--os-dim)]" : "text-[var(--os-rose)]"}`}>Total {sum}%</span>
          <Btn
            variant="primary"
            className="min-h-8 px-2.5 text-[12px]"
            disabled={sum !== 100}
            title={sum === 100 ? undefined : "The mix has to add up to 100%."}
            onClick={() => {
              onMoney({ type: "target", target: draft });
              setDraft(null);
            }}
          >
            Save mix
          </Btn>
          <Btn variant="quiet" className="min-h-8 px-2 text-[12px]" onClick={() => setDraft(null)}>
            Cancel
          </Btn>
        </div>
      ) : null}
      {f.advisor ? (
        <p className="mt-2 text-[11.5px] text-[var(--os-dim)]">
          {ADVISOR[f.advisor].label} picks this mix{ADVISOR[f.advisor].fee >= 0.005 ? ` for ${ADVISOR[f.advisor].fee * 100}% a year` : ""}. Saving your own mix lets them go.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--os-dim)]">
          Invest spare cash every month
          <Segmented<"on" | "off">
            label="Invest spare cash every month"
            value={f.autoInvest || f.advisor ? "on" : "off"}
            onChange={(v) => onMoney({ type: "auto", on: v === "on" })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off", disabled: f.advisor !== null, hint: f.advisor ? "Your manager invests spare cash." : undefined },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--os-dim)]">
          Cash buffer
          <Segmented<number>
            label="Cash buffer months"
            value={f.reserveMonths ?? 6}
            onChange={(months) => onMoney({ type: "reserve", months })}
            options={[
              { value: 3, label: "3 mo" },
              { value: 6, label: "6 mo" },
              { value: 12, label: "12 mo" },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Btn className="min-h-8 px-2.5 text-[12px]" disabled={f.cash <= reserve + 500} title={`Keeps about ${money(reserve)} in cash`} onClick={() => onMoney({ type: "invest" })}>
            Invest cash now
          </Btn>
          <Btn className="min-h-8 px-2.5 text-[12px]" disabled={total <= 0} onClick={() => onMoney({ type: "rebalance" })}>
            Rebalance{cost >= 1 ? ` · costs ${money(cost)}` : ""}
          </Btn>
          <Btn variant="quiet" className="min-h-8 px-2 text-[12px]" disabled={total <= 0} onClick={() => onMoney({ type: "cashout" })}>
            Sell everything
          </Btn>
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--os-border)]/60 pt-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">Trade one asset</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Asset to trade"
            value={tradeAsset}
            onChange={(e) => setTradeAsset(e.target.value as Asset)}
            className="min-h-8 rounded-lg border border-[var(--os-border)] bg-[var(--os-page)] px-2 text-[12px] text-[var(--os-text)]"
          >
            {ASSETS.map((k) => (
              <option key={k} value={k}>
                {ASSET_INFO[k].short}
              </option>
            ))}
          </select>
          <input
            aria-label="Trade amount in dollars"
            inputMode="numeric"
            placeholder="Amount"
            value={tradeAmt}
            onChange={(e) => setTradeAmt(e.target.value.replace(/[^\d]/g, ""))}
            className="min-h-8 w-24 rounded-lg border border-[var(--os-border)] bg-[var(--os-page)] px-2 font-mono text-[12px] text-[var(--os-text)]"
          <Btn
            className="min-h-8 px-2.5 text-[12px]"
            disabled={amt < 100 || amt > f.cash}
            onClick={() => {
              onMoney({ type: "buy", asset: tradeAsset, amount: amt });
              setTradeAmt("");
            }}
          >
            Buy
          </Btn>
          <Btn
            className="min-h-8 px-2.5 text-[12px]"
            disabled={amt < 100 || amt > f.holdings[tradeAsset]}
            onClick={() => {
              onMoney({ type: "sell", asset: tradeAsset, amount: amt });
              setTradeAmt("");
            }}
          >
          <Btn className="min-h-8 px-2.5 text-[12px]" disabled={amt < 100 || amt > f.holdings[tradeAsset]} onClick={() => onMoney({ type: "sell", asset: tradeAsset, amount: amt })}>
            Sell
          </Btn>
        </div>
      </div>

      {lastMarket ? (
        <p className="mt-3 font-mono text-[11px] tabular-nums text-[var(--os-dim)]">
          {lastMarket.year} prices:{" "}
          {(["index", "bonds", "stocks", "property", "crypto"] as Asset[]).map((k, i) => (
            <span key={k}>
              {i ? " · " : ""}
              {ASSET_INFO[k].short} <span className={tone(lastMarket.r[k])}>{pctText(lastMarket.r[k])}</span>
            </span>
          ))}
        </p>
      ) : null}
      {lastYear ? (
        <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--os-dim)]">
          {lastYear.year}: earned {money(lastYear.gross)}, tax {money(lastYear.tax)}, fees {money(lastYear.fees)}, spent {money(lastYear.spend)}, price {money(lastYear.returns)}
          {lastYear.dividends ? `, yield ${money(lastYear.dividends)}` : ""}
        </p>
      ) : null}
      {(f.ytd.dividends ?? 0) > 0 ? (
        <p className="mt-1 font-mono text-[11px] tabular-nums text-[var(--os-dim)]">This year so far: dividends and rent {money(f.ytd.dividends)}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-[var(--os-dim)]">Toy market with bull and bear stretches, dividends, and rent. Not real prices or advice. Hover an asset for what it is.</p>
    </Panel>
  );
}
