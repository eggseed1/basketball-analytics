import { cohortLevel, eliteYouthLabel, hasClubAcademies, levelOf, minutesBand, nodeLabel, performanceLevel, roleFor } from "./career";
import { poolFor, townName } from "./names";
import { clamp, createStreams, hashString, rngOf, type Rng } from "./rng";
import { canAfford } from "./training";
import type { LifeState, NodeKind, Offer, Role } from "./types";
import { country, domesticProLeagues, foreignProLeagues, league, maybeLeague, type LeagueProfile } from "./world";

/**
 * Route graph. Every transition checks age and stage, ability (playing level
 * against the destination's need), opportunity (exposure or a scout's
 * invitation), affordability, family support, eligibility and an actual
 * offer. Moving abroad always comes from a named invitation.
 */

const MASCOTS = ["Hawks", "Lions", "Comets", "Rangers", "Royals", "Falcons", "Waves", "Wolves", "Stars", "Titans", "Pioneers", "Owls"];

function clubName(rng: Rng, countryId: string, kind: "club" | "school" | "university"): string {
  const c = country(countryId);
  const pool = poolFor(countryId);
  const town = townName(rng, pool);
  const place = rng.chance(0.35) || !town ? (c.capital ?? c.name) : town;
  const mascot = rng.pick(MASCOTS);
  if (kind === "school") return `${place} High School`;
  if (kind === "university") return rng.chance(0.5) ? `${place} State` : `University of ${place}`;
  switch (pool) {
    case "es":
    case "latam":
    case "caribbean_es":
      return `Club Baloncesto ${place}`;
    case "br":
    case "pt":
    case "lusophone_africa":
      return `Basquete ${place}`;
    case "fr":
    case "sahel_fr":
    case "central_africa_fr":
    case "haiti_fr_caribbean":
      return `${place} Basket`;
    case "it":
      return `Pallacanestro ${place}`;
    case "de":
      return `${place} Baskets`;
    case "balkan":
    case "bg_mk":
      return `KK ${place}`;
    default:
      return `${place} ${mascot}`;
  }
}

const SALARY_SHARE: Record<Role, number> = { none: 0, "deep-bench": 0.02, bench: 0.12, rotation: 0.3, starter: 0.55, star: 0.85 };

export function salaryFor(l: LeagueProfile, role: Role): number {
  const [lo, hi] = l.model!.salaryUsd;
  return Math.round((lo + (hi - lo) * SALARY_SHARE[role] ** 1.6) / 500) * 500;
}

/** A club name that doesn't consume any game stream. */
export function clubNameFor(state: LifeState, countryId: string): string {
  return clubName(rngOf(createStreams(hashString(`${state.seed}:club:${state.ageMonths}:${countryId}`)), "generation"), countryId, "club");
}

/** How much an agent widens the market: lower exposure needed for offers abroad. */
export function agentBoost(state: LifeState): number {
  const reach = state.finance.agent?.reach;
  return reach ? { global: 9, regional: 6, local: 2 }[reach] : 0;
}

function coachingWord(c: number) {
  return c >= 85 ? "Elite coaching" : c >= 72 ? "Strong coaching" : c >= 58 ? "Solid coaching" : c >= 45 ? "Basic coaching" : "Little coaching";
}

function exposureWord(e: number) {
  return e >= 80 ? "NBA scouts watch closely" : e >= 55 ? "Scouts check in regularly" : e >= 30 ? "Occasional scouts" : "Few scouts";
}

function offerId(state: LifeState) {
  state.counters.offer += 1;
  return `o${state.counters.offer}`;
}

interface Draft {
  node: NodeKind;
  countryId: string;
  leagueId: string | null;
  teamName: string;
  need: number;
  coaching: number;
  exposure: number;
  costPerYear: number;
  salary?: number;
  years?: number;
  guaranteed?: boolean;
  twoWay?: boolean;
  kind: Offer["kind"];
  reason: string;
  extra?: string[];
  cap?: number;
}

