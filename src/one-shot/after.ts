import { calendar } from "./career";
import { canPay } from "./finance";
import { clamp, hashString, rngOf } from "./rng";
import { NBA_TEAMS, namedPlace } from "./routes";
import { currentLevel } from "./skills";
import type { AfterYear, LifeState, Track } from "./types";
import { country, domesticProLeagues } from "./world";

/**
 * Careers after playing (model). Each track is a ladder of jobs. Reputation
 * opens the next rung; a yearly review decides results, raises, offers and
 * firings. Pay is a game setting: rungs marked `us` pay fixed US-dollar
 * figures, the rest scale with the home country's income level.
 */

interface Rung {
  title: (s: LifeState, home: string) => string;
  employer: (s: LifeState, home: string, step: number) => string;
  pay: number;
  us?: boolean;
  bar: number;
  /** Yearly chance that an opening at this rung comes up once he qualifies. Top jobs are scarce. */
  odds: number;
  games?: number;
  /** One-time cost to take the rung (opening a business). */
  startCost?: number;
  /** Paid from business profit rather than a salary. */
  business?: number;
}

const topLeague = (home: string) => domesticProLeagues(home)[0] ?? null;
const nba = (s: LifeState, step: number) => NBA_TEAMS[hashString(`${s.seed}:after:${step}`) % NBA_TEAMS.length]!;
const club = (s: LifeState, home: string, step: number) => namedPlace(s, home, "club", `after:${step}`);

export const LADDER: Record<Track, Rung[]> = {
  coach: [
    { title: (_, h) => (h === "US" ? "Youth coach, AAU program" : "Youth coach"), employer: club, pay: 15_000, bar: 0, odds: 1, games: 20 },
    { title: (_, h) => (h === "US" ? "High school head coach" : "Academy head coach"), employer: (s, h, i) => (h === "US" ? namedPlace(s, h, "school", `after:${i}`) : `${club(s, h, i)} academy`), pay: 40_000, bar: 22, odds: 0.6, games: 26 },
    { title: (_, h) => (h === "US" ? "College assistant coach" : topLeague(h) ? `Assistant coach, ${topLeague(h)!.name}` : "Assistant coach, national federation"), employer: (s, h, i) => (h === "US" ? namedPlace(s, h, "university", `after:${i}`) : topLeague(h) ? club(s, h, i) : `${country(h).name} national team program`), pay: 75_000, bar: 38, odds: 0.45, games: 34 },
    { title: (_, h) => (h === "US" ? "G League head coach" : topLeague(h) ? `Head coach, ${topLeague(h)!.name}` : "National team head coach"), employer: (s, h, i) => (h === "US" ? `${nba(s, i)} G League affiliate` : topLeague(h) ? club(s, h, i) : `${country(h).name} national team`), pay: 190_000, bar: 52, odds: 0.3, games: 34 },
    { title: () => "NBA assistant coach", employer: (s, _, i) => nba(s, i), pay: 600_000, us: true, bar: 66, odds: 0.07, games: 82 },
    { title: () => "NBA head coach", employer: (s, _, i) => nba(s, i), pay: 7_000_000, us: true, bar: 80, odds: 0.04, games: 82 },
  ],
  scout: [
    { title: (_, h) => (h === "US" ? "Area scout" : "Club scout"), employer: (s, h, i) => (h === "US" ? nba(s, i) : club(s, h, i)), pay: 45_000, bar: 0, odds: 1 },
    { title: () => "International scout", employer: (s, _, i) => nba(s, i), pay: 110_000, us: true, bar: 32, odds: 0.4 },
    { title: () => "Director of scouting", employer: (s, _, i) => nba(s, i), pay: 260_000, us: true, bar: 52, odds: 0.25 },
    { title: () => "Assistant general manager", employer: (s, _, i) => nba(s, i), pay: 650_000, us: true, bar: 68, odds: 0.12 },
    { title: () => "General manager", employer: (s, _, i) => nba(s, i), pay: 3_500_000, us: true, bar: 82, odds: 0.05 },
  ],
  media: [
    { title: () => "Radio analyst", employer: (_, h) => `${country(h).capital ?? country(h).name} sports radio`, pay: 30_000, bar: 0, odds: 1 },
    { title: () => "TV analyst", employer: (_, h) => (topLeague(h) ? `${topLeague(h)!.name} broadcasts` : `${country(h).name} national TV`), pay: 110_000, bar: 30, odds: 0.45 },
    { title: () => "National TV analyst", employer: (_, h) => (h === "US" ? "a national sports network" : `${country(h).name} national TV`), pay: 260_000, bar: 55, odds: 0.2 },
    { title: () => "Lead NBA studio analyst", employer: () => "a national sports network", pay: 3_000_000, us: true, bar: 78, odds: 0.05 },
  ],
  podcast: [
    { title: () => "Podcast host", employer: (s) => `The ${s.identity.familyName} Show (self-produced)`, pay: 0, bar: 0, odds: 1, business: 24_000 },
    { title: () => "Network podcast host", employer: () => "a sports podcast network", pay: 120_000, bar: 30, odds: 0.45 },
    { title: () => "Podcast company founder", employer: (s) => `${s.identity.familyName} Media`, pay: 0, bar: 50, odds: 0.35, startCost: 75_000, business: 450_000 },
    { title: () => "Host, exclusive streaming deal", employer: () => "a streaming platform", pay: 4_000_000, us: true, bar: 76, odds: 0.05 },
  ],
  trainer: [
    { title: () => "Skills trainer", employer: () => "Self-employed", pay: 35_000, bar: 0, odds: 1 },
    { title: () => "Basketball academy owner", employer: (s) => `${s.identity.familyName} Basketball Academy`, pay: 0, bar: 20, odds: 0.7, startCost: 40_000, business: 70_000 },
    { title: () => "Owner, academy chain", employer: (s) => `${s.identity.familyName} Basketball (3 locations)`, pay: 0, bar: 45, odds: 0.6, startCost: 150_000, business: 240_000 },
    { title: () => "Trainer to NBA players", employer: () => "Private clients", pay: 600_000, us: true, bar: 68, odds: 0.15 },
  ],
};

