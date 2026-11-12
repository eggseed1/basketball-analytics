"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { displayOverall, userPlayers, userTeam } from "@/gm/lib/selectors";
import type { GmDraftPick, GmLeagueState, GmPlayer, GmTradeAsset } from "@/gm/types";
import {
  cashLimitM,
  evaluateTrade,
  teamCashM,
  type PlayerPackage,
} from "@/gm/engine/trades";
import { legalNew321PickProtection } from "@/gm/engine/lottery-balls";
import { findSelectedTradePackages } from "@/gm/engine/trade-finder";
import { resolveTradeEntry } from "@/gm/lib/trade-entry";
import { Button } from "@/components/ui/button";
import { ClubMark } from "@/gm/ui/club-mark";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { formatNumber, UNAVAILABLE_STAT_LABEL } from "@/lib/format";
import { StarValue } from "@/gm/ui/star-value";
import {
  contractSurplusM,
  pickStars,
  playerStars,
  projectedSlot,
  stanceLabel,
  tradeStance,
} from "@/gm/engine/value";
import { offerIsFair } from "@/gm/engine/offers";
import { tradeDeskRead } from "@/gm/engine/trade-desk";
import { tradeWindowStatus } from "@/gm/engine/trade-window";
import { marketForDisplay, tradeDaysRemaining } from "@/gm/engine/trade-market";
import { playerSheet } from "@/gm/engine/attributes";
import { scoutPotentialView } from "@/gm/engine/scouting";
import { entrySeasonIsCurrentSaveYear } from "@/gm/lib/career-overlay";
import { rateLabel, shotLabel, simCountingLine } from "@/gm/lib/counting";
import { valueForBoard } from "@/gm/lib/season-line";
import { DRBL_PUBLIC_RATE_LABEL, WAR1_LABEL, formatWar1 } from "@/lib/drbl-public-labels";
import { cn } from "@/lib/utils";

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

function assetChipLabel(league: GmLeagueState, asset: GmTradeAsset): string {
  if (asset.type === "player") {
    return league.players.find((player) => player.id === asset.id)?.name ?? "Player";
  }
  if (asset.type === "pick") {
    const pick = league.teams.flatMap((team) => team.draftPicks).find((entry) => entry.id === asset.id);
    return pick ? pickLabel(pick) : "Pick";
  }
  return `$${formatNumber(asset.cashM ?? 0, 1)}M cash`;
}

function DealBox({
  league,
  receive,
  send,
  onInspect,
  inspectedId,
}: {
  league: GmLeagueState;
  receive: GmTradeAsset[];
  send: GmTradeAsset[];
  onInspect: (playerId: string) => void;
  inspectedId: string | null;
}) {
  return (
    <div className="rounded-xl border border-amber-500/50 bg-background/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        The deal
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <DealLane
          label="You get"
          assets={receive}
          league={league}
          onInspect={onInspect}
          inspectedId={inspectedId}
          empty="Nothing coming back yet."
        />
        <DealLane
          label="You send"
          assets={send}
          league={league}
          onInspect={onInspect}
          inspectedId={inspectedId}
          empty="Nothing going out yet."
        />
      </div>
    </div>
  );
}

