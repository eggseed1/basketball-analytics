import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { clamp, createRng } from "@/gm/engine/rng";
import { regularSeasonComplete } from "@/gm/engine/schedule";
import { discoverDevelopment, developmentProfileOf } from "@/gm/engine/development-profile";

export const CAREER_CEILING_LIMIT = 4;
export const MAX_TEAM_MENTORSHIPS = 2;
export function activeTeamMentorships(teamId: string, players: GmPlayer[]): number {
  return players.filter(row => row.teamId === teamId && activeMentor(row, players)).length;
}
export function developmentSeed(key: string): number {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function workEthicOf(player: GmPlayer): number {
  return clamp(player.workEthic ?? Math.round(40 + createRng(developmentSeed(player.id + ":work"))() * 55), 0, 100);
}
export function mentorEligible(young: GmPlayer, veteran: GmPlayer): boolean {
  return young.id !== veteran.id && young.age <= 25 && veteran.age >= 28 && veteran.age >= young.age + 5 &&
    Boolean(young.teamId && young.teamId === veteran.teamId && young.contract && veteran.contract) && young.position === veteran.position;
}
export function activeMentor(player: GmPlayer, players: GmPlayer[]): GmPlayer | undefined {
  const veteran = players.find(row => row.id === player.mentorship?.mentorId);
  return veteran && player.mentorship?.teamId === player.teamId && mentorEligible(player, veteran) ? veteran : undefined;
}
/** Stable two-card view for the user's mentorship pairings. Old saves receive a deterministic slot. */
export function mentorshipSlots(league: GmLeagueState): [GmPlayer | null, GmPlayer | null] {
  const active = league.players
    .filter(player => player.teamId === league.userTeamId && activeMentor(player, league.players))
    .sort((a, b) => a.id.localeCompare(b.id));
  const slots: [GmPlayer | null, GmPlayer | null] = [null, null];
  for (const player of active) {
    const index = player.mentorship?.slot;
    if ((index === 0 || index === 1) && !slots[index]) slots[index] = player;
  }
  for (const player of active) {
    if (slots.some(assigned => assigned?.id === player.id)) continue;
    const free = slots.findIndex(assigned => !assigned);
    if (free >= 0) slots[free as 0 | 1] = player;
  }
  return slots;
}

/** Replace a card's pairing atomically; never temporarily exceed the two-pair cap. */
export function assignMentorshipSlot(league: GmLeagueState, slot: 0 | 1, menteeId: string | null, mentorId: string | null) {
  const slots = mentorshipSlots(league);
  const current = slots[slot];
  const other = slots[slot === 0 ? 1 : 0];
  if (!menteeId || !mentorId) {
    return current ? assignMentor(league, current.id, null)
      : { ok: true, state: league, reason: "This mentorship slot is empty." };
  }
  if (other?.id === menteeId) return { ok: false, state: league, reason: "This player is already in the other mentorship slot." };
  if (other?.mentorship?.mentorId === mentorId) return { ok: false, state: league, reason: "This veteran is already mentoring in the other slot." };
  if (current?.id === menteeId && current.mentorship?.mentorId === mentorId && current.mentorship?.slot === slot) {
    return { ok: true, state: league, reason: "This mentorship is already active." };
  }
  const cleared = current && (current.id !== menteeId || current.mentorship?.mentorId !== mentorId)
    ? assignMentor(league, current.id, null).state : league;
  const assigned = assignMentor(cleared, menteeId, mentorId);
  if (!assigned.ok) return { ...assigned, state: league };
  return {
    ...assigned,
    state: { ...assigned.state, players: assigned.state.players.map(player =>
      player.id === menteeId && player.mentorship
        ? { ...player, mentorship: { ...player.mentorship, slot } } : player) },
  };
}

export function mentorshipQuality(veteran: GmPlayer): number {
  return clamp(((veteran.sheet?.overall ?? 60) - 55) / 40, 0, 1) * workEthicOf(veteran) / 100;
}
export function mentorshipBonus(player: GmPlayer, players: GmPlayer[]): number {
  const veteran = activeMentor(player, players);
  return veteran ? 0.04 + 0.14 * mentorshipQuality(veteran) : 0;
}
export function assignMentor(league: GmLeagueState, playerId: string, mentorId: string | null) {
  const fail = (reason: string) => ({ ok: false, state: league, reason });
  const player = league.players.find(row => row.id === playerId && row.teamId === league.userTeamId);
  if (!player) return fail("Choose a player on your roster.");
  const veteran = mentorId ? league.players.find(row => row.id === mentorId) : undefined;
  if (mentorId && (!veteran || !mentorEligible(player, veteran))) return fail("Choose a same-position teammate aged 28 or older, at least five years older than the young player.");
  if (mentorId && league.players.some(row => row.id !== playerId && row.mentorship?.mentorId === mentorId && activeMentor(row, league.players))) return fail("That veteran already mentors a teammate.");
  if (player.mentorship?.mentorId === mentorId && player.mentorship?.teamId === player.teamId) return { ok: true, state: league, reason: "This mentorship is already active." };
  if (mentorId && activeTeamMentorships(player.teamId!, league.players) >= MAX_TEAM_MENTORSHIPS && !activeMentor(player, league.players)) return fail("Only two mentorships can be active at once. End an existing pairing first.");
  const mentorship = mentorId ? { mentorId, teamId: player.teamId!, season: league.season, sharedGames: 0 } : undefined;
  return { ok: true, reason: veteran ? `${veteran.name} will mentor ${player.name}.` : "Mentorship cleared.", state: { ...league, players: league.players.map(row => row.id === playerId ? { ...row, mentorship, developmentPlan: row.developmentPlan ?? "balanced" } : row) } };
}

/** The same allowance funds every source. It persists through trades and new seasons. */
export function raiseCeiling(player: GmPlayer, amount: number, season: number, source: "mentorship" | "breakout", reason: string): GmPlayer {
  if (!player.sheet || player.ceilingGrowth?.awards.some(award => award.season === season && award.source === source)) return player;
  if (player.draftModel === 2) {
    // An earned breakout discovers more of a rookie's development capacity;
    // it never reveals or increases a predetermined final OVR. Repeated
    // seasons have diminishing rewards rather than a shared +4 career cap.
    const gain = clamp(Math.floor(amount), 0, 3);
    if (!gain) return player;
    const before = developmentProfileOf(player);
    const after = discoverDevelopment(player, gain);
    if (after.discovery <= before.discovery) return player;
    return {
      ...player,
      developmentProfile: after,
      ceilingGrowth: {
        total: (player.ceilingGrowth?.total ?? 0) + gain,
        ...(player.ceilingGrowth?.reviewedSeason != null ? { reviewedSeason: player.ceilingGrowth.reviewedSeason } : {}),
        awards: [...(player.ceilingGrowth?.awards ?? []), { season, source, gain, reason }],
      },
    };
  }
  const used = clamp(player.ceilingGrowth?.total ?? 0, 0, CAREER_CEILING_LIMIT);
  const gain = Math.max(0, Math.min(Math.floor(amount), CAREER_CEILING_LIMIT - used, 99 - player.sheet.potential.ceiling));
  if (!gain) return player;
  return { ...player, sheet: { ...player.sheet, potential: { ...player.sheet.potential, ceiling: player.sheet.potential.ceiling + gain } }, ceilingGrowth: {
    ...player.ceilingGrowth, total: used + gain,
    awards: [...(player.ceilingGrowth?.awards ?? []), { season, source, gain, reason }],
  } };
}
export function breakoutEvidence(player: GmPlayer, season: number) {
  const line = player.seasonLine;
  const baseline = player.developmentBaseline?.season === season ? player.developmentBaseline.overall : player.sheet?.overall ?? 99;
  // Generated players may truly bloom late, but 26-29-year-old breakthroughs
  // demand significantly better evidence than an ordinary young breakout.
  // Historic/legacy players retain the existing age-25 assessment.
  const late = player.draftModel === 2 && player.age >= 26 && player.age <= 29;
  const eligibleAge = player.age <= 25 || late;
  const minGames = late ? 55 : 40;
  const minMinutes = late ? 1400 : 1000;
  if (!line || line.season !== String(season) || line.gp < minGames || line.min < minMinutes || !eligibleAge) {
    return { eligible: false, baseline, performance: 0, reason: late
      ? "Late breakouts need 55 games and 1,400 minutes with exceptional efficiency and production."
      : "Needs at least 40 games and 1,000 regular-season minutes at age 25 or younger." };
  }
  const shots = line.fga + 0.44 * line.fta;
  const ts = shots > 0 ? line.pts / (2 * shots) : 0;
  const production = (line.pts + 0.7 * line.reb + 1.1 * line.ast + 2 * (line.stl + line.blk) - 1.3 * line.tov) * 36 / line.min;
  const performance = clamp(60 + production * 0.6 + clamp(ts - 0.55, -0.15, 0.15) * 18, 25, 99);
  const eligible = performance >= baseline + (late ? 12 : 6) && ts >= (late ? 0.58 : 0.54);
  return { eligible, baseline, performance, reason: eligible
    ? `Season production rated ${Math.round(performance)} against an opening rating of ${Math.round(baseline)}.`
    : "The season sample does not yet clearly outperform the opening rating with efficient scoring." };
}
export function reviewPlayerCeilings(league: GmLeagueState): GmLeagueState {
  if (!league.schedule.length || !regularSeasonComplete(league.schedule)) return league;
  let changed = false;
  const notes: GmLeagueState["news"] = [];
  const players = league.players.map(raw => {
    if (!raw.sheet || (raw.age > 25 && !(raw.draftModel === 2 && raw.age <= 29)) || league.draftPool.includes(raw.id) || raw.ceilingGrowth?.reviewedSeason === league.season) return raw;
    changed = true;
    let player: GmPlayer = { ...raw, ceilingGrowth: { total: raw.ceilingGrowth?.total ?? 0, awards: raw.ceilingGrowth?.awards ?? [], reviewedSeason: league.season } };
    const evidence = breakoutEvidence(player, league.season);
    if (evidence.eligible) player = raiseCeiling(player, player.age <= 25 && evidence.performance - evidence.baseline >= 12 ? 2 : 1, league.season, "breakout", evidence.reason);
    const veteran = activeMentor(player, league.players);
    const rng = createRng(developmentSeed(player.id + ":ceiling:" + league.season));
    if (veteran && player.mentorship?.season === league.season && player.mentorship.sharedGames >= 20 && rng() < 0.03 + mentorshipQuality(veteran) * 0.09) {
      const quality = mentorshipQuality(veteran);
      const maxGain = quality >= 0.65 ? 3 : quality >= 0.35 ? 2 : 1;
      const raised = raiseCeiling(player, 1 + Math.floor(rng() * maxGain), league.season, "mentorship", `${veteran.name} helped expand his development outlook after ${player.mentorship.sharedGames} shared games.`);
      player = raised;
    }
    for (const award of (player.ceilingGrowth?.awards ?? []).slice(raw.ceilingGrowth?.awards.length ?? 0)) {
      notes.push({
        id: `ceiling-${league.season}-${player.id}-${award.source}`,
        day: league.day, season: league.season, tone: "good",
        headline: `${player.name}: ${award.source} expands his outlook`,
        body: player.draftModel === 2
          ? `Development possibilities improved. ${award.reason}`
          : `Ceiling +${award.gain}. ${award.reason}`,
      });
    }
    return player;
  });
  return changed ? { ...league, players, news: [...notes, ...league.news].slice(0, 50) } : league;
}

export function pairCpuMentors(league: GmLeagueState): GmLeagueState {
  const players = [...league.players];
  for (const team of league.teams.filter(row => row.id !== league.userTeamId)) {
    const roster = players.filter(row => row.teamId === team.id && row.contract);
    for (const young of roster.filter(row => row.age <= 25).sort((a,b) => a.age - b.age || a.id.localeCompare(b.id))) {
      if (activeMentor(young, players)) continue;
      if (activeTeamMentorships(team.id, players) >= MAX_TEAM_MENTORSHIPS) break;
      const veteran = roster.filter(row => mentorEligible(young, row) && !players.some(other => other.mentorship?.mentorId === row.id && activeMentor(other, players)))
        .sort((a,b) => mentorshipQuality(b) - mentorshipQuality(a) || a.id.localeCompare(b.id))[0];
      if (veteran) players[players.findIndex(row => row.id === young.id)] = { ...young, developmentPlan: young.developmentPlan ?? "balanced", mentorship: { mentorId: veteran.id, teamId: team.id, season: league.season, sharedGames: 0 } };
    }
  }
  return { ...league, players };
}
