"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { BADGES, BADGE_LEVELS, badgeLevel } from "@/gm/engine/badges";
import { askingSalary, askingYears } from "@/gm/engine/free-agency-ask";
import { faPlayerPriorities, evaluateOfferUtility } from "@/gm/engine/fa-utility";
import { competingFreeAgentOffers, legalFreeAgentSalaryRange, projectFreeAgentResponse } from "@/gm/engine/fa-offer-projection";
import { displayOverall, displayPlayerName } from "@/gm/lib/selectors";
import type { GmCountingLine, GmLeagueState, GmPlayer } from "@/gm/types";

const groups = [
  { label: "Finishing", keys: [["closeShot", "Close"], ["drivingLayup", "Layup"], ["drivingDunk", "Dunk"]] },
  { label: "Shooting", keys: [["midrange", "Mid-range"], ["threePoint", "Three-point"], ["freeThrow", "Free throw"]] },
  { label: "Creation", keys: [["ballHandle", "Handle"], ["passAccuracy", "Passing"], ["speedWithBall", "Speed with ball"]] },
  { label: "Defense", keys: [["perimeterDefense", "Perimeter"], ["interiorDefense", "Interior"], ["steal", "Steal"], ["block", "Block"]] },
  { label: "Athleticism", keys: [["speed", "Speed"], ["vertical", "Vertical"], ["strength", "Strength"]] },
] as const;

function average(line: GmCountingLine | undefined, key: "pts" | "reb" | "ast" | "min") {
  return line && line.gp > 0 ? (line[key] / line.gp).toFixed(1) : "—";
}

/** Player-selection companion to the FA list. It never alters the market or
 * reveals hidden agent rolls; the negotiation screen remains the only place
 * that can submit a contract. */
