"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { playerById, teamById } from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmLeagueState, GmTradeAsset } from "@/gm/types";
import { formatNumber } from "@/lib/format";

export default function GmTransactionsPage() {
  return (
    <GmShell>
      <TransactionsBody />
    </GmShell>
  );
}

function assetLabel(league: GmLeagueState, asset: GmTradeAsset): string {
  if (asset.type === "cash") {
    return asset.cashM != null ? `$${formatNumber(asset.cashM, 1)}M` : "Cash";
  }
  if (asset.type === "pick") return asset.id;
  return playerById(league, asset.id)?.name ?? "Player";
}

function TransactionsBody() {
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  const trades = [...league.tradeLog].reverse();
  const wires = league.news.filter(
    (item) =>
      item.tone === "trade" || /sign|waiv|renounc|trade/i.test(item.headline)
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Transactions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Trades you have offered, and the wire for signings and deals around the league.
        </p>
      </div>
      <section className="sports-card p-4">
        <h3 className="font-semibold">Trade machine</h3>
        {trades.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No offers yet this save.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {trades.map((trade) => {
              const from = teamById(league, trade.fromTeamId);
              const to = teamById(league, trade.toTeamId);
              return (
                <li key={trade.id} className="text-sm">
                  <p className="font-medium">
                    {from?.abbr ?? "Team"} sends {to?.abbr ?? "Team"} · {trade.status}
                  </p>
                  <p className="text-muted-foreground">
                    {trade.fromAssets.map((asset) => assetLabel(league, asset)).join(", ") || "Nothing"}
                    {" for "}
                    {trade.toAssets.map((asset) => assetLabel(league, asset)).join(", ") || "nothing"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="sports-card p-4">
        <h3 className="font-semibold">Wire</h3>
        {wires.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Signings and trades land here once the league starts moving.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {wires.map((item) => (
              <li key={item.id} className="text-sm">
                <p className="font-medium">{item.headline}</p>
                <p className="text-muted-foreground">
                  Day {item.day}. {item.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
