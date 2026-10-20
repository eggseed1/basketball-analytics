"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { offerIsFair } from "@/gm/engine/offers";
import { formatNumber } from "@/lib/format";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmLeagueState, GmTradeAsset } from "@/gm/types";

function assetLabel(league: GmLeagueState, asset: GmTradeAsset): string {
  if (asset.type === "player") {
    return league.players.find((player) => player.id === asset.id)?.name ?? "Player";
  }
  if (asset.type === "pick") {
    const pick = league.teams
      .flatMap((team) => team.draftPicks)
      .find((entry) => entry.id === asset.id);
    if (!pick) return "Pick";
    const prot = pick.protectionTopN ? ` top ${pick.protectionTopN}` : "";
    return `${pick.season} ${pick.round === 1 ? "1st" : "2nd"}${prot}`;
  }
  return `$${formatNumber(asset.cashM ?? 0, 1)}M cash`;
}

function assetList(league: GmLeagueState, assets: GmTradeAsset[]): string {
  if (!assets.length) return "nothing";
  return assets.map((asset) => assetLabel(league, asset)).join(", ");
}

/** Compact accept / decline for an incoming call. Full edit stays on Trade. */
export function GmIncomingOfferBanner() {
  const league = useGmStore((s) => s.league);
  const acceptIncomingOffer = useGmStore((s) => s.acceptIncomingOffer);
  const declineIncomingOffer = useGmStore((s) => s.declineIncomingOffer);
  const [message, setMessage] = useState<string | null>(null);

  if (!league?.incomingOffer) return null;
  const offer = league.incomingOffer;
  const caller =
    league.teams.find((team) => team.id === offer.fromTeamId)?.city ?? "A team";
  const fair = offerIsFair(
    league,
    offer.fromTeamId,
    offer.toTeamId,
    offer.fromAssets,
    offer.toAssets
  );

  return (
    <section className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {caller} sent a trade offer
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{offer.note}</p>
          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <p>
              <span className="font-semibold">You get </span>
              {assetList(league, offer.fromAssets)}
            </p>
            <p>
              <span className="font-semibold">You send </span>
              {assetList(league, offer.toAssets)}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {fair.ok
              ? "They will do this deal as written."
              : fair.reason}
            {" "}
            The sim stays paused until you answer.
          </p>
          {message ? <p className="mt-1 text-sm">{message}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!fair.ok}
            onClick={() => {
              const result = acceptIncomingOffer(offer.fromAssets, offer.toAssets);
              setMessage(result.ok ? null : result.reason ?? "Could not complete the trade.");
            }}
          >
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => declineIncomingOffer()}>
            Decline
          </Button>
          <Link
            href="/gm/trade"
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary"
          >
            Change deal
          </Link>
        </div>
      </div>
    </section>
  );
}