export const TRACK_LABEL: Record<Track, string> = { coach: "Coaching", scout: "Scouting", media: "Broadcasting", podcast: "Podcasting", trainer: "Player development" };

const INCOME_SCALE: Record<string, number> = { HIC: 1, UMC: 0.4, LMC: 0.22, LIC: 0.12, INX: 0.5 };
const scale = (home: string) => INCOME_SCALE[country(home).income.level] ?? 0.4;

export function rungPay(r: Rung, home: string) {
  return r.us ? r.pay : Math.round((r.pay * scale(home)) / 500) * 500;
}

export function rungCost(r: Rung, home: string) {
  return r.startCost ? Math.round((r.startCost * country(home).model.costIndex) / 1000) * 1000 : 0;
}

export function rungCountry(r: Rung, home: string) {
  return r.us ? "US" : home;
}

/** Where jobs outside the NBA would be: fixed when the second career starts. */
export function homeBase(s: LifeState) {
  if (typeof s.flags.afterHome === "string") return s.flags.afterHome;
  return s.citizenships.includes(s.residence.countryId) ? s.residence.countryId : s.birthplace.countryId;
}

/** Reputation a track starts from, built from the playing career. */
export function startingRep(s: LifeState, track: Track): number {
  const honors = s.seasons.reduce((a, x) => a + (x.awards?.length ?? 0), 0);
  const base = 0.3 * currentLevel(s) + 0.2 * s.exposure + (s.nbaGames > 0 ? 12 + Math.min(18, s.nbaGames / 25) : 0) + Math.min(8, s.international.caps * 0.3) + Math.min(6, honors);
  const t = s.traits;
  const k = s.skills;
  const adj = {
    coach: (k.iq - 50) * 0.25 + (t.coachability - 50) * 0.1 + (t.composure - 50) * 0.1,
    scout: (k.iq - 50) * 0.3 + (k.decisions - 50) * 0.1,
    media: (t.confidence - 50) * 0.2 + s.exposure * 0.15,
    podcast: (t.confidence - 50) * 0.2 + s.exposure * 0.12 + (k.iq - 50) * 0.05,
    trainer: (k.shooting + k.handle + k.finishing - 150) * 0.08 + (t.discipline - 50) * 0.12,
  }[track];
  return Math.round(clamp(base + adj - 8, 5, 75));
}