function DealLane({
  label,
  assets,
  league,
  onInspect,
  inspectedId,
  empty,
}: {
  label: string;
  assets: GmTradeAsset[];
  league: GmLeagueState;
  onInspect: (playerId: string) => void;
  inspectedId: string | null;
  empty: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {assets.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {assets.map((asset) => {
            const player =
              asset.type === "player"
                ? league.players.find((entry) => entry.id === asset.id)
                : null;
            return (
              <li key={`${asset.type}-${asset.id}`}>
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm",
                    inspectedId === asset.id && "border-foreground/40 bg-secondary"
                  )}
                >
                  {player && <GmPlayerPortrait player={player} size="sm" />}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {assetChipLabel(league, asset)}
                  </span>
                  {player ? (
                    <>
                      <span className="hidden text-[12px] text-muted-foreground sm:inline">
                        {player.position} · {displayOverall(player)}
                      </span>
                      <StarValue stars={playerStars(player)} />
                      <button
                        type="button"
                        className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline"
                        onClick={() => onInspect(player.id)}
                      >
                        Info
                      </button>
                    </>
                  ) : asset.type === "pick" ? (
                    (() => {
                      const pick = league.teams
                        .flatMap((team) => team.draftPicks)
                        .find((entry) => entry.id === asset.id);
                      return pick ? <StarValue stars={pickStars(league, pick)} /> : null;
                    })()
                  ) : null}
                </div>
                {player ? <details className="mt-1 rounded-md border border-border/70 px-2 py-1.5"><summary className="cursor-pointer text-xs font-semibold">Full ratings · {player.name}</summary><div className="mt-2"><TradePlayerRatings player={player}/><TradePlayerSeasonStats league={league} player={player}/></div></details> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TradePlayerSeasonStats({league,player}:{league:GmLeagueState;player:GmPlayer}) {
  const nba=player.nbaSeason;
  const line=simCountingLine(league,player.id) ?? (nba && !entrySeasonIsCurrentSaveYear(nba,league.season) ? nba : null);
  const gp=line?.gp ?? 0;
  const cells=[
    ["GP",gp ? String(gp) : UNAVAILABLE_STAT_LABEL],
    ["MPG",line ? rateLabel(line.min,gp) : UNAVAILABLE_STAT_LABEL],
    ["PPG",line ? rateLabel(line.pts,gp) : UNAVAILABLE_STAT_LABEL],
    ["RPG",line ? rateLabel(line.reb,gp) : UNAVAILABLE_STAT_LABEL],
    ["APG",line ? rateLabel(line.ast,gp) : UNAVAILABLE_STAT_LABEL],
    ["SPG",line ? rateLabel(line.stl,gp) : UNAVAILABLE_STAT_LABEL],
    ["BPG",line ? rateLabel(line.blk,gp) : UNAVAILABLE_STAT_LABEL],
    ["TS%",line && line.fga+0.44*line.fta>0 ? shotLabel(line.pts/2,line.fga+0.44*line.fta) : UNAVAILABLE_STAT_LABEL],
  ];
  return <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8" data-testid="trade-player-stats">
    {cells.map(([label,value])=><div key={label} className="rounded-md bg-secondary/60 px-1.5 py-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p><p className="text-sm font-bold tabular-nums">{value}</p>
    </div>)}
  </div>;
}

/** Expand a player's actual saved attributes without leaving the trade negotiation. */
function TradePlayerRatings({ player }: { player: GmPlayer }) {
  const a = playerSheet(player).attributes;
  const groups = [
    ["Scoring", [["Close",a.closeShot],["Layup",a.drivingLayup],["Dunk",a.drivingDunk],["Midrange",a.midrange],["Three",a.threePoint],["FT",a.freeThrow],["Post",a.postControl]]],
    ["Playmaking", [["Passing",a.passAccuracy],["Handle",a.ballHandle],["Ball speed",a.speedWithBall]]],
    ["Defense & glass", [["Perimeter",a.perimeterDefense],["Interior",a.interiorDefense],["Steal",a.steal],["Block",a.block],["O. reb",a.offReb],["D. reb",a.defReb]]],
    ["Athleticism", [["Speed",a.speed],["Agility",a.agility],["Strength",a.strength],["Vertical",a.vertical],["Stamina",a.stamina]]],
  ] as const;
  return <div className="grid gap-3 sm:grid-cols-2" data-testid="trade-player-ratings">
    {groups.map(([title,ratings]) => <div key={title} className="rounded-lg border border-border bg-background/50 p-2.5">
      <p className="mb-2 text-xs font-bold">{title}</p>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
        {ratings.map(([label,value]) => <div key={label} className="flex items-center justify-between gap-2 text-xs">
          <dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd>
        </div>)}
      </dl>
    </div>)}
  </div>;
}

function TradePlayerPeek({
  league,
  player,
  onClose,
}: {
  league: GmLeagueState;
  player: GmPlayer;
  onClose: () => void;
}) {
  const sheet = playerSheet(player);
  const scout = userTeam(league).staff.scout;
  const scoutRead = scoutPotentialView(player, scout);
  const value = valueForBoard(league, player);
  const sim = simCountingLine(league, player.id);
  const nba = player.nbaSeason;
  // Don't show real NBA counting for the year this save is already playing.
  const entryOk =
    nba && !entrySeasonIsCurrentSaveYear(nba, league.season) ? nba : null;
  const line = sim ?? entryOk;
  const gp = line?.gp ?? 0;

  return (
    <aside className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Player file
          </p>
          <h3 className="mt-1 flex items-center gap-3 text-[1.2rem] font-bold tracking-tight"><GmPlayerPortrait player={player} size="md" />{player.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {player.position} · Age {player.age} · OVR {sheet.overall}
            {player.contract
              ? ` · $${formatNumber(player.contract.annualSalaryM, 1)}M / ${player.contract.yearsRemaining} yr`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StarValue stars={playerStars(player)} />
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <PeekStat label="OVR" value={String(sheet.overall)} />
        <PeekStat label={DRBL_PUBLIC_RATE_LABEL} value={formatWar1(value.drbl100, 1)} />
        <PeekStat label={WAR1_LABEL} value={formatWar1(value.war1, 1)} />
        <PeekStat
          label="Scout"
          value={`${scoutRead.low}-${scoutRead.high}`}
        />
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TS%"].map((label) => (
                <th key={label} className="px-1.5 py-1 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="tabular-nums">
              <td className="px-1.5 py-1">{gp || UNAVAILABLE_STAT_LABEL}</td>
              <td className="px-1.5 py-1">
                {line ? rateLabel(line.min, gp) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="px-1.5 py-1">
                {line ? rateLabel(line.pts, gp) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="px-1.5 py-1">
                {line ? rateLabel(line.reb, gp) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="px-1.5 py-1">
                {line ? rateLabel(line.ast, gp) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="px-1.5 py-1">
                {line ? rateLabel(line.stl, gp) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="px-1.5 py-1">
                {line ? rateLabel(line.blk, gp) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="px-1.5 py-1">
                {line && line.fga + 0.44 * line.fta > 0
                  ? shotLabel(line.pts / 2, line.fga + 0.44 * line.fta)
                  : UNAVAILABLE_STAT_LABEL}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details open className="mt-3 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">All ratings · expand / collapse</summary><div className="mt-3"><TradePlayerRatings player={player}/></div></details>
      <p className="mt-3 text-sm text-muted-foreground">{scoutRead.comment}</p>
      <Surplus player={player} />
      <p className="mt-3 text-sm">
        <Link
          href={`/gm/player/${encodeURIComponent(player.id)}`}
          className="font-medium underline underline-offset-2"
        >
          Open full player page
        </Link>
      </p>
    </aside>
  );
}

function PeekStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/70 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
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
  const [inspectedId, setInspectedId] = useState<string | null>(
    offer.fromAssets.find((asset) => asset.type === "player")?.id ??
      offer.toAssets.find((asset) => asset.type === "player")?.id ??
      null
  );
  const fair = offerIsFair(league, offer.fromTeamId, offer.toTeamId, receive, send);
  const read = tradeDeskRead(league, offer.fromTeamId, send, receive);
  const mine = league.players.filter(
    (player) => player.teamId === league.userTeamId && player.contract
  );
  const theirs = league.players.filter(
    (player) => player.teamId === offer.fromTeamId && player.contract
  );
  const myPicks =
    league.teams.find((team) => team.id === league.userTeamId)?.draftPicks ?? [];
  const theirPicks = caller?.draftPicks ?? [];
  const inspected = inspectedId
    ? league.players.find((player) => player.id === inspectedId) ?? null
    : null;
  const dirty =
    JSON.stringify(receive) !== JSON.stringify(offer.fromAssets) ||
    JSON.stringify(send) !== JSON.stringify(offer.toAssets);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <header>
        <h2 className="text-lg font-semibold">
          {caller?.city ?? "A team"} offered this deal
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {offer.note} The box at the top is the deal on the table. Check or
          uncheck pieces below to reshape it. Open Info on a player before you
          answer. The sim stays paused until you accept or decline.
        </p>
      </header>

      <DealBox
        league={league}
        receive={receive}
        send={send}
        inspectedId={inspectedId}
        onInspect={setInspectedId}
      />

      <div role="status" className="rounded-lg border border-border bg-background/70 px-3 py-3 text-sm">
        <p className="font-semibold">{fair.ok ? "Ready to accept" : read.headline}{dirty ? " · Edited terms" : ""}</p>
        <p className="mt-1 text-muted-foreground">{fair.ok ? "Both teams agree to these terms." : fair.reason ?? read.detail}</p>
      </div>

      {inspected ? (
        <TradePlayerPeek
          league={league}
          player={inspected}
          onClose={() => setInspectedId(null)}
        />
      ) : null}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Edit the package
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <OfferSide
            title="Add from them"
            players={theirs}
            picks={theirPicks}
            league={league}
            selected={receive}
            inspectedId={inspectedId}
            onInspect={setInspectedId}
            onToggle={(asset) => setReceive(toggleAsset(receive, asset))}
          />
          <OfferSide
            title="Add from your roster"
            players={mine}
            picks={myPicks}
            league={league}
            selected={send}
            inspectedId={inspectedId}
            onInspect={setInspectedId}
            onToggle={(asset) => setSend(toggleAsset(send, asset))}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!fair.ok}
          onClick={() => {
            const result = onAccept(receive, send);
            setMessage(result.ok ? "Trade accepted." : result.reason ?? "Rejected");
          }}
        >
          Accept deal
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setReceive(offer.fromAssets);
            setSend(offer.toAssets);
            setMessage(null);
          }}
        >
          Reset to offer
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
  inspectedId,
  onInspect,
  onToggle,
}: {
  title: string;
  players: GmPlayer[];
  picks: GmDraftPick[];
  league: GmLeagueState;
  selected: GmTradeAsset[];
  inspectedId: string | null;
  onInspect: (playerId: string) => void;
  onToggle: (asset: GmTradeAsset) => void;
}) {
  const shownPlayers = players
    .filter((player) => playerStars(player) >= 1.5 || hasAsset(selected, player.id))
    .sort((a, b) => playerStars(b) - playerStars(a))
    .slice(0, 12);
  return (
    <div className="rounded-lg border border-border bg-background/70">
      <p className="border-b border-border px-3 py-2 text-sm font-medium">{title}</p>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {shownPlayers.map((player) => (
          <li
            key={player.id}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm",
              inspectedId === player.id && "bg-secondary/80"
            )}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={hasAsset(selected, player.id)}
                onChange={() => onToggle({ type: "player", id: player.id })}
              />
              <GmPlayerPortrait player={player} />
              <span className="min-w-0 flex-1 truncate">
                {player.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {player.position} · {displayOverall(player)}
                </span>
              </span>
              <StarValue stars={playerStars(player)} />
            </label>
            <button
              type="button"
              className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline"
              onClick={() => onInspect(player.id)}
            >
              Info
            </button>
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
                <span className="ml-1 text-xs text-muted-foreground">
                  about pick {projectedSlot(league, pick)}
                </span>
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
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  const proposeTrade = useGmStore((s) => s.proposeTrade);
  const acceptIncomingOffer = useGmStore((s) => s.acceptIncomingOffer);
  const declineIncomingOffer = useGmStore((s) => s.declineIncomingOffer);
  const setTradeStatus = useGmStore((s) => s.setTradeStatus);
  const setPickProtection = useGmStore((s) => s.setPickProtection);
  const [partnerChoice, setPartnerChoice] = useState<string | null>(null);
  const partnerId = league?.teams.find(t => t.id === partnerChoice && t.id !== league.userTeamId)?.id ??
    league?.teams.find(t => t.id !== league.userTeamId && !t.id.startsWith("as-"))?.id ?? "";
  const [give, setGive] = useState<GmTradeAsset[]>([]);
  const [get, setGet] = useState<GmTradeAsset[]>([]);
  const [cashSend, setCashSend] = useState(0);
  const [cashReceive, setCashReceive] = useState(0);
  const [packages, setPackages] = useState<PlayerPackage[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [machineInspectId, setMachineInspectId] = useState<string | null>(null);
  const [loadedEntrySearch, setLoadedEntrySearch] = useState<string | null>(null);

  useEffect(() => {
    if (!league) return;
    const query = new URLSearchParams(window.location.search);
    if (!query.has("shop") && !query.has("target")) return;
    const key = query.toString();
    if (loadedEntrySearch === key) return;
    const frame = window.requestAnimationFrame(() => {
      setLoadedEntrySearch(key);
      const entry = resolveTradeEntry(league, query);
      if (!entry) {
        setMessage("This trade link is no longer valid for the current franchise. Choose an available player below.");
        return;
      }
      const selected: GmTradeAsset = { type: "player", id: entry.player.id };
      const outgoing = entry.mode === "shop" ? [selected] : [];
      const incoming = entry.mode === "target" ? [selected] : [];
      setGive(outgoing);
      setGet(incoming);
      setCashSend(0);
      setCashReceive(0);
      setPartnerChoice(entry.partnerId);
      setMachineInspectId(entry.player.id);
      const suggestions = findSelectedTradePackages(
        league, league.userTeamId, outgoing, incoming, entry.partnerId ?? undefined
      );
      // Load the highest-ranked legal, CPU-acceptable package immediately.
      // A player can open a profile, select Trade, then explicitly Propose:
      // two clicks in favorable markets, without skipping review or approval.
      const best = suggestions[0];
      if (best) {
        setPartnerChoice(best.partnerId);
        setGive(best.youSend.filter(asset => asset.type !== "cash"));
        setGet(best.youReceive.filter(asset => asset.type !== "cash"));
        setCashSend(best.youSend.filter(asset => asset.type === "cash").reduce((sum, asset) => sum + (asset.cashM ?? 0), 0));
        setCashReceive(best.youReceive.filter(asset => asset.type === "cash").reduce((sum, asset) => sum + (asset.cashM ?? 0), 0));
      }
      setPackages(suggestions);
      setMessage(suggestions.length
        ? `${entry.player.name} selected. Compare ${suggestions.length} legal offers below. The top package is loaded for your review; nothing has been proposed yet.`
        : `${entry.player.name} selected. No ready-made acceptable deal; compare the stats and build your own offer.`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [league, loadedEntrySearch]);

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
  const market = useMemo(() => league ? marketForDisplay(league) : null, [league]);

  if (!league) return null;
  const team = userTeam(league);
  const partner = league.teams.find((t) => t.id === partnerId) ?? team;
  const available = teamCashM(team, league.settings);
  const machineInspected = machineInspectId
    ? league.players.find((player) => player.id === machineInspectId) ?? null
    : null;

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
  const desk = tradeDeskRead(league, partnerId, fromAssets, toAssets);
  const trading = tradeWindowStatus(league);
  const talks = (league.tradeTalks ?? []).filter(talk => talk.teamId === partnerId).slice(0, 2);
  const selectedRumor = market?.rumors.find(row =>
    row.teamId === partnerId &&
    toAssets.some(asset => asset.type === "player" && asset.id === row.playerId));
  const loadMarketPlayer = (playerId: string, ownerId: string) => {
    const asset: GmTradeAsset = { type: "player", id: playerId };
    setGive(ownerId === league.userTeamId ? [asset] : []);
    setGet(ownerId !== league.userTeamId ? [asset] : []);
    setCashSend(0);
    setCashReceive(0);
    const suggested = findSelectedTradePackages(league, league.userTeamId,
      ownerId === league.userTeamId ? [asset] : [],
      ownerId !== league.userTeamId ? [asset] : [], ownerId);
    setPackages(suggested);
    if (ownerId !== league.userTeamId) setPartnerChoice(ownerId);
    setMessage(suggested.length
      ? "Trade Finder has options below. Choose a package or build your own."
      : "No ready-made offers. You can still build a package.");
    document.getElementById("trade-builder")?.scrollIntoView({
      block: "start", behavior: "smooth",
    });
  };
  if (league.incomingOffer) {
    return <div className="flex flex-col gap-4">
      <header><h1 className="text-2xl font-bold tracking-tight">Incoming trade offer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review the offer, adjust its terms, or decline before continuing the season.</p></header>
      <IncomingOffer league={league} onAccept={acceptIncomingOffer} onDecline={declineIncomingOffer} />
    </div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Front office</p>
        <h1 className="text-2xl font-bold tracking-tight">{t("tradeTitle")}</h1>
        <p className="text-sm text-muted-foreground">Choose players, review the deal, then talk to the other GM.</p>
      </header>
      <div role="status" className="rounded-lg border border-border bg-secondary/35 px-3 py-2 text-xs">
        <span className="font-bold">{trading.label}</span>{trading.open
          ? " · You can propose packages and find CPU deals right now."
          : " · " + trading.reason}
      </div>
      {league.phase === "regular" && trading.open &&
        <section data-testid="trade-market" aria-label="Trade market" className="rounded-xl border border-border p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">Around the league</h2>
            <p className="text-xs text-muted-foreground">{tradeDaysRemaining(league)} days until the trade deadline</p>
          </div>
          {market?.rumors.length ? (
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">
              {market.rumors.slice(0, 4).map(rumor => {
                const player = league.players.find(row => row.id === rumor.playerId);
                const owner = league.teams.find(row => row.id === rumor.teamId);
                if (!player || !owner) return null;
                const interest = rumor.interestedTeamIds.length;
                return <article key={player.id} className="flex w-[228px] shrink-0 snap-start flex-col gap-2 rounded-lg border border-border/70 bg-secondary/20 p-3 sm:w-auto sm:shrink">
                  <div className="flex min-w-0 items-center gap-2">
                    <GmPlayerPortrait player={player} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{player.name}</p>
                      <p className="text-xs text-muted-foreground">{owner.abbr} · {player.position} · {displayOverall(player)} OVR</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rumor.signal === "request" ? "Player requested a trade" :
                      rumor.signal === "listed" ? "Available for trade" :
                        "Teams monitoring"}
                    {interest > 0 ? ` · ${interest} ${interest === 1 ? "team" : "teams"} interested` : ""}
                  </p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => loadMarketPlayer(player.id, owner.id)}>
                    {owner.id === league.userTeamId ? "Find trade partners" : "Explore a deal"}
                  </Button>
                </article>;
              })}
            </div>
          ) : <p className="text-xs text-muted-foreground">No active leads. Choose a team below to build an offer.</p>}
          <p className="mt-2 text-[11px] text-muted-foreground">Interest reflects team needs and scouting, not confirmed offers.</p>
        </section>}
      <div id="trade-builder" className="scroll-mt-6">
      <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium">
        Trade partner
        <select
          className="rounded-md border border-border bg-background px-2 py-2"
          value={partnerId}
          onChange={(e) => {
            setPartnerChoice(e.target.value);
            setGet([]);
            setCashReceive(0);
            setPackages(null);
            setMessage(null);
          }}
        >
          {league.teams
            .filter((t) => t.id !== team.id && !t.id.startsWith("as-"))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.abbr} - {t.city} ({stanceLabel(tradeStance(league, t.id))})
              </option>
            ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        <ClubMark teamId={partner.id} label={partner.abbr} /> is {stanceLabel(tradeStance(league, partner.id))}. {desk.need}
      </p>
      <DealBox league={league} receive={toAssets} send={fromAssets}
        onInspect={setMachineInspectId} inspectedId={machineInspectId} />
      </div>
      {packages && packages.length > 0 ? (
        <section data-testid="trade-finder-matches" aria-label="Trade Finder packages" className="rounded-xl border border-border p-3">
          <h2 className="mb-2 text-sm font-semibold">Suggested deals</h2>
          <p className="mb-3 text-xs text-muted-foreground">All selected assets stay in each offer. Results are accepted by the CPU trade evaluator, including salary and draft-pick rules.</p>
          <ul className="flex flex-col gap-2">
          {packages.map((pack) => {
            const abbr = league.teams.find((entry) => entry.id === pack.partnerId)?.abbr ?? pack.partnerId;
            return (
              <li key={`${pack.partnerId}-${pack.youSend.map((asset) => asset.id).join("-")}-${pack.youReceive.map((asset) => asset.id).join("-")}`}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setPartnerChoice(pack.partnerId);
                    setGive(pack.youSend.filter((asset) => asset.type !== "cash"));
                    setGet(pack.youReceive.filter((asset) => asset.type !== "cash"));
                    setCashSend(pack.youSend.find((asset) => asset.type === "cash")?.cashM ?? 0);
                    setCashReceive(
                      pack.youReceive
                        .filter((asset) => asset.type === "cash")
                        .reduce((sum, asset) => sum + (asset.cashM ?? 0), 0)
                    );
                    setPackages(null);
                    setMessage("Package loaded. Review and propose when ready.");
                  }}
                >
                  {abbr} sends {assetNames(league, pack.youReceive)} for {assetNames(league, pack.youSend)}
                </button>
              </li>
            );
          })}
          </ul>
        </section>
      ) : null}

      {machineInspected ? (
        <TradePlayerPeek
          league={league}
          player={machineInspected}
          onClose={() => setMachineInspectId(null)}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div data-testid="trade-my-players" className="flex flex-col gap-3">
          <PlayerList
            title={`You send (${team.abbr})`}
            players={myPlayers}
            selected={give}
            inspectedId={machineInspectId}
            onInspect={setMachineInspectId}
            onToggle={(player) =>
              setGive(toggleAsset(give, { type: "player", id: player.id }))
            }
          />
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Trade block and untouchables</summary>
            <div className="mt-3 max-h-56 divide-y divide-border overflow-y-auto">
              {myPlayers.map(player => <div key={player.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{player.name}</span>
                <select aria-label={player.name + " trade status"}
                  className="max-w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  value={(team.untouchables ?? []).includes(player.id) ? "untouchable" :
                    (team.tradeBlock ?? []).includes(player.id) ? "block" : "open"}
                  onChange={event => setTradeStatus(player.id, event.target.value as "open" | "block" | "untouchable")}>
                  <option value="open">Available</option>
                  <option value="block">Shop player</option>
                  <option value="untouchable">Untouchable</option>
                </select>
              </div>)}
            </div>
          </details>
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Add your picks or cash</summary>
            <div className="mt-3 space-y-3">
              <PickList title="Your picks" picks={team.draftPicks} selected={give} league={league}
                onToggle={pick => setGive(toggleAsset(give, { type: "pick", id: pick.id }))}
                onProtect={(pick, topN) => setPickProtection(pick.id, topN)} />
              <label className="flex flex-wrap items-center gap-2 text-sm">
                Cash ($M)
                <input aria-label="Cash you send" type="number" min={0} max={available} step={0.5}
                  value={cashSend} onChange={event => setCashSend(Number(event.target.value))}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1" />
              </label>
              <p className="text-xs text-muted-foreground">Cash does not count toward salary matching. ${formatNumber(available, 1)}M available.</p>
            </div>
          </details>
        </div>
        <div data-testid="trade-partner-players" className="gm-club-panel flex flex-col gap-3" style={teamColorStyle(partner.id)}>
          <PlayerList
            title={
              <>
                You receive from <ClubMark teamId={partner.id} label={partner.abbr} />
              </>
            }
            players={theirPlayers}
            selected={get}
            inspectedId={machineInspectId}
            onInspect={setMachineInspectId}
            onToggle={(player) =>
              setGet(toggleAsset(get, { type: "player", id: player.id }))
            }
          />
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Ask for picks or cash</summary>
            <div className="mt-3 space-y-3">
              <PickList title={`${partner.abbr} picks`} picks={partner.draftPicks} selected={get} league={league}
                onToggle={pick => setGet(toggleAsset(get, { type: "pick", id: pick.id }))} />
              <label className="flex flex-wrap items-center gap-2 text-sm">
                Cash ($M)
                <input aria-label="Cash they send" type="number" min={0} max={cashLimitM(league.settings)} step={0.5}
                  value={cashReceive} onChange={event => setCashReceive(Number(event.target.value))}
                  className="w-24 rounded-md border border-border bg-background px-2 py-1" />
              </label>
              <p className="text-xs text-muted-foreground">Cash is a trade sweetener, not salary matching.</p>
            </div>
          </details>
        </div>
      </div>

      <section data-testid="trade-gm-response" role="status" aria-live="polite"
        className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">From the {partner.abbr} front office</p>
            <h2 className="mt-1 text-lg font-bold">{desk.headline}</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
            desk.status === "ready" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
            desk.status === "value" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" :
            "bg-secondary text-muted-foreground")}>
            {desk.status === "ready" ? "Ready" : desk.status === "value" ? "Negotiable" :
              desk.status === "rules" ? "League rule" : "Building"}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{desk.detail}</p>
        {selectedRumor && selectedRumor.interestedTeamIds.length >= 2 &&
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            {selectedRumor.interestedTeamIds.length} other clubs are monitoring this player. Competition raises the asking price.
          </p>}
        <div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-2">
          <p>Salary sent: <strong className="text-foreground">${formatNumber(desk.sendsSalaryM, 1)}M</strong></p>
          <p>Salary received: <strong className="text-foreground">${formatNumber(desk.receivesSalaryM, 1)}M</strong></p>
        </div>
        {desk.status === "value" && <p className="mt-2 text-xs text-muted-foreground">
          Send the proposal to hear their counter. You can keep negotiating here.
        </p>}
        {desk.status === "rules" && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {preview.reason}
        </p>}
      </section>
      {talks.length > 0 && <section aria-label="Recent negotiations" className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Recent negotiations with {partner.abbr}</h2>
        <div className="mt-2 space-y-3">
          {talks.map(talk => <div key={talk.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{talk.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">You offered {assetNames(league, talk.youSend)} for {assetNames(league, talk.youReceive)}.</p>
              {talk.counter && <p className="mt-1 text-xs text-muted-foreground">They want: {assetNames(league, talk.counter)}.</p>}
            </div>
            {talk.counter && <Button size="sm" variant="outline" onClick={() => {
              setGive(talk.counter!.filter(a => a.type !== "cash"));
              setGet(talk.youReceive.filter(a => a.type !== "cash"));
              setCashSend(talk.counter!.filter(a => a.type === "cash").reduce((sum, a) => sum + (a.cashM ?? 0), 0));
              setCashReceive(talk.youReceive.filter(a => a.type === "cash").reduce((sum, a) => sum + (a.cashM ?? 0), 0));
              setMessage("Counteroffer loaded. Review it before proposing.");
            }}>Load counteroffer</Button>}
          </div>)}
        </div>
      </section>}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!fromAssets.length || !toAssets.length || desk.status === "rules" || !trading.open}
          onClick={() => {
            const res = proposeTrade(partnerId, fromAssets, toAssets);
            setMessage(res.ok ? "Trade completed." : (res.reason ?? "Declined") + " Review their response above.");
            if (res.ok) {
              setGive([]);
              setGet([]);
              setCashSend(0);
              setCashReceive(0);
              setPackages(null);
            }
          }}
        >
          {desk.status === "value" ? "Ask for a counter" : "Propose trade"}
        </Button>
        <Button
          variant="outline"
          disabled={!trading.open}
          onClick={() => {
            const found = findSelectedTradePackages(
              league, league.userTeamId, fromAssets, toAssets, partnerId
            );
            setPackages(found);
            setMessage(found.length
              ? found.length + " legal package" + (found.length === 1 ? "" : "s") +
                " found. Choose an offer to load it into the machine."
              : "No CPU team is willing to accept a legal trade with those assets right now. Try changing the picks, protections or players. You can also clear the machine to browse open offers.");
          }}
        >
          Find deals
        </Button>
        <Button variant="ghost" onClick={() => {
          setGive([]); setGet([]); setCashSend(0); setCashReceive(0);
          setPackages(null); setMessage(null);
        }}>Clear</Button>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

function PlayerList({
  title,
  players,
  selected,
  onToggle,
  inspectedId,
  onInspect,
  statusOf,
  onStatus,
}: {
  title: ReactNode;
  players: GmPlayer[];
  selected: GmTradeAsset[];
  onToggle: (player: GmPlayer) => void;
  inspectedId?: string | null;
  onInspect?: (playerId: string) => void;
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
          <li
            key={player.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm",
              inspectedId === player.id && "bg-secondary/70"
            )}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={hasAsset(selected, player.id)}
                onChange={() => onToggle(player)}
              />
              <GmPlayerPortrait player={player} />
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate font-medium">{player.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {player.position}{player.secondaryPosition ? "/" + player.secondaryPosition : ""} · {displayOverall(player)} OVR ·
                  ${player.contract?.annualSalaryM.toFixed(1) ?? "-"}M
                </span>
              </span>
              <span className="hidden sm:inline"><StarValue stars={playerStars(player)} /></span>
              <span className="hidden lg:inline"><Surplus player={player} /></span>
            </label>
            {onInspect ? (
              <button
                type="button"
                className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline"
                onClick={() => onInspect(player.id)}
              >
                Info
              </button>
            ) : null}
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
                {legalNew321PickProtection(pick.season,14)
                  ? <option value={14}>Lottery (top 14)</option>
                  : pick.protectionTopN === 14
                    ? <option value={14} disabled>Legacy lottery-protected</option>
                    : null}
              </select>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
