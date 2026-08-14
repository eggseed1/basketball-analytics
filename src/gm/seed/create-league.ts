import type {
  GmLeagueState,
  GmPlayer,
  GmPosition,
  GmRatings,
  GmTeam,
  ScoutedRatings,
} from "@/gm/types";
import { DEFAULT_SETTINGS } from "@/gm/types";
import { FRANCHISES, emptyStarters } from "@/gm/seed/franchises";
import { createRng, pick, randInt, uid, clamp } from "@/gm/engine/rng";
import { generateSchedule } from "@/gm/engine/schedule";
import { emptyStandings } from "@/gm/engine/standings";
import { autoSetLineup } from "@/gm/engine/lineup";
import { createDraftClass } from "@/gm/seed/prospect-identities";
import { sealProspect } from "@/gm/engine/scouting";
import {
  defaultTeamScout,
  effectiveScoutLevel,
  generateScoutMarket,
} from "@/gm/seed/scouts";

const FIRST = [
  "Jordan", "Alex", "Chris", "Micah", "Devon", "Kai", "Roman", "Ellis",
  "Mateo", "Noah", "Caleb", "Isaiah", "Malik", "Andre", "Tyrese", "Jalen",
  "Zion", "Pavel", "Omar", "Hugo", "Nico", "Seth", "Quinn", "Miles",
];
const LAST = [
  "Harper", "Brooks", "Nguyen", "Patel", "Okoye", "Silva", "Kowalski",
  "Anders", "Reyes", "Grant", "Bishop", "Frost", "Hale", "Mercer",
  "Vance", "Crowe", "Dunn", "Blair", "Nash", "Pike", "Shaw", "Wilder",
];
const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

function makeRatings(rng: () => number, starChance: number): GmRatings {
  const star = rng() < starChance;
  const impact = star
    ? 2 + rng() * 5
    : rng() < 0.15
      ? 0.5 + rng() * 2
      : -1.5 + rng() * 2.5;
  return {
    impact: Math.round(impact * 100) / 100,
    offense: impact * 0.7 + (rng() - 0.5) * 2,
    defense: impact * 0.5 + (rng() - 0.5) * 2,
    shooting: randInt(rng, 20, 90),
    finishing: randInt(rng, 25, 90),
    playmaking: randInt(rng, 15, 90),
    rebounding: randInt(rng, 15, 90),
    durability: randInt(rng, 55, 95),
    potential: clamp(impact + rng() * 3, 0, 9),
  };
}

function scoutView(
  trueR: GmRatings,
  scoutLevel: number,
  rng: () => number
): ScoutedRatings {
  const noise = (2.5 - scoutLevel * 0.35) * (rng() - 0.5);
  const known = scoutLevel >= 3 || rng() > 0.35;
  return {
    impact: known ? Math.round((trueR.impact + noise) * 100) / 100 : null,
    offense: known ? trueR.offense + noise * 0.5 : null,
    defense: known ? trueR.defense + noise * 0.5 : null,
    uncertainty: known ? clamp(1.2 - scoutLevel * 0.2, 0.1, 1) : 1,
  };
}

function makePlayer(
  rng: () => number,
  teamId: string | null,
  scoutLevel: number,
  starChance: number
): GmPlayer {
  const ratings = makeRatings(rng, starChance);
  const age = randInt(rng, 19, 36);
  const pos = pick(rng, POSITIONS);
  const salary = clamp(
    1.2 + Math.max(0, ratings.impact) * 5.5 + (age < 25 ? 1 : 0),
    1.0,
    55
  );
  return {
    id: uid("p"),
    name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
    teamId,
    position: pos,
    age,
    heightIn: pos === "C" ? randInt(rng, 82, 87) : randInt(rng, 72, 84),
    weightLbs: randInt(rng, 180, 280),
    ratings,
    scouted: scoutView(ratings, scoutLevel, rng),
    contract: teamId
      ? {
          yearsRemaining: randInt(rng, 1, 4),
          annualSalaryM: Math.round(salary * 10) / 10,
          birdRights: age > 26 ? "bird" : "early",
          signedSeason: 2026 - randInt(rng, 0, 3),
        }
      : null,
    injury: null,
    morale: randInt(rng, 45, 90),
    personality: randInt(rng, -20, 30),
    minutesPreference: randInt(rng, 18, 36),
  };
}

