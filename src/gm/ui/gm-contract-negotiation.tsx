"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { GmOfferSliders } from "@/gm/ui/gm-offer-sliders";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { ClubMark } from "@/gm/ui/club-mark";
import { cn } from "@/lib/utils";
import { useGmStore } from "@/gm/state/gm-store";
import { displayOverall, displayPlayerName } from "@/gm/lib/selectors";
import { overallOf } from "@/gm/engine/lineup";
import { extensionQuote, extensionInterest, extensionSalaryTarget } from "@/gm/engine/extensions";
import { GmContractSigningCelebration } from "@/gm/ui/gm-contract-signing-celebration";
import { exceptionAmounts } from "@/gm/engine/cap";
import { askingSalary, askingYears } from "@/gm/engine/free-agency-ask";
import { faPlayerPriorities, evaluateOfferUtility, faPersonality } from "@/gm/engine/fa-utility";
import { faLocationPreferences, teamLocationSummary } from "@/gm/engine/fa-location";
import {
  legalFreeAgentSalaryRange, competingFreeAgentOffers, maxFreeAgentYears,
  projectFreeAgentResponse,
} from "@/gm/engine/fa-offer-projection";
import type { GmPlayer } from "@/gm/types";

const money = (m: number) => "$" + m.toFixed(2) + "M";
type Mode = "free-agent" | "extension";

