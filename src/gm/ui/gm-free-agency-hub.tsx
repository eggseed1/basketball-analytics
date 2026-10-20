"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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
import { getCbaRules } from "@/gm/myleague/cba-registry";
import {
  displayOverall,
  displayPlayerName,
  userCap,
  userTeam,
} from "@/gm/lib/selectors";
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
  if (stage === "rights") return "rights";
  if (stage === "fill") return "recap";
  return "market";
}

export function GmFreeAgencyHub() {
  const league = useGmStore((s) => s.league);
  const advanceFaDay = useGmStore((s) => s.advanceFaDay);
  const runCpuSignings = useGmStore((s) => s.runCpuSignings);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const openFreeAgency = useGmStore((s) => s.openFreeAgency);
  const signFreeAgent = useGmStore((s) => s.signFreeAgent);
  const resignOwn = useGmStore((s) => s.resignOwnFreeAgent);
  const renounceRights = useGmStore((s) => s.renounceRights);
  const decideTeamOption = useGmStore((s) => s.decideTeamOption);
  const tenderQo = useGmStore((s) => s.tenderQualifyingOffer);
  const declineQo = useGmStore((s) => s.declineQualifyingOffer);
  const matchSheet = useGmStore((s) => s.matchOfferSheet);
  const declineSheet = useGmStore((s) => s.declineOfferSheet);
  const toggleWatch = useGmStore((s) => s.toggleFaWatchlist);
  const lastFaNote = useGmStore((s) => s.lastFaNote);

  const [tab, setTab] = useState<HubTab | null>(null);
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
  const activeTab = tab ?? (open ? stageTab(market?.stage) : "overview");
  const rules = getCbaRules(league.season);
  const cap = userCap(league);
  const team = userTeam(league);
  const sheet = capStatus(team, league.players, league.settings, league.season);

  const filtered = agents.filter((p) => {
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
  }

  const verdict = selected
    ? evaluateSigning(league, league.userTeamId, selected, salary, years)
    : null;

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
            {league.settings.maxRoster} · holds ${sheet.holdsM.toFixed(1)}M · MLE $
            {sheet.mleRemainingM.toFixed(1)}M
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!open ? (
            league.phase === "draft" || league.phase === "offseason" ? (
              <Button onClick={() => openFreeAgency()}>Open free agency</Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Finish the season and draft first.{" "}
                <Link href="/gm" className="underline">
                  Home
                </Link>
              </p>
            )
          ) : (
            <>
              <Button onClick={() => advanceFaDay()} disabled={Boolean(market?.done)}>
                Advance day
              </Button>
              <Button variant="outline" onClick={() => runCpuSignings()}>
                Sim to quiet
              </Button>
              {market?.done ? (
                <Button onClick={() => runOffseason()}>Start next season</Button>
              ) : null}
            </>
          )}
        </div>
      </header>

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
            onClick={() => setTab(row.id)}
          >
            {row.label}
          </button>
        ))}
      </nav>

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
            Your team options
          </div>
          {options.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No team options waiting. Player options are decided by the player —
              Advance day resolves them.
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
                    {row.salaryM.toFixed(1)}M team option
                  </span>
                  <span className="flex gap-1">
                    <Button
                      size="xs"
                      onClick={() => decideTeamOption(row.player.id, "exercise")}
                    >
                      Exercise
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => decideTeamOption(row.player.id, "decline")}
                    >
                      Decline
                    </Button>
                  </span>
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
                  <span>
                    {displayPlayerName(row.player)} · ${row.amountM.toFixed(1)}M QO ·{" "}
                    {row.status}
                  </span>
                  {row.status === "eligible" || !row.player.qoStatus ? (
                    <span className="flex gap-1">
                      <Button size="xs" onClick={() => tenderQo(row.player.id)}>
                        Tender
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
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
                    <span>
                      {displayPlayerName(player)} · {player.rightsKind ?? "UFA"} · hold $
                      {(player.lastSalaryM ?? 0).toFixed(1)}M · ask $
                      {askingSalary(player, rules).toFixed(1)}M
                      {preview.ok ? (
                        <span className="ml-1 text-[12px] text-muted-foreground">
                          (renounce → room ${preview.roomAfterM.toFixed(1)}M)
                        </span>
                      ) : null}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        size="xs"
                        onClick={() => resignOwn(player.id)}
                        disabled={!open || Boolean(market?.done)}
                      >
                        Re-sign at ask
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => renounceRights(player.id)}
                      >
                        Renounce
                      </Button>
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="fa-sal">Salary ($M)</Label>
              <Input
                id="fa-sal"
                type="number"
                value={salary}
                onChange={(e) => setSalary(Number(e.target.value))}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="fa-yrs">Years</Label>
              <Input
                id="fa-yrs"
                type="number"
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="w-20"
              />
            </div>
          </div>

          {selected && verdict ? (
            <p
              className={cn(
                "text-[13px]",
                verdict.ok ? "text-muted-foreground" : "text-amber-300"
              )}
            >
              {verdict.ok
                ? `Legal via ${verdict.via.replaceAll("_", " ")}. First-year charge $${salary.toFixed(1)}M.`
                : verdict.reason}
            </p>
          ) : null}

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
                        <li key={p.id} className="px-3 py-2 text-[13px]">
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
                          {displayPlayerName(p)}
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
                            ? "Committed"
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
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={!open}
                              onClick={() => loadAsk(p)}
                            >
                              Load ask
                            </Button>
                            <Button
                              size="xs"
                              disabled={
                                !open ||
                                Boolean(market?.done) ||
                                cap.rosterSize >= league.settings.maxRoster ||
                                Boolean(agreed && agreed.teamId !== league.userTeamId)
                              }
                              onClick={() => {
                                setSelectedId(p.id);
                                signFreeAgent(p.id, salary, years);
                              }}
                            >
                              {market?.stage === "moratorium"
                                ? "Pitch"
                                : p.rightsKind === "restricted" &&
                                    p.rightsTeamId !== league.userTeamId
                                  ? "Offer sheet"
                                  : "Offer"}
                            </Button>
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
                    <p className="font-semibold">{displayPlayerName(player)}</p>
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
              Moratorium commitments
            </div>
            <ul className="divide-y divide-border">
              {myAgreements.map((row) => {
                const player = league.players.find((p) => p.id === row.playerId);
                if (!player) return null;
                return (
                  <li key={row.id} className="px-3 py-2.5 text-sm">
                    <p className="font-semibold">{displayPlayerName(player)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      ${row.salaryM.toFixed(1)}M / {row.years} yrs · reserves room until open
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