export function GmFreeAgentDossier({
  league, player, canNegotiate, watched, onWatch, onBack,
}: {
  league: GmLeagueState;
  player: GmPlayer;
  canNegotiate: boolean;
  watched: boolean;
  onWatch: () => void;
  onBack?: () => void;
}) {
  const [view, setView] = useState<"overview" | "ratings" | "market">("overview");
  const ask = askingSalary(player, league);
  const years = askingYears(player, league);
  const rights = player.rightsTeamId === league.userTeamId;
  const userClub = league.teams.find(t => t.id === league.userTeamId);
  const rivals = competingFreeAgentOffers(league, player);
  const pending = league.faMarket?.pending.filter(row => row.playerId === player.id) ?? [];
  const agreed = league.faMarket?.agreements.find(row => row.playerId === player.id);
  const bounds = legalFreeAgentSalaryRange(league, player, years);
  const quote = projectFreeAgentResponse(league, player, Math.min(bounds.maxM, ask), years);
  const breakdown = userClub ? evaluateOfferUtility(league, player, userClub, ask, years) : null;
  const line = player.seasonLine?.gp ? player.seasonLine : player.priorLine?.gp ? player.priorLine : player.nbaSeason;
  const badges = BADGES.map(badge => ({ ...badge, level: badgeLevel(player, badge.id) }))
    .filter(badge => badge.level > 0).sort((a, b) => b.level - a.level).slice(0, 8);
  const values = player.sheet?.attributes;
  const negotiable = canNegotiate && player.teamId === null && !agreed;
  return <aside data-testid="fa-player-dossier"
      aria-label={"Free agent details for " + displayPlayerName(player)}
      className="min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-20">
    <div className="border-b border-border bg-secondary/30 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Player detail · Free agency</p>
        {onBack ? <button type="button" className="text-xs font-semibold underline underline-offset-4 lg:hidden" onClick={onBack}>Back to list</button> : null}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <GmPlayerPortrait player={player} size="lg" />
        <div className="min-w-0">
          <h3 className="text-xl font-bold tracking-tight">{displayPlayerName(player)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {player.position}{player.secondaryPosition ? " / " + player.secondaryPosition : ""} · Age {player.age}
            {player.heightIn ? " · " + Math.floor(player.heightIn / 12) + "′" + (player.heightIn % 12) + "″" : ""}
          </p>
          <p className="mt-2 text-sm font-semibold">{player.rightsKind === "restricted" ? "Restricted free agent" : "Unrestricted free agent"}{rights ? " · Your rights" : ""}</p>
        </div>
        <div className="ml-auto shrink-0 rounded-full border-4 border-primary/30 bg-background px-3 py-3 text-center">
          <span className="block text-xl font-black tabular-nums">{displayOverall(player)}</span>
          <span className="block text-[9px] font-bold tracking-widest text-muted-foreground">OVR</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[["Asking / yr", "$" + ask.toFixed(1) + "M"], ["Term", years + " yrs"], ["Rival bids", String(rivals.length)]].map(([label, value]) =>
          <div key={label} className="rounded-lg border border-border bg-background p-2 text-center">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-bold tabular-nums">{value}</p>
          </div>)}
      </div>
      <div className="mt-3 flex gap-2">
        <Link href={"/gm/free-agency/offer/" + encodeURIComponent(player.id)}
          aria-label={"Negotiate with " + player.name}
          className={buttonVariants({ size: "sm", className: "flex-1" }) + (!negotiable ? " pointer-events-none opacity-50" : "")}
          aria-disabled={!negotiable}>
          {negotiable ? "Negotiate contract" : agreed ? "Already committed" : "Unavailable"}
        </Link>
        <button type="button" onClick={onWatch} aria-pressed={watched}
          className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary">
          {watched ? "★ Watching" : "☆ Watch"}
        </button>
      </div>
    </div>
    <nav aria-label="Free agent player sections" className="grid grid-cols-3 border-b border-border">
      {(["overview","ratings","market"] as const).map(tab =>
        <button key={tab} type="button" aria-pressed={view===tab}
          onClick={() => setView(tab)}
          className={"min-h-11 border-b-2 text-xs font-semibold capitalize transition-colors " +
            (view===tab ? "border-primary bg-secondary/60 text-foreground" : "border-transparent text-muted-foreground hover:bg-secondary/30")}>
          {tab === "overview" ? "Overview" : tab === "ratings" ? "Ratings & badges" : "Market & fit"}
        </button>)}
    </nav>
    <div className="max-h-[min(64vh,740px)] space-y-4 overflow-y-auto p-4 sm:p-5">
      {view === "overview" ? <>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent production</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{line ? (line.season + " · " + line.gp + " games") : "No saved NBA games yet"}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {([["PPG","pts"],["RPG","reb"],["APG","ast"],["MPG","min"]] as const).map(([label,key]) =>
              <div key={label} className="rounded-lg bg-secondary/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{average(line,key)}</p>
              </div>)}
          </div>
        </div>
        <section>
          <h4 className="text-sm font-semibold">Player profile</h4>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {player.age <= 23 ? "Young player still building his role." : player.age >= 32 ? "Veteran with an established NBA career." : "Prime-age player who may contribute immediately."}
            {" "}Plays {player.position}{player.secondaryPosition ? " and " + player.secondaryPosition : ""}.
            {player.rightsTeamId ? " Previous team retains " + (player.rightsKind ?? "contract") + " rights." : ""}
          </p>
        </section>
        <section>
          <h4 className="text-sm font-semibold">Agent priorities</h4>
          <div className="mt-2 space-y-2">
            {faPlayerPriorities(player).slice(0,3).map(row =>
              <div key={row.id} className="flex items-center justify-between gap-2 text-xs">
                <span>{row.title}</span><strong>{Math.round(row.weight * 100)}%</strong>
              </div>)}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Estimated preferences from the in-game agent model.</p>
        </section>
      </> : null}
      {view === "ratings" ? <>
        <div className="grid grid-cols-2 gap-3">
          {groups.map(group => <section key={group.label} className="rounded-lg bg-secondary/30 p-3">
            <h4 className="text-xs font-semibold">{group.label}</h4>
            <dl className="mt-2 space-y-2">
              {group.keys.map(([key,label]) =>
                <div key={key} className="flex items-center justify-between gap-2 text-xs">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-bold tabular-nums">{values?.[key] ?? "—"}</dd>
                </div>)}
            </dl>
          </section>)}
        </div>
        <section>
          <h4 className="text-sm font-semibold">Active badges</h4>
          {badges.length ? <ul className="mt-2 flex flex-wrap gap-2">
            {badges.map(badge=><li key={badge.id} className="rounded-md border border-border px-2 py-1 text-xs">
              <strong>{badge.name}</strong><span className="ml-1 text-muted-foreground">{BADGE_LEVELS[badge.level]}</span>
            </li>)}
          </ul> : <p className="mt-2 text-xs text-muted-foreground">No active earned badges on this player yet.</p>}
        </section>
      </> : null}
      {view === "market" ? <>
        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[11px] text-muted-foreground">Maximum legal offer</p>
            <p className="mt-1 font-bold tabular-nums">{bounds.maxM > 0 ? "$" + bounds.maxM.toFixed(1) + "M" : "Unavailable"}</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[11px] text-muted-foreground">Interest at asking price</p>
            <p className="mt-1 font-bold tabular-nums">{quote.legal ? quote.chance + "% est." : "Not legal"}</p>
          </div>
        </section>
        <p className="text-xs text-muted-foreground">{quote.note}</p>
        <section>
          <h4 className="text-sm font-semibold">Fit with your team</h4>
          <dl className="mt-2 space-y-2">
            {([["Minutes / role",breakdown?.role],["Winning",breakdown?.winning],["Continuity",breakdown?.continuity],["Team direction",breakdown?.fit]] as const).map(([label,score])=>
              <div key={label} className="flex justify-between text-xs"><dt>{label}</dt>
                <dd className="font-semibold tabular-nums">{score == null ? "—" : Math.round(score) + "/100"}</dd></div>)}
          </dl>
        </section>
        <section>
          <h4 className="text-sm font-semibold">Recorded offers</h4>
          {rivals.length ? <ul className="mt-2 divide-y divide-border text-xs">
            {rivals.slice(0,5).map(offer => <li key={offer.id} className="flex justify-between gap-2 py-2">
              <span>{league.teams.find(team=>team.id===offer.teamId)?.abbr ?? "CPU"} · {offer.kind.replaceAll("_"," ")}</span>
              <strong className="tabular-nums">${offer.salaryM.toFixed(1)}M × {offer.years}yr</strong>
            </li>)}
          </ul> : <p className="mt-2 text-xs text-muted-foreground">No competing offers recorded yet.</p>}
          {pending.some(row=>row.teamId===league.userTeamId) ? <p className="mt-2 text-xs font-semibold">Your offer is pending a response.</p> : null}
          {agreed ? <p className="mt-2 text-xs font-semibold">Verbal agreement on record.</p> : null}
        </section>
      </> : null}
    </div>
  </aside>;
}
