import type { GmDraftPick, GmLeagueState, GmPlayer, GmPosition, GmTeam } from "@/gm/types";
import { draftRead, marketBoard } from "@/gm/engine/draft-intel";
import { resolveDraftOrder } from "@/gm/engine/draft-order";
import { draftAssetCatalog, executeDraftTrade, suggestDraftTrade, type DraftTradeProposal } from "@/gm/engine/draft-trades";
import { createRng } from "@/gm/engine/rng";
import { sortScoutBoard } from "@/gm/engine/scouting";

const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Weakest positions on a roster the team already knows. */
export function rosterNeeds(team: GmTeam, players: GmPlayer[]): GmPosition[] {
  const roster = players.filter((player) => player.teamId === team.id);
  const score = (position: GmPosition) => {
    const at = roster.filter((player) => player.position === position);
    if (!at.length) return -99;
    const best = Math.max(...at.map((player) => player.ratings.impact));
    const starterId = team.starters[position];
    const empty = !starterId || !roster.some((player) => player.id === starterId);
    return best - (empty ? 4 : 0);
  };
  return [...POSITIONS].sort((a, b) => score(a) - score(b));
}

/**
 * Each club ranks the room from its own roster, its goal, and a noisy eye.
 * The truth board is not the board they draft from.
 */
export function aiSelectProspect(state: GmLeagueState, teamId: string): string | null {
  const team = state.teams.find((club) => club.id === teamId);
  const pool = state.draftPool
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is GmPlayer => Boolean(player));
  if (!pool.length) return null;
  if (!team) return pool[0]!.id;

  const needs = rosterNeeds(team, state.players);
  const rng = createRng(hash(`${teamId}:${state.season}:${state.draftPickIndex ?? 0}`));
  const role = team.ownerGoal === "contend" ? "ready" : team.ownerGoal === "tank" ? "upside" : "value";
  const ranked = pool.map(player => {
    const read = draftRead(state, player, role, teamId);
    const fit = player.position === needs[0] ? 1.8 : player.position === needs[1] ? 0.6 : 0;
    return { id: player.id, score: read.score + fit - read.marketRank * 0.045 + (rng() - 0.5) * 4 };
  }).sort((a,b)=>b.score-a.score);
  return ranked[0]?.id ?? null;
}

function place(n: number): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

/** Morning-after grade for the user's pick. Names no one still in the pool. */
export function pickGrade(state: GmLeagueState, playerId: string): string {
  const player=state.players.find(row=>row.id===playerId);
  if(!player) return "The selection is recorded.";
  const market=classMockBoard(state).findIndex(row=>row.id===playerId)+1;
  const board=state.userDraftBoard?.indexOf(playerId);
  return (board!=null&&board>=0?"Your board had him "+place(board+1)+". ":"")+"Consensus #"+market+". His role and development will determine the value of this pick.";
}

export function orderedBoard(state: GmLeagueState, players: GmPlayer[]): GmPlayer[] {
  const pool = new Set(state.draftPool);
  const inRoom = players.filter((player) => pool.has(player.id));
  const saved = state.userDraftBoard?.filter((id) => pool.has(id)) ?? [];
  if (!saved.length) return sortScoutBoard(inRoom);
  const byId = new Map(inRoom.map((player) => [player.id, player]));
  const ranked = saved
    .map((id) => byId.get(id))
    .filter((player): player is GmPlayer => Boolean(player));
  const rest = sortScoutBoard(inRoom.filter((player) => !saved.includes(player.id)));
  return [...ranked, ...rest];
}

export function moveBoard(
  order: string[],
  playerId: string,
  dir: "up" | "down" | "top"
): string[] {
  const next = [...order];
  const index = next.indexOf(playerId);
  if (index < 0) return next;
  next.splice(index, 1);
  if (dir === "top") next.unshift(playerId);
  else if (dir === "up") next.splice(Math.max(0, index - 1), 0, playerId);
  else next.splice(Math.min(next.length, index + 1), 0, playerId);
  return next;
}

/** Build a 60-pick schedule from the lottery table (R1 then R2). */
export function expandDraftOrder(lotteryOrder: string[]): string[] {
  if (!lotteryOrder.length) return [];
  return [...lotteryOrder, ...lotteryOrder];
}

export function ensureDraftOrder(state: GmLeagueState): GmLeagueState {
  if (state.draftOrder?.length) return state;
  const lottery = state.lotteryOrder ?? [];
  if (!lottery.length) return state;
  return { ...state, ...resolveDraftOrder(state, lottery) };
}

export function pickOwnerAt(state: GmLeagueState, pickIndex = state.draftPickIndex ?? 0): string | null {
  if (state.draftOrder?.length) return state.draftOrder[pickIndex] ?? null;
  const order = state.lotteryOrder ?? [];
  if (!order.length) return null;
  if (pickIndex >= order.length * 2) return null;
  return order[pickIndex % order.length] ?? null;
}

export function draftSlotCount(state: GmLeagueState): number {
  if (state.draftOrder?.length) return state.draftOrder.length;
  return (state.lotteryOrder?.length ?? 0) * 2;
}

/** Scout mock for this class: remaining pool plus anyone already picked this year. */
export function classMockBoard(state: GmLeagueState): GmPlayer[] {
  return marketBoard(state);
}

export function mockRankOf(state: GmLeagueState, playerId: string): number {
  const rank = classMockBoard(state).findIndex((player) => player.id === playerId);
  return rank < 0 ? 99 : rank + 1;
}

export type DraftPickRow = {
  pick: number;
  teamId: string;
  player: GmPlayer;
  mockRank: number;
  sleeper: boolean;
  fall: number;
};

