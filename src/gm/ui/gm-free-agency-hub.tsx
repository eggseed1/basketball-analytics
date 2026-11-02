"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { isSignableFreeAgent } from "@/gm/engine/fa-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  askingSalary,
  askingYears,
  faStageLabel,
  renounceRightsPreview,
} from "@/gm/engine/free-agency";
import { pendingOptions } from "@/gm/engine/fa-options";
import { qualifyingOfferCandidates } from "@/gm/engine/fa-qualifying";
import { userRfaSheetsBlocking } from "@/gm/engine/fa-rfa";
import { evaluateSigning, capStatus } from "@/gm/engine/cap";
import { cbaSeason, offseasonRosterLimit } from "@/gm/engine/season-flow-state";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import {
  displayOverall,
  displayPlayerName,
  userCap,
  userTeam,
} from "@/gm/lib/selectors";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { GmContractNegotiation } from "@/gm/ui/gm-contract-negotiation";
import { maxSalaryForAge } from "@/gm/engine/cap";
import { ClubMark } from "@/gm/ui/club-mark";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmFaStage, GmPlayer, GmPosition } from "@/gm/types";

type HubTab =
  | "overview"
  | "options"
  | "qo"
  | "rights"
  | "market"
  | "offers"
  | "positional"
  | "recap";

const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

function stageTab(stage: GmFaStage | undefined): HubTab {
  if (stage === "options") return "options";
  if (stage === "qualifying_offers") return "qo";
  if (stage === "rights" || stage === "re_signing") return "rights";
  if (stage === "fill") return "recap";
  return "market";
}

