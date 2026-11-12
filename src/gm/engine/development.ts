import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { clamp, createRng } from "@/gm/engine/rng";
import { regularSeasonComplete } from "@/gm/engine/schedule";
import { discoverDevelopment, developmentProfileOf } from "@/gm/engine/development-profile";
import { playerMentality } from "@/gm/engine/mentality";

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
/** Either player's listed primary OR secondary position can establish a real fit. */
export function mentorPositionsOverlap(young: GmPlayer, veteran: GmPlayer): boolean {
  const roles = new Set([young.position, young.secondaryPosition].filter(Boolean));
  return [veteran.position, veteran.secondaryPosition].some(position => position != null && roles.has(position));
}
export function mentorEligible(young: GmPlayer, veteran: GmPlayer): boolean {
  return young.id !== veteran.id && young.age <= 25 && veteran.age >= 28 && veteran.age >= young.age + 5 &&
    Boolean(young.teamId && young.teamId === veteran.teamId && young.contract && veteran.contract) && mentorPositionsOverlap(young, veteran);
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

/** Years in the league matter more than the current rating. Old NBA saves can
 * lack an explicit service record, so approximate conservatively from age. */
export function mentorServiceYears(player: GmPlayer): number {
  return Math.max(0, Math.floor(player.serviceYears ?? Math.max(0, player.age - 20)));
}

export function mentorProfile(veteran: GmPlayer): {
  quality: number; experience: number; service: number; age: number;
  ability: number; professionalism: number; tier: "Exceptional" | "Strong" | "Solid" | "Developing";
} {
  const service = mentorServiceYears(veteran);
  const experience = clamp(service / 15, 0, 1);
  const age = clamp((veteran.age - 27) / 11, 0, 1);
  const ability = clamp(((veteran.sheet?.overall ?? 70) - 65) / 30, 0, 1);
  const professionalism = workEthicOf(veteran) / 100;
  // 65% earned career experience/maturity, 20% playing excellence,
  // 15% professional habits. An aging role player can out-teach a young star.
  const quality = clamp(0.41 * experience + 0.24 * age +
    0.20 * ability + 0.15 * professionalism, 0, 1);
  const tier = quality >= 0.78 ? "Exceptional" :
    quality >= 0.60 ? "Strong" : quality >= 0.40 ? "Solid" : "Developing";
  return { quality, experience, service, age, ability, professionalism, tier };
}

export function mentorshipQuality(veteran: GmPlayer): number {
  return mentorProfile(veteran).quality;
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
  if (mentorId && (!veteran || !mentorEligible(player, veteran))) return fail("Choose a teammate sharing a primary or secondary position, aged 28 or older and at least five years older.");
  if (mentorId && league.players.some(row => row.id !== playerId && row.mentorship?.mentorId === mentorId && activeMentor(row, league.players))) return fail("That veteran already mentors a teammate.");
  if (player.mentorship?.mentorId === mentorId && player.mentorship?.teamId === player.teamId) return { ok: true, state: league, reason: "This mentorship is already active." };
  if (mentorId && activeTeamMentorships(player.teamId!, league.players) >= MAX_TEAM_MENTORSHIPS && !activeMentor(player, league.players)) return fail("Only two mentorships can be active at once. End an existing pairing first.");
  const mentorship = mentorId ? { mentorId, teamId: player.teamId!, season: league.season, sharedGames: 0, totalSharedGames: 0 } : undefined;
  return { ok: true, reason: veteran ? `${veteran.name} will mentor ${player.name}.` : "Mentorship cleared.", state: { ...league, players: league.players.map(row => row.id === playerId ? { ...row, mentorship, developmentPlan: row.developmentPlan ?? "balanced" } : row) } };
}

export const MENTALITY_MENTOR_MIN_GAMES = 120;

/** 
 * At least two substantial seasons of *actual* shared appearances are needed.
 * This is a separate, rare, permanently saved opportunity—not a free OVR jump
 * or a certainty from assigning an elite mentor in the UI.
 */
export function reviewMentoredMentality(player: GmPlayer, veteran: GmPlayer, season: number): GmPlayer {
  const bond = player.mentorship;
  if (!bond || bond.mentorId !== veteran.id || bond.teamId !== player.teamId ||
      bond.season !== season || bond.sharedGames < 35 ||
      (bond.totalSharedGames ?? bond.sharedGames) < MENTALITY_MENTOR_MIN_GAMES ||
      !mentorEligible(player, veteran) || mentorServiceYears(veteran) < 7) return player;
  const quality = mentorshipQuality(veteran);
  const mentorRank = playerMentality(veteran).rank;
  const currentRank = playerMentality(player).rank;
  if (quality < 0.55 || mentorRank < 3 || mentorRank <= currentRank) return player;
  const games = bond.totalSharedGames ?? bond.sharedGames;
  // Cohort-stable roll keyed to the same real pairing and season, with
  // gradually better odds after still more time together. Cannot be rerolled
  // by reopening the card or loading a save.
  const rng = createRng(developmentSeed(player.id + ":mindset:" + veteran.id + ":" + season));
  const chance = clamp(0.06 + (quality - 0.55) * 0.16 +
    (mentorRank - 3) * 0.025 + Math.min(0.17, (games - 120) / 500), 0.06, 0.35);
  if (rng() >= chance) return player;
  const original = developmentProfileOf(player);
  const learning = clamp(original.learning + 0.065, 0.72, 1.4);
  const adaptability = clamp(original.adaptability + 0.045, 0.7, 1.3);
  const discovery = clamp(original.discovery + 0.035, 0, 0.55);
  return {
    ...player,
    // Learned mentality, and actual bounded learning improvement, persist even
    // after a trade or mentor retirement. The OVR potential ceiling is untouched.
    mentalityMentor: {
      rank: mentorRank as 2 | 3 | 4 | 5, mentorId: veteran.id,
      mentorName: veteran.name, sharedGames: games, season,
    },
    developmentProfile: {
      ...original,
      learning: Math.round(learning * 1000) / 1000,
      adaptability: Math.round(adaptability * 1000) / 1000,
      discovery: Math.round(discovery * 1000) / 1000,
    },
  };
}

/**
 * A single saved event ledger covers both growth systems.
 *
 * Model-2 players: 'gain' measures a discovery opportunity, permanently
 * improving their response to practice through a bounded, diminishing
 * learning multiplier. NEVER touches a fixed OVR potential.
 *
 * Historic NBA/legacy players: preserve the original limited ceiling change
 * for save and rating-calibration compatibility. The stored 'ceilingGrowth'
 * field is historical schema; it is NOT a ceiling for generated prospects.
 */
export function recordDevelopmentMilestone(player: GmPlayer, amount: number, season: number, source: "mentorship" | "breakout", reason: string): GmPlayer {
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
/** Legacy name retained for tests and integrations that imported the old helper. */
export const raiseCeiling = recordDevelopmentMilestone;

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
/** Review earned development discoveries after a *completed regular season*. */
export function reviewPlayerDevelopment(league: GmLeagueState): GmLeagueState {
  if (!league.schedule.length || !regularSeasonComplete(league.schedule)) return league;
  let changed = false;
  const notes: GmLeagueState["news"] = [];
  const players = league.players.map(raw => {
    if (!raw.sheet || (raw.age > 25 && !(raw.draftModel === 2 && raw.age <= 29)) || league.draftPool.includes(raw.id) || raw.ceilingGrowth?.reviewedSeason === league.season) return raw;
    changed = true;
    let player: GmPlayer = { ...raw, ceilingGrowth: { total: raw.ceilingGrowth?.total ?? 0, awards: raw.ceilingGrowth?.awards ?? [], reviewedSeason: league.season } };
    const evidence = breakoutEvidence(player, league.season);
    if (evidence.eligible) player = recordDevelopmentMilestone(player, player.age <= 25 && evidence.performance - evidence.baseline >= 12 ? 2 : 1, league.season, "breakout", evidence.reason);
    const veteran = activeMentor(player, league.players);
    if (veteran) {
      const beforeRank = playerMentality(player).rank;
      const mentored = reviewMentoredMentality(player, veteran, league.season);
      if (mentored !== player) {
        player = mentored;
        notes.push({
          id: `mentality-${league.season}-${player.id}`,
          day: league.day, season: league.season, tone: "good",
          headline: `${player.name} adopted ${playerMentality(player).label} mentality`,
          body: `${veteran.name}'s influence took hold after ${player.mentorship?.totalSharedGames ?? 0} shared games. ${player.name} advanced from mentality rank ${beforeRank}, gaining better learning habits—not an instant OVR or guaranteed superstar future.`,
        });
      }
    }
    // Keep the original player/season RNG key, preserving existing save
    // outcomes and preventing rerolls when users replace mentors.
    const rng = createRng(developmentSeed(player.id + ":ceiling:" + league.season));
    if (veteran && player.mentorship?.season === league.season && player.mentorship.sharedGames >= 20 && rng() < 0.03 + mentorshipQuality(veteran) * 0.09) {
      const quality = mentorshipQuality(veteran);
      const maxGain = quality >= 0.65 ? 3 : quality >= 0.35 ? 2 : 1;
      const raised = recordDevelopmentMilestone(player, 1 + Math.floor(rng() * maxGain), league.season, "mentorship", `${veteran.name} helped strengthen future learning after ${player.mentorship.sharedGames} games played together.`);
      player = raised;
    }
    for (const award of (player.ceilingGrowth?.awards ?? []).slice(raw.ceilingGrowth?.awards.length ?? 0)) {
      notes.push({
        id: `ceiling-${league.season}-${player.id}-${award.source}`,
        day: league.day, season: league.season, tone: "good",
        headline: `${player.name}: ${award.source === "mentorship" ? "mentoring breakthrough" : "breakout season"}`,
        body: player.draftModel === 2
          ? `Future skill learning improved slightly. No fixed overall ceiling was raised. ${award.reason}`
          : `Legacy potential ceiling +${award.gain} OVR. ${award.reason}`,
      });
    }
    return player;
  });
  return changed ? { ...league, players, news: [...notes, ...league.news].slice(0, 50) } : league;
}

/** Compatibility alias for old development scripts. */
export const reviewPlayerCeilings = reviewPlayerDevelopment;

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
