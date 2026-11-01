import type { GmAmateurSeason, GmDraftRole, GmDraftScouting, GmDraftTool, GmLeagueState, GmPlayer, GmProspectReport, GmScoutStudy } from "@/gm/types";
import { playerSheet } from "@/gm/engine/attributes";
import { clamp, createRng } from "@/gm/engine/rng";
import { scoutMatchBonus } from "@/gm/seed/scouts";

export const DRAFT_ROLES: ReadonlyArray<{ id: GmDraftRole; label: string; description: string }> = [
  { id: "value", label: "Best value", description: "Balance readiness, room to grow and what the market expects." },
  { id: "ready", label: "Help now", description: "Prioritize skills that can earn rotation minutes immediately." },
  { id: "upside", label: "Develop a prospect", description: "Accept a longer runway and a wider range of outcomes." },
  { id: "shooting", label: "Add shooting", description: "Check three-point volume, free throws and shooting film together." },
  { id: "creation", label: "Lead guard", description: "Look for passing, ball security and a usable scoring threat." },
  { id: "defense", label: "Perimeter defense", description: "Value lateral movement, defensive film and enough offense to stay on the court." },
  { id: "rim", label: "Protect the rim", description: "Size, timing and defensive reads matter more than a vertical alone." },
  { id: "connector", label: "Find a connector", description: "Seek decisions, passing and complementary skills around your stars." },
];
export const SCOUT_STUDIES: ReadonlyArray<{ id: GmScoutStudy; label: string; cost: number; description: string }> = [
  { id: "film", label: "Watch film", cost: 1, description: "Investigate one skill in games, including what happens away from the ball." },
  { id: "analytics", label: "Analytics review", cost: 1, description: "Check production, shooting samples and ball security in context." },
  { id: "workout", label: "Private workout", cost: 2, description: "Test a selected skill and current readiness. Four visits per class." },
  { id: "interview", label: "Interview", cost: 1, description: "Ask about preparation and feedback. Habits are a signal, not a promise." },
  { id: "medical", label: "Medical review", cost: 1, description: "Investigate availability risk before investing a pick." },
];
const TOOLS: GmDraftTool[] = ["shooting", "creation", "defense", "feel", "athleticism"];
export const DRAFT_TOOL_LABELS:Record<GmDraftTool,string>={shooting:"Shooting",creation:"Creation",defense:"Defense",feel:"Decisions and passing",athleticism:"Athleticism"};
export function draftHash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}
const round = (value: number) => Math.round(value * 10) / 10;

/** Public season evidence is fixed per prospect and shared by every club. */
export function amateurSeason(player: GmPlayer): GmAmateurSeason {
  if (player.amateur) return player.amateur;
  const rng = createRng(draftHash(player.id + ":amateur"));
  const a = playerSheet(player).attributes;
  const games = Math.round(18 + rng() * 18), minutes = round(17 + rng() * 16);
  const jitter = () => (rng() - 0.5);
  const threeAttempts = Math.round(games * (0.7 + a.threePoint / 24 + jitter()));
  const threeRate = clamp(0.19 + a.threePoint * 0.0025 + jitter() * 0.09, 0.19, 0.46);
  const ftAttempts = Math.round(games * (1 + a.drivingLayup / 30));
  const ftRate = clamp(0.37 + a.freeThrow * 0.005 + jitter() * 0.07, 0.45, 0.94);
  return {
    competition: player.pipeline === "international" ? player.college ?? "International senior league" : player.pipeline === "gleague" ? "Development league" : "College",
    games, minutes, points: round(5 + (a.closeShot + a.drivingLayup + a.threePoint) / 15 + jitter() * 5),
    rebounds: round(1 + (a.defReb + a.offReb) / 20 + jitter() * 2),
    assists: round(0.3 + a.passAccuracy / 20 + jitter() * 2), turnovers: round(clamp(3.6 - a.ballHandle / 32 + jitter(), 0.7, 4.1)),
    steals: round(clamp(a.steal / 45 + jitter() * 0.7, 0.3, 2.8)), blocks: round(clamp((a.block - 30) / 22 + jitter() * 0.8, 0.1, 3.6)),
    threeAttempts, threeMade: Math.round(threeAttempts * threeRate), ftAttempts, ftMade: Math.round(ftAttempts * ftRate),
  };
}

