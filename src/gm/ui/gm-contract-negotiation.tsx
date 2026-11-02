"use client";

import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { TeamLogo } from "@/components/brand/team-logo";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { displayOverall, userTeam } from "@/gm/lib/selectors";
import { askingSalary, askingYears, minimumAcceptableSalary } from "@/gm/engine/free-agency-ask";
import { evaluateOfferUtility, faPersonality } from "@/gm/engine/fa-utility";
import { capStatus, maxSalaryForAge } from "@/gm/engine/cap";
import { cbaSeason } from "@/gm/engine/season-flow-state";
import type { GmLeagueState, GmPlayer } from "@/gm/types";

type Props = {
  league: GmLeagueState;
  player: GmPlayer;
  mode: "free-agency" | "extension";
  salaryM: number;
  years: number;
  onSalaryChange: (value: number) => void;
  onYearsChange: (value: number) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitLabel: string;
  legalMessage?: string;
  onClose?: () => void;
  maxSalaryM?: number;
  maxYears?: number;
  startsSeason?: number;
};

const round = (n: number) => Math.round(n * 100) / 100;
const formatM = (n: number) => "$" + n.toFixed(2) + "M";

export function GmContractNegotiation({
  league, player, mode, salaryM, years, onSalaryChange, onYearsChange,
  onSubmit, canSubmit, submitLabel, legalMessage, onClose, maxSalaryM,
  maxYears = 5, startsSeason,
}: Props) {
  const team = userTeam(league);
  const cap = capStatus(team, league.players, league.settings, cbaSeason(league));
  const asking = askingSalary(player, league);
  const preferredYears = askingYears(player, league);
  const floor = minimumAcceptableSalary(player, league);
  const maximum = maxSalaryM ?? maxSalaryForAge(player.age, league.settings);
  const offerTotal = salaryM * years;
  const own = player.teamId === league.userTeamId || player.rightsTeamId === league.userTeamId;
  const utility = evaluateOfferUtility(league, player, team, salaryM, years);
  const ratio = asking > 0 ? salaryM / asking : 0;
  const interest = Math.round(Math.max(0, Math.min(100,
    55 + (ratio - 1) * 115 + (years - preferredYears) * 5 +
    (own ? 9 : 0) + (player.morale - 50) * 0.10
  )));
  const line = player.seasonLine?.gp ? player.seasonLine : player.nbaSeason;
  const identityTeam = player.teamId ?? player.rightsTeamId ?? league.userTeamId;
  const late = league.faMarket?.stage === "fill";
  const rangeFloor = mode === "extension" ? floor : minimumAcceptableSalary(player, league, late);
  const belowRange = salaryM + 0.05 < rangeFloor;
  const role = faPersonality(player);
  const agentRead = !Number.isFinite(salaryM) || salaryM <= 0
    ? "Enter a valid contract amount."
    : belowRange
      ? "Below the range his agent is willing to consider."
      : salaryM + 0.05 < asking
        ? "Competitive only if role, winning and continuity work in your favor."
        : years < preferredYears
          ? "Salary works, but the player prefers more security."
          : "Terms meet the player's published market expectations.";
  const futureRoom = cap.capRoomM - (mode === "extension" ? 0 : salaryM);
  const valueOptions = [rangeFloor, asking, maximum]
    .filter((v, index, list) => Number.isFinite(v) && v > 0 && list.findIndex(a => Math.abs(a - v) < 0.01) === index);

  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      style={teamColorStyle(identityTeam)}
      data-testid="gm-contract-negotiation"
      aria-label={"Contract negotiation for " + player.name}
    >
      <div className="h-1 w-full bg-[var(--team-primary)]" />
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {mode === "extension" ? "Contract extension / Agent meeting" : "Free agency / Agent meeting"}
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">Negotiate terms</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TeamLogo teamKey={league.userTeamId} size="sm" />
          <span>{team.city} {team.name}</span>
          {onClose ? <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 font-semibold text-foreground hover:bg-secondary" aria-label="Close negotiation">Close</button> : null}
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <div className="border-b border-border p-4 lg:border-b-0 lg:border-r sm:p-5">
          <div className="flex items-center gap-4">
            <GmPlayerPortrait player={player} size="lg" priority />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{player.position} / {player.age} years old</p>
              <p className="mt-1 text-xl font-bold tracking-tight">{player.name}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <TeamLogo teamKey={identityTeam} size="xs" />
                <span>{player.rightsKind === "restricted" ? "Restricted" : player.rightsTeamId ? "Bird / prior-team rights" : "Unrestricted"} · {role}</span>
              </div>
            </div>
            <div className="ml-auto flex min-w-14 flex-col items-center border-l border-border pl-3">
              <strong className="text-2xl tabular-nums">{displayOverall(player)}</strong>
              <span className="text-[10px] font-semibold text-muted-foreground">OVR</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Season</p><strong className="tabular-nums">{line && line.gp > 0 ? line.gp + " GP" : "—"}</strong></div>
            <div><p className="text-xs text-muted-foreground">Scoring</p><strong className="tabular-nums">{line && line.gp > 0 ? (line.pts / line.gp).toFixed(1) + " PPG" : "—"}</strong></div>
            <div><p className="text-xs text-muted-foreground">Minutes</p><strong className="tabular-nums">{line && line.gp > 0 ? (line.min / line.gp).toFixed(1) + " MPG" : "—"}</strong></div>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Agent's annual ask</span><strong className="tabular-nums">{formatM(asking)}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Preferred term</span><strong>{preferredYears} years</strong></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Salary cap room</span><strong className="tabular-nums">{formatM(cap.capRoomM)}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Pending offer reservations</span><strong className="tabular-nums">{formatM((league.faMarket?.reservations ?? []).filter(v => v.teamId === league.userTeamId).reduce((sum,v) => sum + v.salaryM, 0))}</strong></div>
          </div>
        </div>
        <form className="flex min-w-0 flex-col p-4 sm:p-5" onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit(); }}>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contract proposal</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Annual salary ($M)
              <input type="number" min="0.01" max={maximum} step="0.01" value={Number.isFinite(salaryM) ? salaryM : ""} onChange={e => onSalaryChange(Number(e.target.value))} aria-label={"Annual salary offer for " + player.name} className="mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-base tabular-nums" />
            </label>
            <label className="text-xs font-semibold">Guaranteed years
              <select value={years} onChange={e => onYearsChange(Number(e.target.value))} aria-label={"Contract years for " + player.name} className="mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-base">
                {Array.from({ length: maxYears }, (_, i) => i + 1).map(value => <option key={value} value={value}>{value} year{value === 1 ? "" : "s"}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Quick terms</span>
            {valueOptions.map((value,i) => <button key={i} type="button" className="rounded-md border border-border px-2.5 py-1.5 font-semibold hover:bg-secondary" onClick={() => onSalaryChange(round(value))}>{i === 0 ? "Floor" : i === 1 ? "Market" : "Max"} {formatM(value)}</button>)}
          </div>
          <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">Estimated agent interest</p><strong className="text-[22px] tabular-nums">{interest}%</strong></div>
              <span className="text-xs font-semibold">{salaryM + 0.05 >= asking ? "At/above ask" : belowRange ? "Below range" : "In negotiation"}</span>
            </div>
            <div role="meter" aria-label="Estimated agent interest" aria-valuemin={0} aria-valuemax={100} aria-valuenow={interest} className="mt-2 h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-[var(--team-primary)] transition-[width]" style={{ width: interest + "%" }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{agentRead}</p>
            <p className="mt-1 text-xs text-muted-foreground">Team outlook / role / loyalty also affect the player's decision. This meter is an estimate, not a guarantee.</p>
            {mode === "free-agency" ? <p className="mt-2 text-xs text-muted-foreground">Fit {Math.round(utility.fit)} · Role {Math.round(utility.role)} · Winning {Math.round(utility.winning)} · Loyalty {Math.round(utility.continuity)}</p> : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border p-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Total guarantee</p><strong className="tabular-nums">{formatM(offerTotal)}</strong></div>
            <div><p className="text-xs text-muted-foreground">{mode === "extension" ? "New term begins" : "Projected room after offer"}</p><strong className="tabular-nums">{mode === "extension" ? String(startsSeason ?? "Future") : formatM(futureRoom)}</strong></div>
          </div>
          {legalMessage ? <p role="status" className="mt-3 text-xs font-medium text-destructive">{legalMessage}</p> : null}
          <button type="submit" disabled={!canSubmit} className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{submitLabel}</button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Offers are subject to cap rules and the player's competing options. No signing is guaranteed.</p>
        </form>
      </div>
    </section>
  );
}