export function GmContractNegotiation({ playerId, mode }: { playerId: string; mode: Mode }) {
  const league = useGmStore(s => s.league);
  const signFreeAgent = useGmStore(s => s.signFreeAgent);
  const extendPlayer = useGmStore(s => s.extendPlayer);
  const [offerM, setOfferM] = useState<number | null>(null);
  const [offerYears, setOfferYears] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [celebration, setCelebration] = useState<{ salaryM: number; years: number; extension: boolean } | null>(null);

  const player = league?.players.find(p => p.id === playerId) ?? null;
  const userTeam = league?.teams.find(t => t.id === league.userTeamId) ?? null;
  const isExtension = mode === "extension";
  const back = isExtension ? "/gm/contracts" : "/gm/free-agency";
  const title = isExtension ? "Contract extension" : "Free-agent negotiations";

  // Cache only derived negotiation facts; changing a salary slider does not
  // mutate the league or roll a fresh player preference.
  const quote = useMemo(() => league && player && isExtension ? extensionQuote(league, player) : null,
    [league, player, isExtension]);
  const ask = league && player ? isExtension ? quote?.askingSalaryM ?? 0 : askingSalary(player, league) : 0;
  const askYears = league && player ? isExtension ? Math.min(3, quote?.maxYears ?? 4) :
    askingYears(player, league) : 1;
  const maxYears = league && player ? isExtension ? quote?.maxYears ?? 1 :
    maxFreeAgentYears(league, player) : 1;
  const minYears = !isExtension && league && player && player.rightsKind === "restricted" &&
    player.rightsTeamId !== league.userTeamId ? 2 : 1;
  const years = Math.max(minYears, Math.min(maxYears, offerYears ?? askYears));
  const range = league && player && !isExtension
    ? legalFreeAgentSalaryRange(league, player, years) : null;
  const minSalary = league ? exceptionAmounts(league.settings).minimumM : 1;
  const min = isExtension ? minSalary : range?.minM ?? minSalary;
  const max = isExtension ? quote?.maxSalaryM ?? 0 : range?.maxM ?? 0;
  const salary = Math.max(min, Math.min(Math.max(min, max), offerM ?? ask));
  const pending = league?.faMarket?.pending.find(o => o.playerId === playerId && o.teamId === league.userTeamId);
  const agreement = league?.faMarket?.agreements.find(o => o.playerId === playerId);
  const rivals = league && player && !isExtension ? competingFreeAgentOffers(league, player) : [];
  const projection = league && player && !isExtension
    ? projectFreeAgentResponse(league, player, salary, years) : null;
  const ready = isExtension ? Boolean(quote?.eligible && salary >= min && salary <= max + .05) :
    Boolean(projection?.legal && range && range.maxM >= range.minM);
  const chance = isExtension && quote && player && league
    ? extensionInterest(league, player, quote, salary, years) : projection?.chance ?? 0;
  const signal = chance >= 66 ? "strong" : chance >= 34 ? "possible" : "unlikely";
  const stage = league?.faMarket?.stage;
  const verbal = stage === "re_signing" || stage === "moratorium";
  const isRfa = !isExtension && Boolean(player?.rightsKind === "restricted" &&
    player?.rightsTeamId !== league?.userTeamId);
  const own = !isExtension && player?.rightsTeamId === league?.userTeamId;
  const phaseLabel = isExtension ? "Future contract" : verbal ? "Negotiation window" :
    stage === "open" ? "Open signing" : stage === "fill" ? "Late signings" : "Market not open";
  const submitLabel = isExtension ? "Offer extension" : isRfa ? "Submit offer sheet" :
    verbal ? "Request verbal agreement" : "Offer contract";

  const priorities = player ? faPlayerPriorities(player) : [];
  const location = player ? faLocationPreferences(player) : null;
  const offerUtility = league && player && userTeam && !isExtension
    ? evaluateOfferUtility(league, player, userTeam, salary, years) : null;
  const styleFit = userTeam && player && location ? teamLocationSummary(userTeam) : null;
  const snapshot = league?.faMarket?.dayRecap?.slice(0, 3) ?? [];

  if (!league || !player || !userTeam) {
    return <div className="space-y-3">
      <Link href={back} className="text-sm underline underline-offset-4">Back to {isExtension ? "contracts" : "free agency"}</Link>
      <p className="text-sm text-muted-foreground">Load a franchise to negotiate with this player.</p>
    </div>;
  }

  const playerAvailable = isExtension ? Boolean(quote?.eligible) :
    player.teamId === null && !agreement && league.phase === "free_agency";
  const canSend = ready && playerAvailable && !feedback?.ok;
  const disabledNote = isExtension ? quote?.reason :
    agreement ? "Another club has a verbal agreement with this player." :
    player.teamId ? "This player is already under contract." :
    projection?.reason ?? range?.reason;
  const agentNote = isExtension
    ? !quote?.eligible ? quote?.reason ?? "The extension window is closed." :
      salary + .05 >= extensionSalaryTarget(quote, years)
        ? "This offer meets his term-adjusted asking price. He is ready to extend."
        : "He wants around $" + extensionSalaryTarget(quote, years).toFixed(1) +
          "M per year for this term. More salary or more guaranteed years helps."
    : projection?.note ?? "Review the contract rules before sending an offer.";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    if (isExtension) {
      const result = extendPlayer(playerId, salary, years);
      setFeedback({ ok: result.ok, message: result.reason });
      if (result.ok && useGmStore.getState().league?.players.find(p => p.id === playerId)?.contract?.extension) {
        setCelebration({ salaryM: salary, years, extension: true });
      }
    } else {
      const result = signFreeAgent(playerId, salary, years);
      // A rejected *immediate* offer can still be recorded on the league
      // market as pending, so do not discard the game engine's response.
      setFeedback({ ok: result.ok, message: result.note ?? result.reason ?? "Offer recorded." });
      // A pending offer or verbal promise is not a signed contract. Celebrate
      // only once the actual league state has the new player-team contract.
      if (result.ok && useGmStore.getState().league?.players.find(p => p.id === playerId)?.teamId === userTeam.id) {
        setCelebration({ salaryM: salary, years, extension: false });
      }
    }
  }

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
    {celebration ? <GmContractSigningCelebration player={player} teamId={userTeam.id}
      teamName={userTeam.city + " " + userTeam.name} salaryM={celebration.salaryM}
      years={celebration.years} extension={celebration.extension}
      onClose={() => setCelebration(null)} /> : null}
    <div className="flex items-center justify-between gap-3">
      <Link href={back} className="text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">
        ← Back to {isExtension ? "contracts" : "free agency"}
      </Link>
      <span className="rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
        {phaseLabel}
      </span>
    </div>

    <header className="overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <GmPlayerPortrait player={player} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{displayPlayerName(player)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {player.position}{player.secondaryPosition ? "/" + player.secondaryPosition : ""} · Age {player.age} · {displayOverall(player)} OVR
            {own ? " · Your Bird/contract rights" : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-secondary px-2 py-1">{faPersonality(player) === "opportunity" ? "Wants minutes" :
              faPersonality(player) === "contention" ? "Contender-minded" :
              faPersonality(player) === "security" ? "Values security" : "Values familiarity"}</span>
            <span className="rounded-md bg-secondary px-2 py-1">Seeking {money(ask)} / yr · {askYears} yr{askYears === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/50 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">Negotiating with</p>
          <div className="mt-1 font-semibold"><ClubMark teamId={userTeam.id} label={userTeam.abbr}/></div>
        </div>
      </div>
    </header>

    {feedback ? <div role="status" className={cn("rounded-xl border p-4 text-sm font-medium",
      feedback.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10")}>
      {feedback.message}
      {feedback.ok ? <Link href={back} className="ml-2 underline underline-offset-4">Return to {isExtension ? "contracts" : "market"}</Link> : null}
    </div> : null}

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(290px,0.8fr)]">
      <div className="space-y-4">
        <section aria-label="Contract offer" className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">Your contract offer</h2>
            <span className="text-xs text-muted-foreground">{isExtension ? "Future annual salary" : range?.via ? range.via.replaceAll("_", " ") : "CBA limits apply"}</span>
          </div>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Move the salary slider to see how the pitch changes. The maximum is the most your team can legally offer with its current cap room, rights and exceptions.
          </p>
          <form onSubmit={submit}>
            <GmOfferSliders prefix={isExtension ? "extension" : "fa"} salaryM={salary}
              setSalaryM={value => { setOfferM(value); setFeedback(null); }}
              minM={min} maxM={max} years={years}
              setYears={value => { setOfferYears(value); setFeedback(null); }}
              minYears={minYears} maxYears={maxYears} chance={chance} status={signal}
              interestLabel={isExtension ? "Extension readiness" : "Estimated interest"} disabled={!playerAvailable}/>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">From his agent</p>
                <p className="mt-1 text-sm">{agentNote}</p>
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={!canSend}>{submitLabel}</Button>
              {!ready || !playerAvailable ? <p className="text-xs text-amber-600 dark:text-amber-400">{disabledNote ?? "This offer is below his requirements or outside your legal signing capacity."}</p> : null}
              {isExtension ? <p className="text-xs text-muted-foreground">
                Your current-year salary remains in place; the extension starts in {quote?.startsSeason}. Salary and guaranteed years both affect his willingness to extend.
              </p> : <p className="text-xs text-muted-foreground">
                {isRfa ? "Restricted free agents can sign offer sheets during the moratorium. The rights holder gets two market days to match." :
                  verbal ? "During the moratorium most accepted proposals are verbal agreements, not signed contracts. They reserve room until signing opens." :
                  "An offer can be accepted immediately or stay pending as teams compete. Continue the market to get another response."}
              </p>}
            </div>
          </form>
        </section>

        {!isExtension ? <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Offers from other teams</h2>
            <span className="text-xs text-muted-foreground">{rivals.length} on the board</span>
          </div>
          {rivals.length ? <ul className="mt-3 divide-y divide-border">
            {rivals.map(offer => {
              const club = league.teams.find(t => t.id === offer.teamId);
              if (!club) return null;
              return <li key={offer.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <ClubMark teamId={club.id} label={club.abbr} />
                  <p className="mt-1 text-xs text-muted-foreground">{offer.kind === "agreement" ? "Verbal agreement" :
                    offer.kind === "offer_sheet" ? "Offer sheet" : "Market offer"} · {teamLocationSummary(club)}</p>
                </div>
                <p className="shrink-0 text-right font-semibold tabular-nums">{money(offer.salaryM)} / yr
                  <span className="block text-xs font-normal text-muted-foreground">{offer.years} years</span>
                </p>
              </li>;
            })}
          </ul> : <p className="mt-3 text-sm text-muted-foreground">
            No other recorded offers yet. Teams can make new proposals when you advance the market.
          </p>}
          {pending ? <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm">
            Your existing offer: <strong>{money(pending.salaryM)} for {pending.years} years</strong>.
            {pending.responseNote ? " " + pending.responseNote : " Waiting for a player decision."}
          </p> : null}
          {agreement ? <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm">
            A verbal agreement is on record with {league.teams.find(t => t.id === agreement.teamId)?.abbr ?? "another club"}. It finalizes in the signing window.
          </p> : null}
        </section> : null}
      </div>

      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-base font-bold">What he&apos;s looking for</h2>
          <p className="mt-1 text-xs text-muted-foreground">Agent scouting projections, not confirmed statements from the real player.</p>
          <div className="mt-4 space-y-3">
            {priorities.map(priority => <div key={priority.id} className="space-y-1">
              <div className="flex justify-between gap-3 text-sm"><span>{priority.title}</span>
                <span className="font-semibold tabular-nums">{Math.round(priority.weight * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary"><div className="h-full rounded-full bg-foreground/65"
                style={{ width: (priority.weight / .45 * 100) + "%" }} /></div>
            </div>)}
          </div>
          {location ? <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-xs">
            <p className="font-semibold">Personal preferences</p>
            <p className="mt-1">{location.climateLabel} · {location.marketLabel}</p>
            <p className="mt-1 text-muted-foreground">Your city: {styleFit}</p>
          </div> : null}
        </section>
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-base font-bold">Why he might choose you</h2>
          <p className="mt-1 text-xs text-muted-foreground">How the agent currently rates the fit (0–100).</p>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              { label: "Chance to win", value: offerUtility?.winning },
              { label: "Role and minutes", value: offerUtility?.role },
              { label: "Team direction", value: offerUtility?.fit },
              { label: "Familiarity", value: offerUtility?.continuity },
              { label: "City and lifestyle", value: offerUtility?.location },
            ].map(row => <div key={row.label} className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-semibold tabular-nums">{row.value == null ? "—" : Math.round(row.value) + "/100"}</dd>
            </div>)}
          </dl>
          {isExtension && quote ? <p className="mt-3 text-xs text-muted-foreground">
            {quote.kind === "rookie" ? "Rookie" : "Veteran"} extension · maximum {money(quote.maxSalaryM)}/yr, {quote.maxYears} added years.
          </p> : null}
        </section>
        {!isExtension && snapshot.length ? <section className="rounded-xl border border-border bg-secondary/20 p-4">
          <h2 className="text-sm font-semibold">Latest market activity</h2>
          <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
            {snapshot.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </section> : null}
        <Link href={back} className={buttonVariants({ variant: "outline", className: "w-full" })}>
          Back to {isExtension ? "contracts" : "free-agent market"}
        </Link>
      </div>
    </div>
    {isExtension && overallOf(player) >= 80 ? <p className="text-xs text-muted-foreground">
      Long-term security and a winning role also influence whether a player prefers extending today versus testing the market. The game honors existing extension eligibility and asking-price rules.
    </p> : null}
  </div>;
}
