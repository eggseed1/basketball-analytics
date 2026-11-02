/**
 * The GM's scouting desk. Every recommendation is a staff interpretation of
 * visible amateur evidence and existing scouting reports, NOT a look at hidden
 * ceilings, development traits, ratings or career paths.
 *
 * Boards are intentionally competing viewpoints: someone can be ready to play
 * without having superstar upside, and a sleeper can still bust.
 */
import type { GmDraftRole, GmLeagueState, GmPlayer, GmPosition } from "@/gm/types";
import { amateurSeason, draftRead, draftScoutingOf, draftSleeperSignals, marketBoard } from "@/gm/engine/draft-intel";
import { rosterNeeds } from "@/gm/engine/draft-room";
import { ensureScoutKnack, expertiseLabel, scoutMatchBonus, type GmScout } from "@/gm/seed/scouts";
import { playerPipeline } from "@/gm/seed/staff-knacks";

export type ScoutDeskCategory = "sleepers" | "ready" | "fit" | "upside";
export interface ScoutDeskPick {
  player: GmPlayer;
  note: string;
  caution: string;
  /** Category-specific ranking; relative within the board, not an OVR. */
  score: number;
  /** Scout's estimated NBA readiness, not the player's actual overall. */
  readyRange: string;
}
export interface ScoutDeskBoard {
  id: ScoutDeskCategory;
  title: string;
  summary: string;
  picks: ScoutDeskPick[];
}
export interface ScoutDesk {
  scoutName: string;
  scoutLabel: string;
  headline: string;
  briefing: string;
  recommended: ScoutDeskCategory;
  boards: ScoutDeskBoard[];
}

const positions: Record<Exclude<NonNullable<GmScout["expertise"]>, "general">, GmPosition[]> = {
  guards: ["PG","SG"], wings: ["SG","SF","PF"], bigs: ["PF","C"],
  defense: ["SG","SF","PF","C"], offense: ["PG","SG","SF"],
  international: ["PG","SG","SF","PF","C"],
};

function scoutEdge(scout: GmScout | null | undefined, player: GmPlayer): number {
  if (!scout) return 0;
  const specialty = scout.expertise === "general" ? 0
    : scout.expertise === "international"
      ? playerPipeline(player) === "international" ? 4 : 0
      : (positions[scout.expertise]?.includes(player.position) ? 1.6 : 0);
  const knack = ensureScoutKnack(scout);
  const area = scout.expertise === "defense" ? "defense"
    : scout.expertise === "offense" ? "offense"
    : scout.expertise === "guards" ? "creation"
    : scout.expertise === "bigs" ? "defense"
    : scout.expertise === "wings" ? "shooting" : "overall";
  return specialty + scoutMatchBonus(knack, player.position, area, player) * 2.2;
}
function traitLine(scout: GmScout | null | undefined, player: GmPlayer): string {
  if (!scout) return "Our staff wants a longer look";
  const pipe = playerPipeline(player);
  if (scout.expertise === "international" && pipe === "international") return "My overseas tape assignment";
  if (scout.expertise === "guards" && ["PG","SG"].includes(player.position)) return "My backcourt evaluation";
  if (scout.expertise === "wings" && ["SG","SF","PF"].includes(player.position)) return "My wing translation read";
  if (scout.expertise === "bigs" && ["PF","C"].includes(player.position)) return "My frontcourt evaluation";
  if (scout.expertise === "defense") return "A defensive role worth studying";
  if (scout.expertise === "offense") return "An offensive fit worth studying";
  return "One to keep on our board";
}
function pickNote(category: ScoutDeskCategory, player: GmPlayer, league: GmLeagueState,
  scout: GmScout | null | undefined, needs: GmPosition[]): { note: string; caution: string } {
  const stats = amateurSeason(player);
  const read = draftRead(league, player);
  const signals = draftSleeperSignals(player).reasons;
  const first = player.position === needs[0], second = player.position === needs[1];
  const fit = first ? "Fills our biggest position need" : second ? "Addresses a thin rotation spot" : "";
  const specialist = traitLine(scout, player);
  const concrete = signals.find(x=>!x.includes("Young enough")) || read.strengths.find(x=>!x.includes("No single")) || "";
  let note = "";
  if (category === "sleepers") {
    note = [specialist, concrete || "Interesting but incomplete tape", "still on the later board"].join(" · ");
  } else if (category === "ready") {
    note = (player.age >= 22 ? "Experienced prospect" : "Rotation-ready indicators") +
      " · " + (concrete || `${stats.points.toFixed(1)} PPG in amateur play`) +
      ` · scout projects ${read.readyLow}–${read.readyHigh} readiness`;
  } else if (category === "fit") {
    note = (fit || "Useful complementary skillset") + " · " +
      (concrete || `${player.position} depth`) + " · " + specialist;
  } else {
    note = (player.age <= 20 ? "Long runway to develop" : "Development bet") + " · " +
      (concrete || specialist) + " · more upside than certainty";
  }
  const caution = read.report.medical === "concern" ? "Medical review raised availability concerns"
    : read.risks.find(r=>!r.includes("Film review")) ||
      (category === "ready" ? "NBA competition may expose role limitations"
        : category === "sleepers" ? "Public clues are not a guarantee of NBA translation"
        : "The development outcome remains uncertain");
  return {note,caution};
}