export function draftScoutingOf(league: GmLeagueState): GmDraftScouting {
  const old = league.draftScouting;
  return old?.version === 1 && old.season === league.season ? old : { version: 1, season: league.season, spent: 0, reports: {}, watchlist: [], strategy: "value" };
}
export function scoutingBudget(league: GmLeagueState): number {
  const eye = league.teams.find(team => team.id === league.userTeamId)?.staff.scout?.eye ?? 1;
  return 14 + eye * 2 + Math.min(6, league.seenScoutingMonths?.length ?? 0);
}
export function marketBoard(league: GmLeagueState): GmPlayer[] {
  const pool = new Set(league.draftPool);
  return league.players.filter(player => pool.has(player.id) || (player.draftYear === league.season && player.draftPick != null))
    .sort((a,b) => (a.consensusRank ?? a.scoutProfile?.boardRankHint ?? 999) - (b.consensusRank ?? b.scoutProfile?.boardRankHint ?? 999) || (b.consensus ?? -5) - (a.consensus ?? -5) || a.id.localeCompare(b.id));
}

export type DraftRead = {
  readiness: number; readyLow: number; readyHigh: number; upsideLow: number; upsideHigh: number;
  coverage: number; score: number; marketRank: number; tools: Record<GmDraftTool, number>; strengths: string[]; risks: string[];
  availability: string; report: GmProspectReport;
};
/** All recommendations use public evidence and a club's observations, never a hidden ceiling, path or trait. */
export function draftRead(league: GmLeagueState, player: GmPlayer, role: GmDraftRole = "value", teamId = league.userTeamId): DraftRead {
  const scout = league.teams.find(team => team.id === teamId)?.staff.scout;
  const eye = scout?.eye ?? 1;
  const rng = createRng(draftHash(player.id + ":board:" + teamId));
  const bias = (rng() - 0.5) * (8 - eye * 0.7);
  const stats = amateurSeason(player);
  const marketRank = player.consensusRank ?? marketBoard(league).findIndex(row => row.id === player.id) + 1;
  const report: GmProspectReport = teamId === league.userTeamId ? draftScoutingOf(league).reports[player.id] ?? { studies: {}, tools: {} } : { studies: {}, tools: {} };
  const threeRate = stats.threeMade / Math.max(1, stats.threeAttempts), ftRate = stats.ftMade / Math.max(1, stats.ftAttempts);
  const grade = (focus: GmDraftTool, prior: number) => {
    const g = player.scoutProfile?.grades[focus];
    const index = g ? ["F","D","C-","C","C+","B-","B","B+","A-","A","A+"].indexOf(g) : -1;
    // Other clubs cannot use the user's scout grades.
    return teamId === league.userTeamId && index >= 0 ? prior * 0.55 + (40 + index * 5) * 0.45 : prior;
  };
  const tools = {
    shooting: grade("shooting", clamp((threeRate - 0.15) * 180 + ftRate * 30, 35, 90)),
    creation: grade("creation", clamp(44 + stats.assists * 4 - stats.turnovers * 3, 35, 88)),
    defense: grade("defense", clamp(47 + stats.steals * 6 + stats.blocks * 5, 35, 90)),
    feel: grade("feel", clamp(42 + (stats.assists / Math.max(1, stats.turnovers)) * 7, 35, 90)),
    athleticism: grade("athleticism", player.scoutProfile?.combine ? clamp(40 + player.scoutProfile.combine.verticalIn, 40, 90) : 62),
  };
  for (const key of TOOLS) tools[key] = round(clamp((report.tools[key] ?? tools[key]) + bias, 25, 95));
  const baseline = clamp(78 - Math.max(0, marketRank - 1) * 0.25 + bias, 56, 83);
  const readiness = round(clamp(report.readiness ?? baseline * 0.8 + (Object.values(tools).reduce((a,b)=>a+b,0) / 5) * 0.2, 50, 86));
  const coverage = Math.min(0.9, 0.2 + Object.keys(report.studies).length * 0.13 + eye * 0.025);
  const width = Math.max(3, Math.round(9 - coverage * 7));
  const habits = report.habits === "strong" ? 2 : report.habits === "uncertain" ? -1 : 0;
  const runway = clamp((25 - player.age) * 1.25, 1, 9);
  const projection = clamp(readiness + runway + (tools.feel - 65) * 0.07 + habits, readiness, 94);
  let score = readiness * 0.6 + projection * 0.4;
  if (role === "ready") score = readiness;
  else if (role === "upside") score = projection + Math.min(3, (23 - player.age) * 0.5);
  else if (role === "shooting") score = tools.shooting * 0.65 + readiness * 0.35;
  else if (role === "creation") score = tools.creation * 0.55 + tools.feel * 0.25 + readiness * 0.2 + (player.position === "PG" ? 3 : 0);
  else if (role === "defense") score = tools.defense * 0.55 + tools.athleticism * 0.15 + readiness * 0.3 + (["SG","SF"].includes(player.position) ? 3 : -3);
  else if (role === "rim") score = tools.defense * 0.5 + clamp(48 + (player.heightIn - 72) * 2, 40, 90) * 0.3 + readiness * 0.2 + (["C","PF"].includes(player.position) ? 4 : -10);
  else if (role === "connector") score = tools.feel * 0.5 + tools.shooting * 0.2 + readiness * 0.3;
  const strengths: string[] = [], risks: string[] = [];
  if (threeRate >= 0.37 && stats.threeAttempts >= 90) strengths.push("Productive shooting on a meaningful sample");
  if (ftRate >= 0.8) strengths.push("Free-throw touch supports the shooting case");
  if (stats.assists / Math.max(0.1, stats.turnovers) >= 2.2) strengths.push("Creates for teammates while protecting the ball");
  if (tools.defense >= 72) strengths.push("Defensive indicators support a useful role");
  if (report.habits === "strong") strengths.push("Interview suggests a receptive learner");
  if (stats.threeAttempts < 90) risks.push("Small three-point sample");
  if (stats.turnovers > stats.assists) risks.push("Ball security needs a closer look");
  if (!report.studies.film) risks.push("Film review is incomplete");
  if (report.medical === "concern") risks.push("Medical review found availability concerns");
  if (player.age <= 20) risks.push("Needs time and a realistic development role");
  if (!strengths.length) strengths.push("No single standout signal yet; investigate a role before committing");
  const spread = Math.max(3, Math.round((1 - coverage) * 10));
  const nextUser = (league.draftOrder ?? []).findIndex((owner,index)=>owner===league.userTeamId && index >= (league.draftPickIndex ?? 0));
  const until = nextUser < 0 ? null : nextUser + 1;
  const availability = !league.draftOrder?.length && league.phase !== "draft" ? "Draft position will be set after the lottery." : until == null ? "No remaining selection. Explore a trade." : marketRank + spread < until ? "Likely gone before your next pick" : marketRank - spread > until ? "May be available at your next pick" : "Could go near your next selection";
  return { readiness, readyLow: Math.round(clamp(readiness - width, 45, 90)), readyHigh: Math.round(clamp(readiness + width, 45, 90)), upsideLow: Math.round(clamp(projection - width - 2, readiness - width, 94)), upsideHigh: Math.round(clamp(projection + width, 50, 98)), coverage, score: round(score), marketRank, tools, strengths, risks, availability, report };
}

