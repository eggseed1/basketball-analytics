"use client";

import { useMemo, useState } from "react";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { displayImpact, userPlayers, userTeam } from "@/gm/lib/selectors";
import type { GmTradeAsset } from "@/gm/types";
import { evaluateTrade } from "@/gm/engine/trades";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

export default function GmTradePage() {
  return (
    <GmShell>
      <TradeBody />
    </GmShell>
  );
}

function TradeBody() {
  const league = useGmStore((s) => s.league);
  const proposeTrade = useGmStore((s) => s.proposeTrade);
  const [partnerId, setPartnerId] = useState("nyk");
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const myPlayers = useMemo(
    () => (league ? userPlayers(league) : []),
    [league]
  );
  const theirPlayers = useMemo(
    () =>
      league
        ? league.players
            .filter((p) => p.teamId === partnerId)
            .sort((a, b) => b.ratings.impact - a.ratings.impact)
        : [],
    [league, partnerId]
  );

  if (!league) return null;
  const team = userTeam(league);

  const fromAssets: GmTradeAsset[] = give.map((id) => ({
    type: "player",
    id,
  }));
  const toAssets: GmTradeAsset[] = get.map((id) => ({ type: "player", id }));
  const preview = evaluateTrade(
    league,
    league.userTeamId,
    partnerId,
    fromAssets,
    toAssets
  );

  const toggle = (
    id: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Trade machine</h2>
      <label className="flex max-w-xs flex-col gap-1 text-sm">
        Partner
        <select
          className="rounded-md border border-border bg-background px-2 py-2"
          value={partnerId}
          onChange={(e) => {
            setPartnerId(e.target.value);
            setGet([]);
          }}
        >
          {league.teams
            .filter((t) => t.id !== team.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.abbr} - {t.city} ({t.ownerGoal})
              </option>
            ))}
        </select>
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <AssetList
          title={`You send (${team.abbr})`}
          players={myPlayers}
          selected={give}
          onToggle={(id) => toggle(id, give, setGive)}
        />
        <AssetList
          title="You receive"
          players={theirPlayers}
          selected={get}
          onToggle={(id) => toggle(id, get, setGet)}
        />
      </div>

      <div className="rounded-xl border border-border p-3 text-sm">
        <p>
          Value you give: {formatNumber(preview.fromValue, 1)} · Value you get:{" "}
          {formatNumber(preview.toValue, 1)}
        </p>
        <p className="text-muted-foreground">
          {preview.ok
            ? "Partner AI would accept this package."
            : preview.reason}
        </p>
      </div>

      <Button
        disabled={!give.length && !get.length}
        onClick={() => {
          const res = proposeTrade(partnerId, fromAssets, toAssets);
          setMessage(res.ok ? "Trade accepted." : res.reason ?? "Rejected");
          if (res.ok) {
            setGive([]);
            setGet([]);
          }
        }}
      >
        Propose trade
      </Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

function AssetList({
  title,
  players,
  selected,
  onToggle,
}: {
  title: string;
  players: ReturnType<typeof userPlayers>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-3 py-2 font-medium">{title}</p>
      <ul className="max-h-80 overflow-y-auto divide-y divide-border">
        {players.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => onToggle(p.id)}
              />
              <span className="flex-1">
                {p.name} · {p.position} · {displayImpact(p)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                ${p.contract?.annualSalaryM.toFixed(1) ?? "-"}M
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
