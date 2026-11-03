"use client";

import { useState } from "react";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { BADGES, BADGE_LEVELS, badgeLevel, ensureBadges } from "@/gm/engine/badges";
import { activeMentor, mentorEligible, mentorshipBonus, mentorshipSlots } from "@/gm/engine/development";
import { useGmStore } from "@/gm/state/gm-store";
import { developmentOutlook } from "@/gm/engine/development-profile";
import type { GmLeagueState, GmPlayer } from "@/gm/types";

const control = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function GmMentorshipCards({ league, roster }: { league: GmLeagueState; roster: GmPlayer[] }) {
  const assign = useGmStore(state => state.assignMentorshipSlot);
  const [draftMentees, setDraftMentees] = useState<[string | null, string | null]>([null, null]);
  const slots = mentorshipSlots(league);
  const eligibleMentees = roster.filter(player => player.age <= 25);
  const pickDraft = (slot: 0 | 1, id: string | null) =>
    setDraftMentees(previous => slot === 0 ? [id, previous[1]] : [previous[0], id]);

  return <section aria-label="Mentorship" data-testid="mentorship-cards" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold">Mentorship</h2>
        <p className="text-xs text-muted-foreground">Pair up to two young players with same-position veterans.</p>
      </div>
      <span className="text-xs font-semibold text-muted-foreground">
        {slots.filter(Boolean).length}/2 active
      </span>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      {([0, 1] as const).map(slot => {
        const current = slots[slot];
        const chosenId = draftMentees[slot] ?? current?.id ?? "";
        const mentee = eligibleMentees.find(player => player.id === chosenId);
        const mentor = mentee && current?.id === mentee.id ? activeMentor(current, league.players) : undefined;
        const possibleMentors = mentee ? roster.filter(veteran => mentorEligible(mentee, veteran)) : [];
        const other = slots[slot === 0 ? 1 : 0];
        const teachable = mentee && mentor
          ? BADGES.filter(badge => {
              const level = badgeLevel(ensureBadges(mentor), badge.id);
              return level >= 2 && level > badgeLevel(ensureBadges(mentee), badge.id);
            }).sort((a, b) =>
              badgeLevel(ensureBadges(mentor), b.id) - badgeLevel(ensureBadges(mentor), a.id))
          : [];
        return <article key={slot} data-testid={`mentorship-slot-${slot + 1}`} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Mentorship {slot + 1}</h3>
            <span className="text-xs text-muted-foreground">{mentor ? "Active" : current ? "Replacing" : "Open"}</span>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Mentee
              <select className={control} aria-label={`Mentorship ${slot + 1} mentee`} value={chosenId}
                onChange={event => {
                  const id = event.target.value;
                  if (!id) {
                    assign(slot, null, null);
                    pickDraft(slot, null);
                  } else pickDraft(slot, id);
                }}>
                <option value="">Choose young player</option>
                {eligibleMentees.map(player =>
                  <option key={player.id} value={player.id} disabled={other?.id === player.id}>
                    {player.name} · {player.position} · {Math.round(player.sheet?.overall ?? 0)} OVR
                  </option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Mentor
              <select className={control} aria-label={`Mentorship ${slot + 1} mentor`} value={mentor?.id ?? ""}
                disabled={!mentee} onChange={event => {
                  const mentorId = event.target.value;
                  if (!mentorId) {
                    assign(slot, null, null);
                  } else if (mentee) {
                    assign(slot, mentee.id, mentorId);
                    pickDraft(slot, null);
                  }
                }}>
                <option value="">{mentee ? "Choose veteran mentor" : "Choose a mentee first"}</option>
                {possibleMentors.map(veteran => <option key={veteran.id} value={veteran.id}
                  disabled={other?.mentorship?.mentorId === veteran.id}>
                  {veteran.name} · {Math.round(veteran.sheet?.overall ?? 0)} OVR
                </option>)}
              </select>
            </label>
          </div>
          {mentee && mentor ? <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <GmPlayerPortrait player={mentee} size="sm" />
              <div className="min-w-0 text-xs">
                <p className="font-semibold">{mentee.name} + {mentor.name}</p>
                <p className="mt-1 text-muted-foreground">
                  +{Math.round(mentorshipBonus(mentee, league.players) * 100)}% growth · {mentee.mentorship?.sharedGames ?? 0} shared games
                </p>
              </div>
            </div>
            {teachable.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Mentor badges">
              {teachable.slice(0, 3).map(badge => <span key={badge.id}
                className="rounded-md border border-border px-2 py-1 text-[11px]">
                {badge.name} · {BADGE_LEVELS[badgeLevel(ensureBadges(mentor), badge.id)]}
              </span>)}
              {teachable.length > 3 ? <span className="px-1 py-1 text-xs text-muted-foreground">+{teachable.length - 3} more</span> : null}
            </div> : null}
          </div> : <p className="mt-3 text-xs text-muted-foreground">
            {!mentee ? "Choose a mentee to get started." : current && current.id !== mentee.id
              ? "Choose a mentor to replace this pairing." : possibleMentors.length
                ? "Choose a mentor to start learning badges and growing together."
                : "No eligible veteran plays this position."}
          </p>}
        </article>;
      })}
    </div>
  </section>;
}

export function GmIndividualTraining({ roster, season }: { roster: GmPlayer[]; season: number }) {
  const [selected, setSelected] = useState("");
  const setFocus = useGmStore(state => state.setDevelopmentFocus);
  const setPlan = useGmStore(state => state.setDevelopmentPlan);
  const player = roster.find(row => row.id === selected) ?? roster[0];
  if (!player) return <p className="text-sm text-muted-foreground">No players available.</p>;
  const focus = player.developmentFocus ?? "balanced";
  const labels: Record<NonNullable<GmPlayer["developmentFocus"]>, string> = {
    balanced: "Balanced", shooting: "Shooting", creation: "Shot creation",
    defense: "Defense", rebounding: "Rebounding",
  };
  const descriptions: Record<NonNullable<GmPlayer["developmentFocus"]>, string> = {
    balanced: "Build his existing strengths with broad skill work.",
    shooting: "Develop shotmaking and consistency from the line.",
    creation: "Train handle, passing and on-ball control.",
    defense: "Build the defensive skills suited to his position.",
    rebounding: "Work on positioning, strength and securing the glass.",
  };
  const outlook = developmentOutlook(player, season);
  const overall = player.sheet?.overall ?? 0;
  const previous = player.developmentBaseline?.season === season
    ? player.developmentBaseline.overall : player.sheet?.priorOverall ?? overall;
  return <section data-testid="development-path" className="rounded-xl border border-border bg-card p-4">
    <div className="mb-3">
      <h2 className="text-base font-bold">Shape a player</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick a skill direction. Playing time, practice and performance decide how much he grows.
      </p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium">Player
        <select className={control} aria-label="Training player" value={player.id}
          onChange={event => setSelected(event.target.value)}>
          {roster.map(row => <option key={row.id} value={row.id}>{row.name} · {row.age} yrs · {row.position}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Development focus
        <select className={control} aria-label={`Development focus for ${player.name}`}
          value={focus}
          onChange={event => setFocus(player.id, event.target.value as NonNullable<GmPlayer["developmentFocus"]>)}>
          {Object.entries(labels).map(([id, label]) =>
            <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{player.name} · {Math.round(overall)} OVR
          <span className="ml-2 text-xs font-normal text-muted-foreground">{outlook.label}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{descriptions[focus]}</p>
        <p className="mt-1 text-xs text-muted-foreground">{outlook.detail}</p>
        {player.sheet?.developmentReport?.gains.some(gain => gain.includes("+")) ? (
          <p className="mt-2 text-xs font-medium" data-testid="development-last-checkin">
            Last check-in: {player.sheet.developmentReport.gains.slice(0, 4).join(" · ")}
          </p>
        ) : null}
      </div>
      {Math.round(overall - previous) !== 0 ? <span className="text-sm font-bold tabular-nums text-primary">
        {overall >= previous ? "+" : ""}{Math.round(overall - previous)} OVR this season
      </span> : null}
    </div>
    <details className="mt-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Playing-time plan (optional)</summary>
      <label className="mt-3 grid max-w-xs gap-1.5 text-sm font-medium text-foreground">
        Development approach
        <select className={control} aria-label={`Development plan for ${player.name}`}
          value={player.developmentPlan ?? "balanced"}
          onChange={event => setPlan(player.id, event.target.value as NonNullable<GmPlayer["developmentPlan"]>)}>
          <option value="balanced">Balanced</option>
          <option value="practice">Practice-first</option>
          <option value="rotation">NBA rotation reps</option>
        </select>
      </label>
      <p className="mt-2">Practice protects growth with limited minutes. NBA rotation reps work best with a sustainable role, not forced 40-minute nights.</p>
    </details>
  </section>;
}