export function studyProspect(league: GmLeagueState, playerId: string, method: GmScoutStudy, focus: GmDraftTool = "shooting"): { state: GmLeagueState; ok: boolean; reason: string } {
  const fail = (reason: string) => ({ state: league, ok: false, reason });
  if (!["regular","playoffs","play_in","offseason"].includes(league.phase) || (league.seasonFlow?.stage && !["review","staff","lottery","scouting"].includes(league.seasonFlow.stage))) return fail("Complete scouting before draft night. Your saved reports remain available during the draft.");
  const player = league.players.find(row => row.id === playerId && league.draftPool.includes(row.id));
  const study = SCOUT_STUDIES.find(row=>row.id===method);
  if (!player || !study || !TOOLS.includes(focus)) return fail("Choose a prospect and a scouting assignment.");
  const scouting = draftScoutingOf(league);
  const report: GmProspectReport = scouting.reports[playerId] ?? { studies: {}, tools: {} };
  if (report.studies[method]) return fail("This assignment is already complete. Use a different source of evidence.");
  if (scouting.spent + study.cost > scoutingBudget(league)) return fail("No scouting days remain. Compare your existing reports and public production.");
  if (method === "workout" && league.seasonFlow?.stage !== "scouting" && !(league.phase === "offseason" && !league.seasonFlow)) return fail("Private workouts open after the lottery, during draft preparation.");
  if (method === "workout" && Object.values(scouting.reports).filter(row=>row.studies.workout).length >= 4) return fail("All four private workout visits are booked.");
  const scout = league.teams.find(team=>team.id===league.userTeamId)?.staff.scout;
  const precision = clamp((scout?.eye ?? 1) + scoutMatchBonus(scout,player.position,method === "medical" || method === "interview" ? "overall" : focus,player),1,6);
  const rng = createRng(draftHash(player.id + ":" + league.userTeamId + ":" + method));
  const a = playerSheet(player).attributes;
  const truth: Record<GmDraftTool,number> = { shooting: (a.threePoint * 2 + a.freeThrow)/3, creation: (a.ballHandle+a.passAccuracy)/2, defense: (["PF","C"].includes(player.position) ? a.interiorDefense+a.block : a.perimeterDefense+a.steal)/2, feel: (a.passAccuracy*2+a.ballHandle)/3, athleticism: (a.agility+a.speed+a.stamina)/3 };
  const tools = { ...report.tools };
  const error = () => (rng()-0.5) * (18-precision*2);
  let note = "", readiness = report.readiness, habits = report.habits, medical = report.medical;
  if (method === "film" || method === "workout") {
    tools[focus] = round(clamp(truth[focus] + error(),25,95));
    readiness = round(clamp(playerSheet(player).overall + error() * 0.6,45,90));
    note = method === "film" ? "Film added a focused " + focus + " read. Check whether it fits the job you need." : "Workout tested " + focus + " and current readiness. A controlled session does not guarantee game production.";
  } else if (method === "analytics") {
    const stats = amateurSeason(player);
    tools.shooting = round(clamp(35 + stats.threeMade/Math.max(1,stats.threeAttempts)*65 + stats.ftMade/Math.max(1,stats.ftAttempts)*10 + error()*0.4,35,90));
    tools.feel = round(clamp(42 + stats.assists/Math.max(1,stats.turnovers)*8 + error()*0.4,35,90));
    note = "Production reviewed. Compare shooting volume and free-throw touch; account for competition and role.";
  } else if (method === "interview") {
    const signal = player.personality + error();
    habits = signal > 13 ? "strong" : signal < -8 ? "uncertain" : "steady";
    note = habits === "strong" ? "Preparation and feedback answers were encouraging. A good interview is one piece of evidence." : habits === "uncertain" ? "Preparation answers were inconsistent. Discuss a concrete development plan before investing." : "Described a steady routine. Staff and opportunity will still matter.";
  } else {
    medical = player.ratings.durability + error() < 62 ? "concern" : player.ratings.durability < 78 ? "monitor" : "clear";
    note = medical === "concern" ? "Availability concerns need to be weighed against the talent." : medical === "monitor" ? "Monitor workload and recovery. No medical projection is certain." : "No major availability concern in this review. Injury risk remains.";
  }
  const nextReport: GmProspectReport = { ...report, tools, readiness, habits, medical, studies: { ...report.studies, [method]: { day: league.day, focus: method === "film" || method === "workout" ? focus : undefined, note } } };
  return { ok: true, reason: note, state: { ...league, draftScouting: { ...scouting, spent: scouting.spent + study.cost, reports: { ...scouting.reports, [playerId]: nextReport } } } };
}

export function toggleDraftWatch(league: GmLeagueState, playerId: string): GmLeagueState {
  if (!league.draftPool.includes(playerId)) return league;
  const scouting = draftScoutingOf(league);
  return { ...league, draftScouting: { ...scouting, watchlist: scouting.watchlist.includes(playerId) ? scouting.watchlist.filter(id=>id!==playerId) : [...scouting.watchlist,playerId] } };
}