function build(state: LifeState, d: Draft): Offer {
  const lvl = performanceLevel(state);
  const role = roleFor(lvl, d.need);
  const consequences: string[] = [];
  if (d.countryId !== state.residence.countryId) {
    consequences.push(`Moves you to ${country(d.countryId).name}. Residence changes; citizenship stays ${state.citizenships.map((c) => country(c).name).join(", ")}.`);
  }
  const l = maybeLeague(d.leagueId);
  let salary = d.salary ?? 0;
  if (l?.model && (d.node === "domestic-pro" || d.node === "foreign-pro") && d.salary === undefined) salary = salaryFor(l, role);
  if (salary > 0 && state.education.amateur && d.node !== "nba") consequences.push("A professional contract ends NCAA eligibility (game rule).");
  if (d.node === "foreign-pro" && l && !state.citizenships.some((c) => l.countries.includes(c))) consequences.push(`You count as an import player in ${l.name} (game rule).`);
  if (d.costPerYear > 0) consequences.push(`Costs your family about $${d.costPerYear.toLocaleString("en-US")} a year (USD equivalent, model).`);
  if (d.costPerYear > 0 && !canAfford(state, d.costPerYear)) consequences.push("More than your family can comfortably pay.");
  consequences.push(...(d.extra ?? []));
  return {
    id: offerId(state),
    kind: d.kind,
    node: d.node,
    countryId: d.countryId,
    leagueId: d.leagueId,
    teamName: d.teamName,
    role,
    minutesBand: minutesBand(role, d.cap ?? (l?.model?.minutesCap ?? 32)),
    coaching: Math.round(d.coaching),
    difficulty: Math.round(clamp(50 + (d.need - lvl) * 3, 0, 100)),
    exposure: Math.round(d.exposure),
    costPerYear: d.costPerYear,
    salary,
    years: d.years ?? (salary > 0 ? 1 + (role === "star" || role === "starter" ? 1 : 0) : 1),
    guaranteed: d.guaranteed ?? salary > 0,
    twoWay: d.twoWay,
    consequences: [coachingWord(d.coaching) + ". " + exposureWord(d.exposure) + ".", ...consequences],
    reason: d.reason,
  };
}

export function offerBlocked(state: LifeState, o: Offer): string | null {
  const age = state.ageMonths / 12;
  if (o.costPerYear > 0 && !canAfford(state, o.costPerYear)) return "Your family can't cover the cost.";
  if (o.countryId !== state.residence.countryId && age < 18 && state.family.support === "low" && o.costPerYear > 0) return "Your family won't sign off on a paid move at your age.";
  return null;
}