export function startStep(s: LifeState, track: Track, rep: number): number {
  const cap = { coach: s.nbaGames > 0 ? 2 : 1, scout: 1, media: s.nbaGames >= 150 ? 2 : 1, podcast: s.nbaGames >= 150 ? 1 : 0, trainer: 0 }[track];
  const ladder = LADDER[track];
  let step = 0;
  for (let i = 1; i <= cap; i++) if (ladder[i]!.bar <= rep - 8 && !ladder[i]!.startCost) step = i;
  return step;
}

export interface TrackOption {
  track: Track;
  step: number;
  rep: number;
  title: string;
  employer: string;
  pay: number;
  blocked: string | null;
}

export function trackOptions(s: LifeState, exclude?: Track): TrackOption[] {
  const home = homeBase(s);
  return (["coach", "scout", "media", "podcast", "trainer"] as Track[])
    .filter((t) => t !== exclude)
    .map((track) => {
      const rep = s.after ? Math.round(s.after.rep * 0.5 + startingRep(s, track) * 0.5) : startingRep(s, track);
      const step = startStep(s, track, rep);
      const r = LADDER[track][step]!;
      const where = rungCountry(r, home);
      let blocked: string | null = null;
      if (track === "media" && s.exposure < 20 && s.nbaGames === 0) blocked = "Broadcasters want a name people know (exposure 20+ or NBA games).";
      if (track === "scout" && s.skills.iq < 30) blocked = "Scouting needs a sharp basketball mind (IQ 30+).";
      const pay = r.business ? rungPay({ ...r, pay: r.business * 0.5 }, where) : rungPay(r, where);
      return { track, step, rep, title: r.title(s, where), employer: r.employer(s, where, step), pay, blocked };
    });
}

/** Starts or switches to a job. Moves him if the job is abroad. */
export function takeJob(s: LifeState, track: Track, step: number, rep: number) {
  const home = homeBase(s);
  const r = LADDER[track][step]!;
  const where = rungCountry(r, home);
  const prev = s.after;
  s.flags.afterHome = home;
  s.after = {
    track,
    step,
    title: r.title(s, where),
    employer: r.employer(s, where, step),
    countryId: where,
    salary: r.business ? Math.round(rungPay({ ...r, pay: r.business * 0.5 }, where)) : rungPay(r, where),
    since: s.ageMonths,
    rep,
    years: prev?.years ?? [],
  };
  if (where !== s.residence.countryId) {
    const c = country(where);
    s.residence = { countryId: c.id, locality: where === "US" ? "an NBA city" : (c.capital ?? c.name), localityKind: "city" };
  }
}

export interface YearResult {
  line: AfterYear;
  repDelta: number;
  fired: boolean;
  offer: { step: number; title: string; employer: string; pay: number; cost: number; where: string } | null;
  profit: number | null;
}

