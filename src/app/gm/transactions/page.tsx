"use client";

import { useTranslations } from "next-intl";

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

type GmT = ReturnType<typeof useTranslations<"GmUi">>;

function assetLabel(league: GmLeagueState, asset: GmTradeAsset, t: GmT): string {
  if (asset.type === "cash") {
    return asset.cashM != null ? `$${formatNumber(asset.cashM, 1)}M` : t("txCash");
  }
  if (asset.type === "pick") return asset.id;
  return playerById(league, asset.id)?.name ?? t("txPlayer");
}

function TransactionsBody() {
  const t = useTranslations("GmUi");
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
        <h2 className="text-xl font-bold tracking-tight">{t("pageTransactionsTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageTransactionsBlurb")}</p>
      </div>
      <section className="sports-card p-4">
        <h3 className="font-semibold">{t("txTradeMachine")}</h3>
        {trades.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("txNoOffers")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {trades.map((trade) => {
              const from = teamById(league, trade.fromTeamId);
              const to = teamById(league, trade.toTeamId);
              return (
                <li key={trade.id} className="text-sm">
                  <p className="font-medium">
                    {t("txSends", {
                      from: from?.abbr ?? t("txTeam"),
                      to: to?.abbr ?? t("txTeam"),
                      status: trade.status,
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {t("txTradeLine", {
                      give:
                        trade.fromAssets.map((asset) => assetLabel(league, asset, t)).join(", ") ||
                        t("txNothingCap"),
                      get:
                        trade.toAssets.map((asset) => assetLabel(league, asset, t)).join(", ") ||
                        t("txNothing"),
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="sports-card p-4">
        <h3 className="font-semibold">{t("txWire")}</h3>
        {wires.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("txWireEmpty")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {wires.map((item) => (
              <li key={item.id} className="text-sm">
                <p className="font-medium">{item.headline}</p>
                <p className="text-muted-foreground">
                  {t("txWireDay", { day: item.day, body: item.body })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