export function draftPickLog(state: GmLeagueState): DraftPickRow[] {
  return state.players
    .filter((player) => player.draftYear === state.season && player.draftPick != null && (player.draftedByTeamId || player.teamId))
    .map((player) => {
      const pick = player.draftPick!;
      const mockRank = mockRankOf(state, player.id);
      const fall = pick - mockRank;
      return {
        pick,
        teamId: player.draftedByTeamId ?? player.teamId!,
        player,
        mockRank,
        // Sleeper = board name who slid at least a half-dozen spots, or a
        // late pick who was mocked top-20 (steal flash on the ticker).
        sleeper: fall >= 6 || (pick >= 20 && mockRank <= 20 && fall >= 4),
        fall,
      };
    })
    .sort((a, b) => a.pick - b.pick);
}

/** True once every slot is filled (pool empty or pick index past the board). */
export function isDraftComplete(state: GmLeagueState): boolean {
  if (state.phase !== "draft") return false;
  if (!state.draftPool.length) return true;
  return (state.draftPickIndex ?? 0) >= draftSlotCount(state);
}

/** Your selections from this year's class, in pick order. */
export function userDraftPicks(state: GmLeagueState): DraftPickRow[] {
  return draftPickLog(state).filter((row) => row.teamId === state.userTeamId);
}

/**
 * Show the draft recap: board just finished, or summer still has this year's
 * picks on the books.
 */
export function shouldShowDraftResults(state: GmLeagueState): boolean {
  if (isDraftComplete(state)) return true;
  if (state.phase !== "free_agency" && state.phase !== "offseason") return false;
  return draftPickLog(state).length > 0;
}

export function fallingProspects(state: GmLeagueState, minFall = 4): Array<{
  player: GmPlayer;
  mockRank: number;
  fall: number;
}> {
  const pickNum = (state.draftPickIndex ?? 0) + 1;
  return classMockBoard(state)
    .filter((player) => state.draftPool.includes(player.id))
    .map((player, index) => {
      const mockRank = index + 1;
      return { player, mockRank, fall: pickNum - mockRank };
    })
    .filter((row) => row.fall >= minFall && row.mockRank <= 20)
    .slice(0, 5);
}

export type DraftNightOffer = {
  id:string; partnerTeamId:string; yourSlot:number; theirSlot:number; upSweetenerIds:string[];
  direction:"up"|"down"; blurb:string; youSend:string[]; youGet:string[]; youSendPoints:number; youGetPoints:number;
  proposal:DraftTradeProposal;
};

export function formatFuturePickLabel(pick:GmDraftPick,teams:GmTeam[]):string {
  const tag=teams.find(team=>team.id===pick.originalTeamId)?.abbr??pick.originalTeamId;
  return pick.season+" "+tag+" "+(pick.round===1?"1st":"2nd")+(pick.protectionTopN?" (top-"+pick.protectionTopN+" protected)":"");
}

/** Quotes are recreated from live ownership and never trust caller-supplied prices. */
export function draftNightOffers(state:GmLeagueState):DraftNightOffer[] {
  const league=ensureDraftOrder(state),index=league.draftPickIndex??0,owner=pickOwnerAt(league);
  if(league.phase!=="draft"||!owner) return [];
  const user=league.userTeamId,proposals:DraftTradeProposal[]=[];
  if(owner!==user) {
    const proposal=suggestDraftTrade(league,user,owner,index);
    if(proposal) proposals.push(proposal);
  } else {
    const later=[...new Set((league.draftOrder??[]).slice(index+1).filter(id=>id!==user))].slice(0,6);
    for(const buyer of later) {
      const proposal=suggestDraftTrade(league,buyer,user,index);
      if(proposal) proposals.push(proposal);
      if(proposals.length>=3) break;
    }
  }
  return proposals.map(proposal=>{
    const up=proposal.fromTeamId===user,partnerTeamId=up?proposal.toTeamId:proposal.fromTeamId;
    const send=up?proposal.send:proposal.receive,get=up?proposal.receive:proposal.send;
    const from=draftAssetCatalog(league,user),to=draftAssetCatalog(league,partnerTeamId);
    const match=(assets:typeof send,rows:typeof from)=>rows.filter(row=>assets.some(asset=>JSON.stringify(asset)===JSON.stringify(row.asset)));
    const sent=match(send,from),received=match(get,to);
    const yourSlot=send.find(asset=>asset.kind==="slot")?.slot??index,theirSlot=get.find(asset=>asset.kind==="slot")?.slot??index;
    return {id:"draft-call-"+hash(JSON.stringify(proposal)),partnerTeamId,yourSlot,theirSlot,upSweetenerIds:proposal.send.filter(asset=>asset.kind==="future").map(asset=>asset.id),direction:up?"up" as const:"down" as const,blurb:up?"A package is available for the pick on the clock.":"This club is willing to pay to move to your selection.",youSend:sent.map(row=>row.label+ (row.asset.kind==="slot"?" ("+(league.teams.find(t=>t.id===user)?.abbr??user)+")":"")),youGet:received.map(row=>row.label),youSendPoints:sent.reduce((sum,row)=>sum+row.points,0),youGetPoints:received.reduce((sum,row)=>sum+row.points,0),proposal};
  });
}

export function applyDraftNightTrade(state:GmLeagueState,offer:DraftNightOffer):GmLeagueState {
  const canonical=draftNightOffers(state).find(row=>row.id===offer.id);
  if(!canonical||JSON.stringify(canonical.proposal)!==JSON.stringify(offer.proposal)) return state;
  return executeDraftTrade(state,canonical.proposal).state;
}
