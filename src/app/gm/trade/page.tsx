"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { displayOverall, userPlayers, userTeam } from "@/gm/lib/selectors";
import type { GmDraftPick, GmLeagueState, GmPlayer, GmTradeAsset } from "@/gm/types";
import {
  cashLimitM,
  evaluateTrade,
  findPlayerPackages,
  teamCashM,
  type PlayerPackage,
} from "@/gm/engine/trades";
import { Button } from "@/components/ui/button";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { formatNumber } from "@/lib/format";
import { StarValue } from "@/gm/ui/star-value";
import { contractSurplusM, pickStars, playerStars, projectedSlot, stanceLabel, stanceNote, tradeStance } from "@/gm/engine/value";
import { offerIsFair } from "@/gm/engine/offers";

export default function GmTradePage() {
  return (
    <GmShell>
      <TradeBody />
    </GmShell>
  );
}

function Surplus({ player }: { player: GmPlayer }) {
  const surplus = contractSurplusM(player);
  if (surplus == null) return null;
  const over = surplus < -0.5;
  const under = surplus > 0.5;
  const label = over ? `${Math.abs(surplus).toFixed(1)}M over` : under ? `${surplus.toFixed(1)}M under` : "even";
  return <span className="tabular-nums text-xs text-muted-foreground">{label}</span>;
}

function hasAsset(list: GmTradeAsset[], id: string) {
  return list.some((asset) => asset.id === id);
}

function toggleAsset(
  list: GmTradeAsset[],
  asset: GmTradeAsset
): GmTradeAsset[] {
  return hasAsset(list, asset.id)
    ? list.filter((item) => item.id !== asset.id)
    : [...list, asset];
}

function assetNames(league: GmLeagueState, assets: GmTradeAsset[]): string {
  return assets
    .map((asset) => {
      if (asset.type === "player") {
        return league.players.find((player) => player.id === asset.id)?.name ?? "Player";
      }
      if (asset.type === "pick") {
        const pick = league.teams.flatMap((team) => team.draftPicks).find((entry) => entry.id === asset.id);
        return pick ? pickLabel(pick) : "Pick";
      }
      return `$${formatNumber(asset.cashM ?? 0, 1)}M`;
    })
    .join(", ");
}

function pickLabel(pick: GmDraftPick) {
  const prot = pick.protectionTopN ? ` top ${pick.protectionTopN}` : "";
  return `${pick.season} ${pick.round === 1 ? "1st" : "2nd"}${prot}`;
}

function IncomingOffer({
  league,
  onAccept,
  onDecline,
}: {
  league: GmLeagueState;
  onAccept: (fromAssets: GmTradeAsset[], toAssets: GmTradeAsset[]) => { ok: boolean; reason?: string };
  onDecline: () => void;
}) {
  const offer = league.incomingOffer;
  if (!offer) return null;
  return <OfferEditor key={offer.id} league={league} onAccept={onAccept} onDecline={onDecline} />;
}

function OfferEditor({
  league,
  onAccept,
  onDecline,
}: {
  league: GmLeagueState;
  onAccept: (fromAssets: GmTradeAsset[], toAssets: GmTradeAsset[]) => { ok: boolean; reason?: string };
  onDecline: () => void;
}) {
  const offer = league.incomingOffer!;
  const caller = league.teams.find((team) => team.id === offer.fromTeamId);
  const [receive, setReceive] = useState<GmTradeAsset[]>(offer.fromAssets);
  const [send, setSend] = useState<GmTradeAsset[]>(offer.toAssets);
  const [message, setMessage] = useState<string | null>(null);
  const fair = offerIsFair(league, offer.fromTeamId, offer.toTeamId, receive, send);
  const mine = league.players.filter((player) => player.teamId === league.userTeamId && player.contract);
  const theirs = league.players.filter((player) => player.teamId === offer.fromTeamId && player.contract);
  const myPicks = league.teams.find((team) => team.id === league.userTeamId)?.draftPicks ?? [];
  const theirPicks = caller?.draftPicks ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <header>
        <h2 className="text-lg font-semibold">{caller?.city ?? "A team"} called</h2>
        <p className="text-sm text-muted-foreground">
          {offer.note} Add or remove pieces, then answer. The sim stays paused until you do.
        </p>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        <OfferSide
          title="You receive"
          players={theirs}
          picks={theirPicks}
          league={league}
          selected={receive}
          onToggle={(asset) => setReceive(toggleAsset(receive, asset))}
        />
        <OfferSide
          title="You send"
          players={mine}
          picks={myPicks}
          league={league}
          selected={send}
          onToggle={(asset) => setSend(toggleAsset(send, asset))}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {fair.ok ? "They will do this deal." : fair.reason}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!fair.ok}
          onClick={() => {
            const result = onAccept(receive, send);
            setMessage(result.ok ? "Trade accepted." : result.reason ?? "Rejected");
          }}
        >
          Accept
        </Button>
        <Button variant="outline" onClick={onDecline}>
          Decline
        </Button>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </section>
  );
}

