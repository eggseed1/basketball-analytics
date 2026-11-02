"use client";

import { useState } from "react";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { BADGES, BADGE_LEVELS, badgeLevel, ensureBadges } from "@/gm/engine/badges";
import { activeMentor, mentorEligible, mentorshipBonus, mentorshipSlots } from "@/gm/engine/development";
import { useGmStore } from "@/gm/state/gm-store";
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

export function GmIndividualTraining({ roster }: { roster: GmPlayer[] }) {
  const [selected, setSelected] = useState("");
  const setFocus = useGmStore(state => state.setDevelopmentFocus);
  const setPlan = useGmStore(state => state.setDevelopmentPlan);
  const player = roster.find(row => row.id === selected) ?? roster[0];
  if (!player) return <p className="text-sm text-muted-foreground">No players available.</p>;
  return <div className="grid gap-4 sm:grid-cols-3">
    <label className="grid gap-1.5 text-sm font-medium">Player
      <select className={control} aria-label="Training player" value={player.id}
        onChange={event => setSelected(event.target.value)}>
        {roster.map(row => <option key={row.id} value={row.id}>{row.name} · {row.position}</option>)}
      </select>
    </label>
    <label className="grid gap-1.5 text-sm font-medium">Skill focus
      <select className={control} aria-label={`Development focus for ${player.name}`}
        value={player.developmentFocus ?? "balanced"}
        onChange={event => setFocus(player.id, event.target.value as NonNullable<GmPlayer["developmentFocus"]>)}>
        {["balanced", "shooting", "creation", "defense", "rebounding"].map(focus =>
          <option key={focus} value={focus}>{focus[0]!.toUpperCase() + focus.slice(1)}</option>)}
      </select>
    </label>
    <label className="grid gap-1.5 text-sm font-medium">Development plan
      <select className={control} aria-label={`Development plan for ${player.name}`}
        value={player.developmentPlan ?? "balanced"}
        onChange={event => setPlan(player.id, event.target.value as NonNullable<GmPlayer["developmentPlan"]>)}>
        <option value="balanced">Balanced reps</option>
        <option value="practice">Skills work</option>
        <option value="rotation">Rotation reps</option>
      </select>
    </label>
    {player.sheet?.developmentReport ? <p className="text-xs text-muted-foreground sm:col-span-3">
      Latest: {player.sheet.developmentReport.gains.join(", ")}
    </p> : null}
  </div>;
}