function deskTitle(scout: GmScout | null | undefined, category: ScoutDeskCategory): string {
  if (category === "sleepers") {
    return scout?.expertise === "international" ? "Overseas long shots"
      : scout?.expertise === "guards" ? "Backcourt diamonds"
      : scout?.expertise === "bigs" ? "Overlooked bigs"
      : scout?.expertise === "wings" ? "Wings under the radar"
      : scout?.expertise === "defense" ? "Defensive sleepers"
      : scout?.expertise === "offense" ? "Hidden offensive sparks" : "The overlooked files";
  }
  if (category === "ready") return "Can help us now";
  if (category === "fit") return "Built for our roster";
  return scout?.expertise === "international" ? "International projects" : "Swing for the ceiling";
}

/**
 * Decision guidance. Different GMs and head scouts naturally create different
 * boards, but changing hidden talent or potential must not change the picks.
 */
export function buildScoutDesk(league: GmLeagueState, limit = 4): ScoutDesk {
  const team = league.teams.find(t=>t.id === league.userTeamId);
  const scout = team?.staff.scout ?? null;
  const needs = team ? rosterNeeds(team,league.players) : [];
  const goal = team?.ownerGoal ?? "rebuild";
  const selectedRole: GmDraftRole = draftScoutingOf(league).strategy;
  const contender = goal === "contend";
  const rebuilding = goal === "tank";
  const recommended: ScoutDeskCategory = selectedRole === "ready" || (contender && selectedRole === "value") ? "ready"
    : selectedRole === "upside" || (rebuilding && selectedRole === "value") ? "upside"
    : selectedRole === "value" ? "fit" : "fit";
  const all = marketBoard(league).filter(p=>league.draftPool.includes(p.id));
  const prefix = scout?.name.split(" ")[0] ?? "Your staff";
  const source = all.map(player=>{
    const ready = draftRead(league,player,"ready");
    const future = draftRead(league,player,"upside");
    const value = draftRead(league,player,selectedRole);
    const signals = draftSleeperSignals(player);
    const market = player.consensusRank ?? value.marketRank;
    const edge = scoutEdge(scout,player);
    const need = player.position === needs[0] ? 6 : player.position === needs[1] ? 3 : 0;
    const stats = amateurSeason(player);
    const senior = player.age>=22?4:player.age===21?2:0;
    const young = player.age<=19?5:player.age===20?3:player.age===21?1:0;
    const experience = Math.min(3,stats.games/12);
    return {
      player,market,ready,value,future,signals,
      sleeper: (market>=22 ? 8 : -100) + signals.score*2.1 + edge*1.1 + (market>=31?3:0)
        + (market>=45?1:0) + Math.max(0,future.upsideHigh-ready.readyHigh)*0.28,
      readyScore: ready.readiness*1.6 + senior + experience + edge*.6
        + (contender?need*0.65:need*.25) - (ready.readyHigh-ready.readyLow)*.32,
      fitScore: value.score*1.35 + need*3 + edge + (contender?senior:young)*0.5,
      upsideScore: future.score*1.5 + young*2 + edge*.85
        + Math.max(0,future.upsideHigh-ready.readyHigh)*.65 + (market>=21?2:0),
    };
  });
  const chosen = new Set<string>();
  const categories: ScoutDeskCategory[] = [recommended, ...(["sleepers","ready","fit","upside"] as const).filter(x=>x!==recommended)];
  const boardsById = new Map<ScoutDeskCategory,ScoutDeskBoard>();
  for(const category of categories){
    const key = category === "sleepers" ? "sleeper" : category === "ready" ? "readyScore"
      : category === "fit" ? "fitScore" : "upsideScore";
    let eligible = source.filter(x=>category!=="sleepers" || x.market>=22);
    if(category==="upside") eligible=eligible.filter(x=>x.player.age<=22);
    eligible.sort((a,b)=>b[key]-a[key] || a.market-b.market || a.player.id.localeCompare(b.player.id));
    // Prefer contrasting advice instead of showing the same names four times.
    const unique = eligible.filter(x=>!chosen.has(x.player.id));
    const picks = [...unique,...eligible.filter(x=>chosen.has(x.player.id))].slice(0,Math.min(Math.max(limit,1),6))
      .map(x=>{
        chosen.add(x.player.id);
        const details=pickNote(category,x.player,league,scout,needs);
        return {player:x.player, score:Math.round(x[key]*10)/10,
          readyRange:`${x.ready.readyLow}–${x.ready.readyHigh}`,...details};
      });
    const summary = category==="sleepers" ? `${prefix} found reasons to revisit players other teams may pass over. A hunch isn't a guarantee.`
      : category==="ready" ? `For ${contender?"our playoff rotation":"early NBA minutes"}, ${prefix} favors experience and skills that can translate quickly.`
      : category==="fit" ? `Our thin spots are ${needs.slice(0,2).join(" and ")||"balanced"}. ${prefix} prioritizes the jobs we need filled.`
      : `${prefix} is looking for the long runway and development flashes. This is the riskier board.`;
    boardsById.set(category,{id:category,title:deskTitle(scout,category),summary,picks});
  }
  const boards=(["sleepers","ready","fit","upside"] as const).map(id=>boardsById.get(id)!);
  const goalText = contender ? "We are trying to win now" : rebuilding ? "We can afford to develop a project" : "We want both dependable depth and growth";
  const lens = scout ? `${expertiseLabel(scout.expertise).toLowerCase()} specialist · ${ensureScoutKnack(scout).knack.replaceAll("_"," ")}` : "general staff recommendations";
  const firstName = scout?.name ?? "Scouting department";
  return {
    scoutName:firstName,
    scoutLabel:lens,
    headline:`${firstName}'s draft room`,
    briefing:`${goalText}. ${prefix} is watching ${needs.slice(0,2).join(" and ")||"the entire roster"} help, with a ${lens} perspective. These are opinions from available tape and reports, never guaranteed ceilings.`,
    recommended,boards,
  };
}