/** Offers that arrive at the end of a season (or each summer without a team). */
export function offseasonOffers(state: LifeState): Offer[] {
  const rng = rngOf(state.rng, "scouting");
  const age = state.ageMonths / 12;
  const res = country(state.residence.countryId);
  const lvl = performanceLevel(state);
  const E = state.exposure;
  const node = state.placement.node;
  const offers: Offer[] = [];
  const cohort = cohortLevel(age);
  const pros = domesticProLeagues(res.id);
  const top = pros[0];
  const clubCoaching = res.model.coachingAccess;
  const r = Array.from({ length: 8 }, () => rng.next());
  const nameRng = rng;

  if (age < 6) return offers;
  if (state.placement.node === "nba" && state.placement.contract && state.placement.contract.yearsLeft > 0) return offers;

  if (age < 10 && (node === "home" || node === "playground" || node === "school-team")) {
    if (state.family.courtAccess !== "poor" || state.family.means >= 3) {
      offers.push(build(state, { kind: "join", node: "local-club", countryId: res.id, leagueId: null, teamName: clubName(nameRng, res.id, "club"), need: cohort * 0.95, coaching: clubCoaching * 0.8, exposure: 6, costPerYear: Math.round(350 * res.model.costIndex), reason: "The local club runs teams for your age group." }));
    }
    if (node !== "school-team" && age >= 8) {
      offers.push(build(state, { kind: "join", node: "school-team", countryId: res.id, leagueId: null, teamName: "School team", need: cohort * 0.88, coaching: clubCoaching * 0.6, exposure: 4, costPerYear: 0, reason: "Your school has a team." }));
    }
    return offers;
  }

  const youth = age < 18;
  if (youth && res.id === "US") {
    if (age >= 14 && node !== "us-high-school") {
      offers.push(build(state, { kind: "join", node: "us-high-school", countryId: "US", leagueId: "nfhs", teamName: clubName(nameRng, "US", "school"), need: cohort, coaching: 62, exposure: 30, costPerYear: 0, reason: "High school varsity tryouts." }));
    } else if (age < 14 && node !== "local-club") {
      offers.push(build(state, { kind: "join", node: "local-club", countryId: "US", leagueId: null, teamName: clubName(nameRng, "US", "club"), need: cohort * 0.95, coaching: 60, exposure: 8, costPerYear: Math.round(900 * res.model.costIndex), reason: "A travel team picks you up." }));
    }
  }
  if (youth && res.id !== "US") {
    if (node !== "local-club" && node !== "elite-youth") {
      offers.push(build(state, { kind: "join", node: "local-club", countryId: res.id, leagueId: null, teamName: clubName(nameRng, res.id, "club"), need: cohort * 0.95, coaching: clubCoaching * 0.8, exposure: 8, costPerYear: Math.round(400 * res.model.costIndex), reason: "A local club wants you for its age group." }));
    }
    if (top && node !== "elite-youth" && lvl >= cohort * 1.04 && E + r[0]! * 20 >= 12) {
      offers.push(build(state, { kind: "join", node: "elite-youth", countryId: res.id, leagueId: top.id, teamName: clubName(nameRng, res.id, "club"), need: cohort * 1.12, coaching: clubCoaching + 8, exposure: 22, costPerYear: 0, reason: hasClubAcademies(res.id) ? `A ${top.name} club's youth coach saw you play and invited you to a tryout.` : "An elite youth program's coach saw you play and invited you to a tryout." }));
    }
    // Canadian prospects commonly move to US prep schools; the bar is lower than a cold invitation.
    if (res.id === "CA" && age >= 14 && age < 17 && node !== "us-high-school" && lvl >= cohort * 1.05 && E + r[1]! * 15 >= 18 && state.education.academics >= 40) {
      offers.push(build(state, { kind: "scholarship", node: "us-high-school", countryId: "US", leagueId: "nfhs", teamName: clubName(nameRng, "US", "school"), need: cohort * 1.05, coaching: 66, exposure: 40, costPerYear: Math.round(2500 * res.model.costIndex), reason: "A US prep school that recruits Canadian travel-team players offers a partial scholarship.", extra: ["Partial scholarship (model). The family covers the rest.", "Puts you on the US high school and NCAA route."] }));
    }
    // Invitations abroad need a scout's eye: high exposure or a camp invite.
    const invited = state.achievements.campInvite !== null || E >= 40;
    if (age >= 14 && age < 17 && invited && lvl >= cohort * 1.16) {
      const hostOptions = ["ES", "FR", "DE", "IT", "LT", "RS", "TR", "GR"].filter((id) => id !== res.id);
      const host = hostOptions[Math.floor(r[1]! * hostOptions.length)]!;
      const hostTop = domesticProLeagues(host)[0];
      if (hostTop) {
        offers.push(build(state, { kind: "move", node: "elite-youth", countryId: host, leagueId: hostTop.id, teamName: clubName(nameRng, host, "club"), need: cohort * 1.15, coaching: 84, exposure: 34, costPerYear: 0, reason: `A ${hostTop.name} club scout followed up after ${state.achievements.campInvite !== null ? "your camp" : "a showcase"} and offered a youth contract with housing and school.`, extra: ["Youth contract covers housing and school (model)."] }));
      }
      if (state.education.academics >= 40 && age < 16.5) {
        offers.push(build(state, { kind: "scholarship", node: "us-high-school", countryId: "US", leagueId: "nfhs", teamName: clubName(nameRng, "US", "school"), need: cohort * 1.05, coaching: 66, exposure: 40, costPerYear: 0, reason: "A US high school coach offered a scholarship after seeing your film.", extra: ["Scholarship covers tuition and boarding (model).", "Puts you on the US high school and NCAA route."] }));
      }
    }
    if (top && age >= Math.max(16, top.model!.minAge) && lvl >= top.model!.strength * 0.8 - 8) {
      offers.push(build(state, { kind: "contract", node: "domestic-pro", countryId: res.id, leagueId: top.id, teamName: state.placement.teamName && node === "elite-youth" ? state.placement.teamName : clubName(nameRng, res.id, "club"), need: top.model!.strength * 0.8, coaching: top.model!.coaching, exposure: top.model!.exposure, costPerYear: 0, reason: `The first team wants you on its ${top.name} roster.` }));
    }
  }

  // College: amateurs who finished secondary school.
  const ncaa = league("ncaa");
  if (age >= 17.5 && age < 20.5 && state.education.amateur && node !== "university") {
    const scoutNeed = res.id === "US" ? 18 : 30;
    if (lvl >= 43 && E + r[2]! * 15 >= scoutNeed && state.education.academics >= 45) {
      const high = lvl >= 52 && E >= scoutNeed + 15;
      offers.push(build(state, { kind: "scholarship", node: "university", countryId: "US", leagueId: "ncaa", teamName: clubName(nameRng, "US", "university"), need: ncaa.model!.strength * 0.8 + (high ? 3 : -5), coaching: high ? 86 : 72, exposure: high ? 88 : 66, costPerYear: 0, years: 4, reason: high ? "A high-major program offers a full scholarship." : "A mid-major program offers a full scholarship.", extra: ["Full scholarship (model). You can test the draft each spring under NCAA rules."] }));
    } else if (lvl >= 43 && state.education.academics < 45 && E >= scoutNeed) {
      state.flags.ncaaGradesBlocked = state.ageMonths;
    }
  }

  if (age >= 17) {
    for (const l of pros.slice(0, 2)) {
      if (age >= l.model!.minAge && lvl >= l.model!.strength * 0.8 - 10 && !(node === "domestic-pro" && state.placement.leagueId === l.id)) {
        offers.push(build(state, { kind: "contract", node: "domestic-pro", countryId: res.id, leagueId: l.id, teamName: clubName(nameRng, res.id, "club"), need: l.model!.strength * 0.8, coaching: l.model!.coaching, exposure: l.model!.exposure, costPerYear: 0, reason: `A ${l.name} club offers a contract.` }));
        break;
      }
    }
    if (!pros.length && node !== "local-senior" && age >= 17) {
      offers.push(build(state, { kind: "join", node: "local-senior", countryId: res.id, leagueId: null, teamName: clubName(nameRng, res.id, "club"), need: 24, coaching: clubCoaching * 0.7, exposure: 8, costPerYear: 0, salary: 0, reason: `A senior club in ${res.name} wants you. The snapshot has no verified professional league here.`, extra: ["Competition details for this country are unverified in the 2026-10-08 snapshot."] }));
    }
    if (E + agentBoost(state) >= 22 + r[3]! * 15) {
      const options = foreignProLeagues(res.id)
        .filter((l) => lvl >= l.model!.strength * 0.8 - 7 && l.model!.minAge <= age)
        .sort((a, b) => b.model!.strength - a.model!.strength);
      const pickA = options[Math.floor(r[4]! * Math.min(3, options.length))];
      const pickB = options[Math.floor(r[5]! * options.length)];
      for (const l of [pickA, pickB]) {
        if (!l || offers.some((o) => o.leagueId === l.id)) continue;
        const host = l.countries[0]!;
        offers.push(build(state, { kind: "contract", node: "foreign-pro", countryId: host, leagueId: l.id, teamName: clubName(nameRng, host, "club"), need: l.model!.strength * 0.8, coaching: l.model!.coaching, exposure: l.model!.exposure, costPerYear: 0, reason: state.finance.agent ? `${state.finance.agent.name} sent your film to a ${l.name} club. They want you.` : `A ${l.name} club saw your film. They want you.` }));
      }
    }
    const gl = league("g-league");
    const abroad = res.id !== "US";
    if (age >= 18 && node !== "g-league" && node !== "nba" && lvl >= (abroad ? 56 : 52) && E + agentBoost(state) * 0.6 >= (abroad ? 52 : 40) + r[6]! * 15) {
      offers.push(build(state, { kind: "contract", node: "g-league", countryId: "US", leagueId: "g-league", teamName: `G League affiliate (${nbaTeam(r[7]!)})`, need: gl.model!.strength * 0.8, coaching: gl.model!.coaching, exposure: gl.model!.exposure, costPerYear: 0, salary: 40500, years: 1, reason: abroad ? "A G League team saw your film and invites you to training camp. You make the roster." : "A G League team invites you to its local tryout and keeps you.", extra: ["G League players can be called up on 10-day or two-way deals."] }));
    }
  }
  return offers.slice(0, 4);
}