export function createGeneratedLeague(options?: {
  userTeamId?: string;
  season?: number;
  seed?: number;
}): GmLeagueState {
  const seed = options?.seed ?? Date.now() % 1_000_000;
  const rng = createRng(seed);
  const season = options?.season ?? 2026;
  const userTeamId = options?.userTeamId ?? "bos";

  const teams: GmTeam[] = FRANCHISES.map((f, i) => {
    const scout = defaultTeamScout(seed + i * 31 + f.id.charCodeAt(0));
    const trainerLevel = randInt(rng, 1, 5);
    return {
      ...f,
      ownerPatience: randInt(rng, 30, 90),
      ownerGoal: pick(rng, ["contend", "retool", "tank"] as const),
      fanConfidence: randInt(rng, 35, 80),
      payrollLuxuryTaxM: 0,
      staff: {
        headCoach: {
          name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
          offenseBonus: (rng() - 0.5) * 3,
          defenseBonus: (rng() - 0.5) * 3,
          developmentBonus: rng() * 1.5,
        },
        scout,
        scoutLevel: scout.eye,
        trainerLevel,
      },
      starters: emptyStarters(),
      benchOrder: [],
      draftPicks: [
        {
          id: uid("dp"),
          season,
          round: 1,
          originalTeamId: f.id,
          ownerTeamId: f.id,
        },
        {
          id: uid("dp"),
          season,
          round: 2,
          originalTeamId: f.id,
          ownerTeamId: f.id,
        },
        {
          id: uid("dp"),
          season: season + 1,
          round: 1,
          originalTeamId: f.id,
          ownerTeamId: f.id,
        },
      ],
      tradeExceptionsM: [],
    };
  });

  const players: GmPlayer[] = [];
  for (const team of teams) {
    const starChance = team.ownerGoal === "contend" ? 0.18 : 0.08;
    for (let i = 0; i < 15; i++) {
      players.push(
        makePlayer(rng, team.id, team.staff.scoutLevel, starChance)
      );
    }
  }

  // Free agents + draft pool
  for (let i = 0; i < 40; i++) {
    const p = makePlayer(rng, null, 2, 0.05);
    p.contract = null;
    players.push(p);
  }
  const userStaff = teams.find((t) => t.id === userTeamId)?.staff;
  const userScout = userStaff?.scout ?? null;
  const userScoutLevel = effectiveScoutLevel(userScout, userStaff?.scoutLevel ?? 1);
  const prospects = createDraftClass({
    count: 60,
    seasonEndYear: season,
    scoutLevel: userScoutLevel,
    rng,
    seal: (player, scoutLevel, boardIndex, r) =>
      sealProspect(player, scoutLevel, boardIndex, r, userScout),
  });
  players.push(...prospects);
  const draftPool = prospects.map((p) => p.id);
  const scoutMarket = generateScoutMarket(seed + 777, 5);

  let state: GmLeagueState = {
    version: 1,
    season,
    day: 0,
    phase: "regular",
    userTeamId,
    settings: { ...DEFAULT_SETTINGS },
    teams,
    players,
    freeAgents: players.filter((p) => p.teamId === null && !draftPool.includes(p.id)).map((p) => p.id),
    draftPool,
    scoutMarket,
    schedule: [],
    standings: emptyStandings(teams),
    boxScores: [],
    news: [
      {
        id: uid("news"),
        day: 0,
        season,
        headline: "Franchise Lab league created",
        body: "Welcome to a deep front-office sim. Set your lineup, manage the cap, and chase a title.",
        tone: "info" as const,
      },
    ],
    tradeLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.schedule = generateSchedule(state.teams, season, seed);
  state.teams = state.teams.map((t) => autoSetLineup(t, state.players));
  return state;
}