export function GmFreeAgencyHub() {
  const league = useGmStore((s) => s.league);
  const advanceFaDay = useGmStore((s) => s.advanceFaDay);
  const runCpuSignings = useGmStore((s) => s.runCpuSignings);
  const signFreeAgent = useGmStore((s) => s.signFreeAgent);
  const renounceRights = useGmStore((s) => s.renounceRights);
  const decideTeamOption = useGmStore((s) => s.decideTeamOption);
  const tenderQo = useGmStore((s) => s.tenderQualifyingOffer);
  const declineQo = useGmStore((s) => s.declineQualifyingOffer);
  const matchSheet = useGmStore((s) => s.matchOfferSheet);
  const declineSheet = useGmStore((s) => s.declineOfferSheet);
  const toggleWatch = useGmStore((s) => s.toggleFaWatchlist);
  const lastFaNote = useGmStore((s) => s.lastFaNote);

  const [tabChoice, setTabChoice] = useState<{ stage: GmFaStage | undefined; tab: HubTab } | null>(null);
  const [salary, setSalary] = useState(8);
  const [years, setYears] = useState(2);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<GmPosition | "ALL">("ALL");
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyWatch, setOnlyWatch] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const agents = useMemo(() => {
    if (!league) return [] as GmPlayer[];
    return league.freeAgents
      .map((id) => league.players.find((p) => p.id === id))
      .filter((p): p is GmPlayer => p != null && p.teamId == null)
      .sort(
        (a, b) =>
          Number(displayOverall(b)) - Number(displayOverall(a)) ||
          a.name.localeCompare(b.name)
      );
  }, [league]);

  if (!league) return null;

  const open = league.phase === "free_agency";
  const market = league.faMarket;
  const activeTab = tabChoice?.stage === market?.stage && tabChoice ? tabChoice.tab : (open ? stageTab(market?.stage) : "overview");
  const rules = getCbaRules(cbaSeason(league));
  const cap = userCap(league);
  const team = userTeam(league);
  const sheet = capStatus(team, league.players, league.settings, cbaSeason(league));

  const filtered = agents.filter((p) => {
    if (market?.stage === "re_signing" && p.rightsTeamId !== league.userTeamId) return false;
    if (pos !== "ALL" && p.position !== pos) return false;
    if (onlyMine && p.rightsTeamId !== league.userTeamId) return false;
    if (onlyWatch && !(market?.watchlist ?? []).includes(p.id)) return false;
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const options = pendingOptions(league).filter((row) => row.teamId === league.userTeamId);
  const qos = qualifyingOfferCandidates(league).filter(
    (row) => row.rightsTeamId === league.userTeamId
  );
  const ownRights = agents.filter((p) => p.rightsTeamId === league.userTeamId);
  const sheets = userRfaSheetsBlocking(league);
  const myOffers = (market?.pending ?? []).filter((row) => row.teamId === league.userTeamId);
  const myAgreements = (market?.agreements ?? []).filter(
    (row) => row.teamId === league.userTeamId
  );
  const selected = agents.find((p) => p.id === selectedId) ?? null;

  const tabs: { id: HubTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "options", label: "Options" },
    { id: "qo", label: "QOs" },
    { id: "rights", label: "Rights" },
    { id: "market", label: "Market" },
    { id: "offers", label: "My offers" },
    { id: "positional", label: "By position" },
    { id: "recap", label: "Recap" },
  ];

  function loadAsk(player: GmPlayer) {
    setSalary(askingSalary(player, rules));
    setYears(askingYears(player, rules));
    setSelectedId(player.id);
    requestAnimationFrame(() => {
      const panel = document.getElementById("fa-offer-terms");
      panel?.focus({ preventScroll: true }); panel?.scrollIntoView({ block: "start" });
    });
  }

  const verdict = selected
    ? evaluateSigning(league, league.userTeamId, selected, salary, years)
    : null;
  const negotiationsOpen = open && !market?.done && ["re_signing", "moratorium", "open", "fill"].includes(market?.stage ?? "");
  const selectedAgreement = market?.agreements.find(row => row.playerId === selected?.id);
  const canOffer = selected && negotiationsOpen && isSignableFreeAgent(selected, league) &&
    (market?.stage !== "re_signing" || selected.rightsTeamId === league.userTeamId) && verdict?.ok;
  const verbal = market?.stage === "moratorium" || market?.stage === "re_signing";


  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {open ? faStageLabel(market) : "Market closed"}
          </p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight">Free agency</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Cap room ${cap.capRoomM.toFixed(1)}M · tax{" "}
            {sheet.overTax ? "over" : "under"} · apron{" "}
            {sheet.overFirstApron ? "1st+" : "clear"} · roster {cap.rosterSize}/
            {offseasonRosterLimit(league)} summer ({league.settings.maxRoster} at tip) · holds ${sheet.holdsM.toFixed(1)}M · MLE $
            {sheet.mleRemainingM.toFixed(1)}M
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!open ? (
            league.phase === "draft" || league.phase === "offseason" ? (
              <Link className={buttonVariants()} href="/gm/offseason">Continue at season hub</Link>
            ) : (
              <p className="text-sm text-muted-foreground">
                Finish the season and draft first.{" "}
                <Link href="/gm" className="underline">
                  Home
                </Link>
              </p>
            )
          ) : market?.done ? <Link className={buttonVariants()} href="/gm/offseason">Continue summer</Link> : (
            <>
              <Button onClick={() => advanceFaDay()} disabled={Boolean(market?.done)}>
                Advance window / day
              </Button>
              <Button variant="outline" onClick={() => runCpuSignings()}>
                Sim through this window
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card px-3 py-3" aria-label="Free agency calendar">
        <ol className="flex min-w-max gap-1 text-xs sm:gap-2">
          {([
            ["options", "Team options"], ["qualifying_offers", "Qualifying"], ["rights", "Bird rights"],
            ["re_signing", "Re-sign"], ["moratorium", "Moratorium"], ["open", "Signing"], ["fill", "Roster fill"]
          ] as const).map(([stage,label],index,all) => {
            const position = all.findIndex(row => row[0] === market?.stage);
            const current = market?.stage === stage;
            const done = position > index || Boolean(market?.done);
            return <li key={stage} aria-current={current ? "step" : undefined}
              className={cn("flex items-center gap-2 rounded-lg px-3 py-2 font-semibold", current ? "bg-foreground text-background" : done ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]", current ? "border-background/50" : "border-border")}>{done ? "✓" : index + 1}</span>
              <span>{label}</span>
            </li>;
          })}
        </ol>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Available cap room</p><p className="text-xl font-bold tabular-nums">{cap.capRoomM.toFixed(1)}M</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Market players</p><p className="text-xl font-bold tabular-nums">{agents.length}</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Your active offers / agreements</p><p className="text-xl font-bold tabular-nums">{myOffers.length} / {myAgreements.length}</p></div>
      </div>
      <p className="text-xs text-muted-foreground"><Link className="font-semibold underline underline-offset-4" href="/gm/contracts">Review contract extensions</Link> · Competing offers resolve as the market advances. Verbal commitments reserve room until signing opens.</p>

      {open ? <p className="text-sm text-muted-foreground">{market?.stage === "re_signing" ? "Your own-player window is open. Other clubs' free agents enter when league-wide negotiations begin." : market?.stage === "moratorium" ? "Negotiations are open. Agreements are verbal and reserve room; contracts finalize after the moratorium." : market?.done ? "The market is quiet. Progression, summer league and camp follow at the season hub." : "Resolve required decisions before advancing. The next window opens only when you continue."} Reserved commitments: ${myAgreements.reduce((sum, row) => sum + row.salaryM, 0).toFixed(1)}M.</p> : null}

      {lastFaNote ? (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[13px]" role="status">
          {lastFaNote}
        </p>
      ) : null}

      {sheets.length > 0 ? (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <h3 className="text-[13px] font-semibold">Offer sheets need a decision</h3>
          <ul className="mt-2 space-y-2">
            {sheets.map((sheetRow) => {
              const player = league.players.find((p) => p.id === sheetRow.playerId);
              if (!player) return null;
              return (
                <li
                  key={sheetRow.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                >
                  <span>
                    {displayPlayerName(player)} · ${sheetRow.salaryM.toFixed(1)}M /{" "}
                    {sheetRow.years} yrs · deadline day {sheetRow.matchDeadlineDay + 1}
                  </span>
                  <span className="flex gap-1">
                    <Button size="xs" onClick={() => matchSheet(sheetRow.id)}>
                      Match
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => declineSheet(sheetRow.id)}
                    >
                      Decline
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <nav className="flex flex-wrap gap-1">
        {tabs.map((row) => (
          <button
            key={row.id}
            type="button"
            className={cn(
              "gm-nav__link",
              activeTab === row.id && "is-active"
            )}
            onClick={() => setTabChoice({ stage: market?.stage, tab: row.id })}
          >
            {row.label}
          </button>
        ))}
      </nav>

      {selected ? <div id="fa-offer-terms" tabIndex={-1} className="scroll-mt-24 outline-none">
        <GmContractNegotiation
          key={selected.id}
          league={league}
          player={selected}
          mode="free-agency"
          salaryM={salary}
          years={years}
          onSalaryChange={setSalary}
          onYearsChange={setYears}
          onSubmit={() => signFreeAgent(selected.id, salary, years)}
          onClose={() => setSelectedId(null)}
          canSubmit={Boolean(canOffer)}
          maxSalaryM={maxSalaryForAge(selected.age, league.settings)}
          maxYears={selected.rightsTeamId === league.userTeamId ? 5 : 4}
          submitLabel={verbal ? "Request verbal commitment" : selected.rightsKind === "restricted" && selected.rightsTeamId !== league.userTeamId ? "File restricted offer sheet" : "Submit contract offer"}
          legalMessage={selectedAgreement ? "This player already has a verbal commitment." : !negotiationsOpen ? "Negotiations are closed in this window." : verdict && !verdict.ok ? verdict.reason : undefined}
        />
      </div> : null}

      {activeTab === "overview" ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="sports-card p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Returning payroll
            </p>
            <p className="mt-1 text-[22px] font-bold tabular-nums">
              ${sheet.payrollM.toFixed(1)}M
            </p>
            <p className="text-[13px] text-muted-foreground">
              Dead ${sheet.deadMoneyM.toFixed(1)}M · holds ${sheet.holdsM.toFixed(1)}M
            </p>
          </div>
          <div className="sports-card p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              On the market
            </p>
            <p className="mt-1 text-[22px] font-bold tabular-nums">{agents.length}</p>
            <p className="text-[13px] text-muted-foreground">
              Your rights: {ownRights.length} · options left: {options.length} · QOs:{" "}
              {qos.length}
            </p>
          </div>
        </section>
      ) : null}

      {activeTab === "options" ? (
        <section className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Contract options
          </div>
          {options.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No options waiting. Player options are decided by the player when you advance.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {options.map((row) => (
                <li
                  key={row.player.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <span>
                    {displayPlayerName(row.player)} · {displayOverall(row.player)} OVR · $
                    {row.salaryM.toFixed(1)}M {row.control} option
                  </span>
                  {row.control === "team" ? <span className="flex gap-1">
                    <Button
                      size="xs"
                      disabled={!open || market?.stage !== "options"}
                      onClick={() => decideTeamOption(row.player.id, "exercise")}
                    >
                      Exercise
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!open || market?.stage !== "options"}
                      onClick={() => decideTeamOption(row.player.id, "decline")}
                    >
                      Decline
                    </Button>
                  </span> : <span className="text-xs text-muted-foreground">Player decides when you advance</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {activeTab === "qo" ? (
        <section className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Qualifying offers
          </div>
          {qos.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No eligible restricted free agents on your rights list.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {qos.map((row) => (
                <li
                  key={row.player.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="inline-flex items-center gap-2">
                    <GmPlayerPortrait player={row.player} />{displayPlayerName(row.player)} · ${row.amountM.toFixed(1)}M QO ·{" "}
                    {row.status}
                  </span>
                  {row.status === "eligible" || !row.player.qoStatus ? (
                    <span className="flex gap-1">
                      <Button size="xs" disabled={!open || market?.stage !== "qualifying_offers"} onClick={() => tenderQo(row.player.id)}>
                        Tender
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!open || market?.stage !== "qualifying_offers"}
                        onClick={() => declineQo(row.player.id)}
                      >
                        Decline
                      </Button>
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">{row.status}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {activeTab === "rights" ? (
        <section className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Your free agents / rights
          </div>
          {ownRights.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No pending rights on the market.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {ownRights.map((player) => {
                const preview = renounceRightsPreview(league, player.id);
                return (
                  <li
                    key={player.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <GmPlayerPortrait player={player} />{displayPlayerName(player)} · {player.rightsKind ?? "UFA"} · hold $
                      {(player.lastSalaryM ?? 0).toFixed(1)}M · ask $
                      {askingSalary(player, rules).toFixed(1)}M per year / {askingYears(player, rules)} years
                      {preview.ok ? (
                        <span className="ml-1 text-[12px] text-muted-foreground">
                          (renounce → room ${preview.roomAfterM.toFixed(1)}M)
                        </span>
                      ) : null}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        size="xs"
                        aria-label={"Review offer for " + player.name}
                        onClick={() => { loadAsk(player); setTabChoice({ stage: market?.stage, tab: "market" }); }}
                        disabled={!open || Boolean(market?.done) || !["re_signing", "moratorium", "open", "fill"].includes(market?.stage ?? "") || Boolean(market?.agreements.some(row => row.playerId === player.id))}
                      >
                        {market?.agreements.some(row => row.playerId === player.id) ? "Verbal agreement" : "Review offer"}
                      </Button>
                      <GmConfirmAction label="Renounce" title={"Renounce " + player.name + "'s rights?"} confirmLabel="Renounce rights" onConfirm={() => renounceRights(player.id)}><p>Clear the ${(player.lastSalaryM ?? 0).toFixed(2)}M cap hold. You lose his Bird signing path and any restricted matching rights.</p><p>You can still make a legal offer with cap room or an available exception.</p></GmConfirmAction>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {activeTab === "market" || activeTab === "positional" ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="fa-q">Search</Label>
              <Input
                id="fa-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={cn("gm-nav__link", pos === "ALL" && "is-active")}
                onClick={() => setPos("ALL")}
              >
                All
              </button>
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cn("gm-nav__link", pos === p && "is-active")}
                  onClick={() => setPos(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
              />
              My rights
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={onlyWatch}
                onChange={(e) => setOnlyWatch(e.target.checked)}
              />
              Watchlist
            </label>
          </div>

          {activeTab === "positional" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {POSITIONS.map((position) => {
                const list = filtered.filter((p) => p.position === position).slice(0, 6);
                return (
                  <section
                    key={position}
                    className="overflow-hidden rounded-xl border border-border"
                  >
                    <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {position}
                    </div>
                    <ul className="divide-y divide-border">
                      {list.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                          <GmPlayerPortrait player={p} />
                          <button
                            type="button"
                            className="text-left font-semibold hover:underline"
                            onClick={() => loadAsk(p)}
                          >
                            {displayPlayerName(p)}
                          </button>
                          <span className="ml-2 text-muted-foreground">
                            {displayOverall(p)} · ${askingSalary(p, rules).toFixed(1)}M
                          </span>
                        </li>
                      ))}
                      {!list.length ? (
                        <li className="px-3 py-4 text-sm text-muted-foreground">Empty</li>
                      ) : null}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Pos</th>
                    <th className="px-3 py-2">Age</th>
                    <th className="px-3 py-2">OVR</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Ask</th>
                    <th className="px-3 py-2">Interest</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.slice(0, 80).map((p) => {
                    const interest = (market?.pending ?? []).filter(
                      (row) => row.playerId === p.id
                    );
                    const agreed = (market?.agreements ?? []).find(
                      (row) => row.playerId === p.id
                    );
                    const ask = askingSalary(p, rules);
                    const askY = askingYears(p, rules);
                    const watched = (market?.watchlist ?? []).includes(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={cn(selectedId === p.id && "bg-secondary/50")}
                      >
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2"><GmPlayerPortrait player={p} />
                          <button type="button" aria-label={"Review terms for " + p.name} disabled={!open || Boolean(agreed)} onClick={() => loadAsk(p)} className="min-h-11 text-left font-medium underline decoration-border underline-offset-4 hover:decoration-current disabled:no-underline disabled:opacity-60">
                            {displayPlayerName(p)}<span className="block text-xs text-muted-foreground sm:hidden">Review offer</span>
                          </button></div>
                          {p.rightsKind === "restricted" ? (
                            <span className="ml-1 text-xs text-muted-foreground">RFA</span>
                          ) : p.rightsTeamId === league.userTeamId ? (
                            <span className="ml-1 text-xs text-muted-foreground">Bird</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{p.position}</td>
                        <td className="px-3 py-2">{p.age}</td>
                        <td className="px-3 py-2 tabular-nums">{displayOverall(p)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {agreed
                            ? "Verbal agreement"
                            : p.rightsKind === "restricted"
                              ? "RFA"
                              : "UFA"}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          ${ask.toFixed(1)}M / {askY}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {agreed
                            ? `Agreed ${league.teams.find((t) => t.id === agreed.teamId)?.abbr}`
                            : interest.length
                              ? `${interest.length} offer${interest.length === 1 ? "" : "s"}`
                              : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => toggleWatch(p.id)}
                            >
                              {watched ? "Watching" : "Watch"}
                            </Button>
                            <Button size="sm" variant="outline" disabled={!open || Boolean(agreed)} aria-label={"Review offer for " + p.name} onClick={() => loadAsk(p)}>Review offer</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {activeTab === "offers" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Pending
            </div>
            <ul className="divide-y divide-border">
              {myOffers.map((row) => {
                const player = league.players.find((p) => p.id === row.playerId);
                if (!player) return null;
                return (
                  <li key={row.id} className="px-3 py-2.5 text-sm">
                    <p className="flex items-center gap-2 font-semibold"><GmPlayerPortrait player={player} />{displayPlayerName(player)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {row.kind} · ${row.salaryM.toFixed(1)}M / {row.years} yrs
                      {row.responseNote ? ` · ${row.responseNote}` : ""}
                    </p>
                  </li>
                );
              })}
              {!myOffers.length ? (
                <li className="px-3 py-6 text-sm text-muted-foreground">No pending offers.</li>
              ) : null}
            </ul>
          </section>
          <section className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Verbal agreements (unsigned)
            </div>
            <ul className="divide-y divide-border">
              {myAgreements.map((row) => {
                const player = league.players.find((p) => p.id === row.playerId);
                if (!player) return null;
                return (
                  <li key={row.id} className="px-3 py-2.5 text-sm">
                    <p className="flex items-center gap-2 font-semibold"><GmPlayerPortrait player={player} />{displayPlayerName(player)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      ${row.salaryM.toFixed(1)}M / {row.years} yrs · unsigned; reserves room until signing opens
                    </p>
                  </li>
                );
              })}
              {!myAgreements.length ? (
                <li className="px-3 py-6 text-sm text-muted-foreground">
                  No commitments yet.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {activeTab === "recap" ? (
        <section className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Daily / recent moves
          </div>
          <ul className="divide-y divide-border">
            {(market?.dayRecap?.length ? market.dayRecap : market?.recap ?? [])
              .slice(0, 20)
              .map((line, i) => (
                <li key={`${i}-${line.slice(0, 20)}`} className="px-3 py-2 text-sm text-muted-foreground">
                  {line}
                </li>
              ))}
            {!market?.recap?.length && !market?.dayRecap?.length ? (
              <li className="px-3 py-6 text-sm text-muted-foreground">
                Advance a day to build the recap.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