export const NBA_TEAMS = [
  "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets", "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets", "Detroit Pistons", "Golden State Warriors",
  "Houston Rockets", "Indiana Pacers", "LA Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat", "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
  "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns", "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors", "Utah Jazz", "Washington Wizards",
];

export function nbaTeam(u: number) {
  return NBA_TEAMS[Math.floor(u * NBA_TEAMS.length)]!;
}

/** "Your route" panel: where you are, where you have been, what is open. */
export interface RouteStep {
  label: string;
  status: "done" | "current" | "open" | "locked";
  detail: string;
}

export function routeView(state: LifeState): RouteStep[] {
  const age = state.ageMonths / 12;
  const res = country(state.residence.countryId);
  const steps: RouteStep[] = [];
  const seen = new Set<string>();
  for (const s of state.seasons) {
    const key = `${s.node}:${s.levelLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push({ label: s.levelLabel, status: "done", detail: `${s.calendarYear} · age ${s.ageYears}` });
  }
  const cur = levelOf(state);
  const curLabel = cur?.label ?? nodeLabel(state.placement.node, state.placement.countryId, state.placement.leagueId);
  steps.push({ label: curLabel, status: "current", detail: state.placement.teamName ?? "" });
  const pros = domesticProLeagues(res.id);
  const lvl = performanceLevel(state);
  const next: RouteStep[] = [];
  if (age < 14 && pros[0]) next.push({ label: eliteYouthLabel(res.id, pros[0].id), status: lvl >= cohortLevel(age) * 1.04 ? "open" : "locked", detail: "Needs a strong level for your age and a coach who has seen you." });
  if (age < 18 && res.id === "US") next.push({ label: "US high school varsity", status: age >= 13 ? "open" : "locked", detail: "From 14." });
  if (age < 20.5 && state.education.amateur) next.push({ label: "NCAA scholarship", status: state.education.academics >= 45 ? "open" : "locked", detail: `Needs grades (now ${Math.round(state.education.academics)}/45), exposure and level.` });
  for (const l of pros.slice(0, 2)) next.push({ label: l.name, status: lvl >= l.model!.strength * 0.8 - 10 ? "open" : "locked", detail: `Verified ${res.name} competition. Level needed about ${Math.round(l.model!.strength * 0.8 - 10)}.` });
  if (!pros.length) next.push({ label: `Senior club basketball, ${res.name}`, status: age >= 17 ? "open" : "locked", detail: "Unverified competition structure in this snapshot." });
  next.push({ label: "Pro offer abroad", status: state.exposure >= 22 ? "open" : "locked", detail: `Needs exposure about 22+ (now ${Math.round(state.exposure)}).` });
  next.push({ label: "NBA Draft", status: age >= 19 ? "open" : "locked", detail: "Eligible at 19 (game rule). Automatic at 22." });
  next.push({ label: "NBA debut", status: state.achievements.nbaDebut !== null ? "done" : "locked", detail: "The goal: one regular-season game." });
  return [...steps, ...next.filter((n) => n.label !== curLabel)];
}