function OfferSide({
  title,
  players,
  picks,
  league,
  selected,
  onToggle,
}: {
  title: string;
  players: GmPlayer[];
  picks: GmDraftPick[];
  league: GmLeagueState;
  selected: GmTradeAsset[];
  onToggle: (asset: GmTradeAsset) => void;
}) {
  const shownPlayers = players
    .filter((player) => playerStars(player) >= 1.5 || hasAsset(selected, player.id))
    .sort((a, b) => playerStars(b) - playerStars(a))
    .slice(0, 12);
  return (
    <div className="rounded-lg border border-border">
      <p className="border-b border-border px-3 py-2 text-sm font-medium">{title}</p>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto">
        {shownPlayers.map((player) => (
          <li key={player.id}>
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={hasAsset(selected, player.id)}
                onChange={() => onToggle({ type: "player", id: player.id })}
              />
              <span className="min-w-0 flex-1 truncate">{player.name}</span>
              <StarValue stars={playerStars(player)} />
            </label>
          </li>
        ))}
        {picks.map((pick) => (
          <li key={pick.id}>
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={hasAsset(selected, pick.id)}
                onChange={() => onToggle({ type: "pick", id: pick.id })}
              />
              <span className="min-w-0 flex-1">
                {pickLabel(pick)}
                <span className="ml-1 text-xs text-muted-foreground">about pick {projectedSlot(league, pick)}</span>
              </span>
              <StarValue stars={pickStars(league, pick)} />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TradeBody() {
  const league = useGmStore((s) => s.league);
  const proposeTrade = useGmStore((s) => s.proposeTrade);
  const acceptIncomingOffer = useGmStore((s) => s.acceptIncomingOffer);
  const declineIncomingOffer = useGmStore((s) => s.declineIncomingOffer);
  const setTradeStatus = useGmStore((s) => s.setTradeStatus);
  const setPickProtection = useGmStore((s) => s.setPickProtection);
  const [partnerId, setPartnerId] = useState("nyk");
  const [give, setGive] = useState<GmTradeAsset[]>([]);
  const [get, setGet] = useState<GmTradeAsset[]>([]);
  const [cashSend, setCashSend] = useState(0);
  const [cashReceive, setCashReceive] = useState(0);
  const [packages, setPackages] = useState<PlayerPackage[] | null>(null);
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
            .sort((a, b) => Number(displayOverall(b)) - Number(displayOverall(a)))
        : [],
    [league, partnerId]
  );

  if (!league) return null;
  const team = userTeam(league);
  const partner = league.teams.find((t) => t.id === partnerId) ?? team;
  const limit = cashLimitM(league.settings);
  const available = teamCashM(team, league.settings);

  const fromAssets: GmTradeAsset[] = [
    ...give.filter((asset) => asset.type !== "cash"),
    ...(cashSend > 0
      ? [{ type: "cash" as const, id: "cash-out", cashM: cashSend }]
      : []),
  ];
  const toAssets: GmTradeAsset[] = [
    ...get.filter((asset) => asset.type !== "cash"),
    ...(cashReceive > 0
      ? [{ type: "cash" as const, id: "cash-in", cashM: cashReceive }]
      : []),
  ];
  const preview = evaluateTrade(
    league,
    league.userTeamId,
    partnerId,
    fromAssets,
    toAssets
  );

  return (
    <div className="flex flex-col gap-4">
      {league.incomingOffer ? (
        <IncomingOffer
          league={league}
          onAccept={acceptIncomingOffer}
          onDecline={declineIncomingOffer}
        />
      ) : null}
      <h2 className="text-lg font-semibold">Trade machine</h2>
      <p className="text-sm text-muted-foreground">
        Picks can be protected. Cash is capped at ${formatNumber(limit, 1)}M
        and you have ${formatNumber(available, 1)}M left. Untouchables cannot
        move. Two consecutive years without a first is refused.
      </p>
      <label className="flex max-w-xs flex-col gap-1 text-sm">
        Partner
        <select
          className="rounded-md border border-border bg-background px-2 py-2"
          value={partnerId}
          onChange={(e) => {
            setPartnerId(e.target.value);
            setGet([]);
            setCashReceive(0);
            setPackages(null);
          }}
        >
          {league.teams
            .filter((t) => t.id !== team.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.abbr} - {t.city} ({stanceLabel(tradeStance(league, t.id))})
              </option>
            ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">
        {stanceNote(partner.city, tradeStance(league, partner.id))} You are{" "}
        {stanceLabel(tradeStance(league, team.id))}.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <PlayerList
            title={`You send (${team.abbr})`}
            players={myPlayers}
            selected={give}
            onToggle={(player) =>
              setGive(toggleAsset(give, { type: "player", id: player.id }))
            }
            statusOf={(player) =>
              (team.untouchables ?? []).includes(player.id)
                ? "untouchable"
                : (team.tradeBlock ?? []).includes(player.id)
                  ? "block"
                  : "open"
            }
            onStatus={(player, status) => setTradeStatus(player.id, status)}
          />
          <PickList
            title="Your picks"
            picks={team.draftPicks}
            selected={give}
            league={league}
            onToggle={(pick) =>
              setGive(toggleAsset(give, { type: "pick", id: pick.id }))
            }
            onProtect={(pick, topN) => setPickProtection(pick.id, topN)}
          />
          <label className="flex items-center gap-2 text-sm">
            Cash you send ($M)
            <input
              type="number"
              min={0}
              max={available}
              step={0.5}
              value={cashSend}
              onChange={(event) => setCashSend(Number(event.target.value))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1"
            />
          </label>
        </div>
        <div className="gm-club-panel flex flex-col gap-3" style={teamColorStyle(partner.id)}>
          <PlayerList
            title={
              <>
                You receive from <ClubMark teamId={partner.id} label={partner.abbr} />
              </>
            }
            players={theirPlayers}
            selected={get}
            onToggle={(player) =>
              setGet(toggleAsset(get, { type: "player", id: player.id }))
            }
          />
          <PickList
            title={`${partner.abbr} picks`}
            picks={partner.draftPicks}
            selected={get}
            league={league}
            onToggle={(pick) =>
              setGet(toggleAsset(get, { type: "pick", id: pick.id }))
            }
          />
          <label className="flex items-center gap-2 text-sm">
            Cash they send ($M)
            <input
              type="number"
              min={0}
              max={cashLimitM(league.settings)}
              step={0.5}
              value={cashReceive}
              onChange={(event) => setCashReceive(Number(event.target.value))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1"
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-border p-3 text-sm">
        <p>
          On {partner.abbr}&apos;s board, you send {formatNumber(preview.fromValue, 1)} and they
          send {formatNumber(preview.toValue, 1)}.
        </p>
        <p className="text-muted-foreground">
          {fromAssets.length === 0 && toAssets.length === 0
            ? "Add players, picks, or cash."
            : preview.ok
              ? "Partner would accept this package."
              : preview.reason}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!fromAssets.length && !toAssets.length}
          onClick={() => {
            const res = proposeTrade(partnerId, fromAssets, toAssets);
            setMessage(res.ok ? "Trade accepted." : res.reason ?? "Rejected");
            if (res.ok) {
              setGive([]);
              setGet([]);
              setCashSend(0);
              setCashReceive(0);
              setPackages(null);
            }
          }}
        >
          Propose trade
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const mine = give.filter((asset) => asset.type === "player");
            const theirs = get.filter((asset) => asset.type === "player");
            if (mine.length + theirs.length !== 1) {
              setPackages(null);
              setMessage("Check one player, on your club or theirs.");
              return;
            }
            const target = (mine[0] ?? theirs[0])!;
            const found = findPlayerPackages(league, league.userTeamId, target.id);
            setPackages(found);
            setMessage(found.length === 0 ? "No package works for them." : null);
          }}
        >
          Find a package
        </Button>
      </div>
      {packages && packages.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {packages.map((pack) => {
            const abbr = league.teams.find((entry) => entry.id === pack.partnerId)?.abbr ?? pack.partnerId;
            return (
              <li key={`${pack.partnerId}-${pack.youSend.map((asset) => asset.id).join("-")}-${pack.youReceive.map((asset) => asset.id).join("-")}`}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setPartnerId(pack.partnerId);
                    setGive(pack.youSend.filter((asset) => asset.type !== "cash"));
                    setGet(pack.youReceive.filter((asset) => asset.type !== "cash"));
                    setCashSend(pack.youSend.find((asset) => asset.type === "cash")?.cashM ?? 0);
                    setCashReceive(
                      pack.youReceive
                        .filter((asset) => asset.type === "cash")
                        .reduce((sum, asset) => sum + (asset.cashM ?? 0), 0)
                    );
                    setMessage("Package loaded.");
                  }}
                >
                  {abbr} sends {assetNames(league, pack.youReceive)} for {assetNames(league, pack.youSend)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

function PlayerList({
  title,
  players,
  selected,
  onToggle,
  statusOf,
  onStatus,
}: {
  title: ReactNode;
  players: GmPlayer[];
  selected: GmTradeAsset[];
  onToggle: (player: GmPlayer) => void;
  statusOf?: (player: GmPlayer) => "open" | "block" | "untouchable";
  onStatus?: (
    player: GmPlayer,
    status: "open" | "block" | "untouchable"
  ) => void;
}) {
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-3 py-2 font-medium">{title}</p>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {players.map((player) => (
          <li key={player.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={hasAsset(selected, player.id)}
                onChange={() => onToggle(player)}
              />
              <span className="min-w-0 flex-1 truncate">
                <Link
                  href={`/gm/player/${encodeURIComponent(player.id)}`}
                  className="underline-offset-2 hover:underline"
                  onClick={(event) => event.preventDefault()}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    window.location.assign(`/gm/player/${encodeURIComponent(player.id)}`);
                  }}
                >
                  {player.name}
                </Link>
                {" · "}
                {player.position} · {displayOverall(player)}
              </span>
              <StarValue stars={playerStars(player)} />
              <Surplus player={player} />
              <span className="tabular-nums text-muted-foreground">
                ${player.contract?.annualSalaryM.toFixed(1) ?? "-"}M
              </span>
            </label>
            {onStatus && statusOf ? (
              <select
                aria-label={`${player.name} trade status`}
                className="rounded-md border border-border bg-background px-1 py-1 text-xs"
                value={statusOf(player)}
                onChange={(event) =>
                  onStatus(
                    player,
                    event.target.value as "open" | "block" | "untouchable"
                  )
                }
              >
                <option value="open">Open</option>
                <option value="block">Block</option>
                <option value="untouchable">Untouchable</option>
              </select>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickList({
  title,
  picks,
  selected,
  onToggle,
  onProtect,
  league,
}: {
  title: string;
  picks: GmDraftPick[];
  selected: GmTradeAsset[];
  onToggle: (pick: GmDraftPick) => void;
  onProtect?: (pick: GmDraftPick, topN: number | null) => void;
  league: NonNullable<ReturnType<typeof useGmStore.getState>["league"]>;
}) {
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-3 py-2 font-medium">{title}</p>
      <ul className="divide-y divide-border">
        {picks.map((pick) => (
          <li key={pick.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={hasAsset(selected, pick.id)}
                onChange={() => onToggle(pick)}
              />
              <span className="flex flex-1 flex-wrap items-center gap-2">
                {pickLabel(pick)}
                <span className="text-xs text-muted-foreground">about pick {projectedSlot(league, pick)}</span>
                <StarValue stars={pickStars(league, pick)} />
              </span>
            </label>
            {onProtect && pick.round === 1 ? (
              <select
                aria-label={`${pickLabel(pick)} protection`}
                className="rounded-md border border-border bg-background px-1 py-1 text-xs"
                value={pick.protectionTopN ?? 0}
                onChange={(event) => {
                  const top = Number(event.target.value);
                  onProtect(pick, top > 0 ? top : null);
                }}
              >
                <option value={0}>Unprotected</option>
                <option value={4}>Top 4</option>
                <option value={8}>Top 8</option>
                <option value={14}>Lottery</option>
              </select>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