/** One year in the job. Always draws four numbers from the "after" stream. */
export function yearInJob(s: LifeState): YearResult {
  const a = s.after!;
  const rng = rngOf(s.rng, "after");
  const n1 = rng.normal(0, 1);
  const n2 = rng.next();
  const n3 = rng.next();
  const n4 = rng.next();
  const ladder = LADDER[a.track];
  const rung = ladder[a.step]!;
  const { year } = calendar(s);
  const age = Math.floor(s.ageMonths / 12);
  const k = s.skills;
  const t = s.traits;
  let rep = 0;
  let wins: number | null = null;
  let losses: number | null = null;
  let note = "";
  let fired = false;
  let profit: number | null = null;
  if (a.track === "coach") {
    const games = rung.games ?? 30;
    const skill = 0.5 * k.iq + 0.2 * k.decisions + 0.2 * t.composure + 0.1 * a.rep;
    const wp = clamp(0.5 + (skill - 30 - rung.bar * 0.55) / 90 + n1 * 0.13, 0.08, 0.92);
    wins = Math.round(games * wp);
    losses = games - wins;
    rep = n1 * 2;
    if (wp >= 0.72 && n2 > 0.4) {
      note = a.step >= 4 ? "Won the NBA title" : "Won the league title";
      rep += 2;
    } else if (wp >= 0.6) {
      note = "Made the playoffs";
      rep += 0.5;
    } else if (wp < 0.35) {
      note = "A rough year";
      rep -= 2;
    } else note = "A middle-of-the-pack year";
    fired = a.step >= 2 && wp < 0.38 && n3 < 0.55;
  } else if (a.track === "scout") {
    rep = n1 * 2;
    if (n2 > 0.88) {
      note = "A player you pushed for became a starter";
      rep += 3;
    } else if (n2 < 0.08) {
      note = "Your top recommendation flopped";
      rep -= 3;
    } else note = "Long nights of film and travel";
  } else if (a.track === "media") {
    rep = n1 * 2;
    if (n2 > 0.9) {
      note = "A segment of yours went viral";
      rep += 3;
    } else if (n2 < 0.07) {
      note = "An on-air gaffe";
      rep -= 4;
      fired = a.step >= 1 && n3 < 0.3;
    } else note = "Steady ratings";
  } else if (a.track === "podcast") {
    rep = n1 * 2;
    if (n2 > 0.88) {
      note = "A guest episode went viral";
      rep += 3;
    } else if (n2 < 0.08) {
      note = "A hot take backfired";
      rep -= 3;
    } else note = "Downloads held steady";
    if (rung.business) {
      profit = Math.round(rungPay({ ...rung, pay: rung.business }, a.countryId) * (0.3 + a.rep / 70) * (1 + n1 * 0.4));
      note += Math.abs(profit) < 1000 ? ", about break-even" : profit > 0 ? `, about $${Math.round(profit / 1000)}K profit` : `, about $${Math.round(-profit / 1000)}K lost`;
    }
  } else {
    rep = n1 * 2;
    if (rung.business) {
      profit = Math.round(rungPay({ ...rung, pay: rung.business }, a.countryId) * (0.4 + a.rep / 70) * (1 + n1 * 0.35));
      note = profit >= 0 ? `The business made about $${Math.round(profit / 1000)}K` : `The business lost about $${Math.round(-profit / 1000)}K`;
    } else note = n2 > 0.85 ? "A client of yours made a big leap" : "A full calendar of workouts";
    if (!rung.business && n2 > 0.85) rep += 2;
  }
  rep += 0.2 * (ceiling(s, a.track) - a.rep);
  let offer: YearResult["offer"] = null;
  const next = ladder[a.step + 1];
  const newRep = clamp(a.rep + rep, 0, 100);
  if (next && !fired && age < 62 && newRep >= next.bar && n4 < next.odds) {
    const where = rungCountry(next, homeBase(s));
    offer = { step: a.step + 1, title: next.title(s, where), employer: next.employer(s, where, a.step + 1), pay: next.business ? 0 : rungPay(next, where), cost: rungCost(next, where), where };
  }
  return { line: { year, age, title: a.title, employer: a.employer, wins, losses, note }, repDelta: rep, fired, offer, profit };
}

/** The reputation his talent for the job can hold over time. Results swing him around it. */
export function ceiling(s: LifeState, track: Track): number {
  const k = s.skills;
  const t = s.traits;
  const nba = s.nbaGames > 0 ? 6 + Math.min(10, s.nbaGames / 40) : 0;
  const v = {
    coach: 0.55 * k.iq + 0.2 * k.decisions + 0.2 * t.composure + nba * 0.5 - 12,
    scout: 0.65 * k.iq + 0.25 * k.decisions + nba * 0.3 - 10,
    media: 0.45 * t.confidence + 0.35 * s.exposure + nba - 8,
    podcast: 0.4 * t.confidence + 0.3 * s.exposure + 0.1 * k.iq + nba - 8,
    trainer: 0.15 * (k.shooting + k.handle + k.finishing) + 0.3 * t.discipline + nba * 0.5 - 12,
  }[track];
  return clamp(v, 5, 95);
}

export function canOpen(s: LifeState, cost: number) {
  return cost <= 0 || canPay(s, cost);
}
