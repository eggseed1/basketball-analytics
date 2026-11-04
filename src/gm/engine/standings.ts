import type {
  GmLeagueState,
  GmPlayoffSeries,
  GmStandingsRow,
  GmTeam,
} from "@/gm/types";
import { createRng, uid } from "@/gm/engine/rng";

export function emptyStandings(teams: GmTeam[]): Record<string, GmStandingsRow> {
  return Object.fromEntries(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        wins: 0,
        losses: 0,
        confWins: 0,
        confLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ])
  );
}

export function applyGameToStandings(
  standings: Record<string, GmStandingsRow>,
  teams: GmTeam[],
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number
): Record<string, GmStandingsRow> {
  const next = { ...standings };
  const home = { ...next[homeId]! };
  const away = { ...next[awayId]! };
  const homeConf = teams.find((t) => t.id === homeId)!.conference;
  const awayConf = teams.find((t) => t.id === awayId)!.conference;
  const sameConf = homeConf === awayConf;

  home.pointsFor += homeScore;
  home.pointsAgainst += awayScore;
  away.pointsFor += awayScore;
  away.pointsAgainst += homeScore;

  if (homeScore > awayScore) {
    home.wins += 1;
    away.losses += 1;
    if (sameConf) {
      home.confWins += 1;
      away.confLosses += 1;
    }
  } else {
    away.wins += 1;
    home.losses += 1;
    if (sameConf) {
      away.confWins += 1;
      home.confLosses += 1;
    }
  }
  next[homeId] = home;
  next[awayId] = away;
  return next;
}

export function sortedStandings(
  standings: Record<string, GmStandingsRow>,
  conference?: "East" | "West",
  teams?: GmTeam[]
): GmStandingsRow[] {
  let rows = Object.values(standings);
  if (conference && teams) {
    const ids = new Set(
      teams.filter((t) => t.conference === conference).map((t) => t.id)
    );
    rows = rows.filter((r) => ids.has(r.teamId));
  }
  return rows.sort((a, b) => {
    const pa = a.wins / Math.max(1, a.wins + a.losses);
    const pb = b.wins / Math.max(1, b.wins + b.losses);
    if (pb !== pa) return pb - pa;
    return b.wins - a.wins;
  });
}

export function buildPlayoffBracket(
  state: GmLeagueState,
  seeds?: { East: string[]; West: string[] }
): GmPlayoffSeries[] {
  const east =
    seeds?.East ??
    sortedStandings(state.standings, "East", state.teams)
      .slice(0, 8)
      .map((row) => row.teamId);
  const west =
    seeds?.West ??
    sortedStandings(state.standings, "West", state.teams)
      .slice(0, 8)
      .map((row) => row.teamId);
  const series: GmPlayoffSeries[] = [];
  const pair = (conf: "East" | "West", rows: string[]) => {
    const order = [0, 7, 3, 4, 2, 5, 1, 6];
    for (let i = 0; i < 4; i++) {
      const high = order[i * 2]!;
      const low = order[i * 2 + 1]!;
      const a = rows[high]!;
      const b = rows[low]!;
      series.push({
        id: uid("series"),
        round: 1,
        conf,
        teamAId: a,
        teamBId: b,
        seedA: high + 1,
        seedB: low + 1,
        winsA: 0,
        winsB: 0,
        done: false,
        games: [],
      });
    }
  };
  pair("East", east);
  pair("West", west);
  return series;
}

/**
 * Higher seed hosts games 1, 2, 5, and 7. The other side hosts 3, 4, and 6.
 * Team A is the higher seed when seedA is the smaller number.
 */
export function seriesHosts(series: GmPlayoffSeries): { homeTeamId: string; awayTeamId: string } {
  const played = series.games?.length ?? series.winsA + series.winsB;
  const aIsHigher = (series.seedA ?? 1) <= (series.seedB ?? 8);
  const higher = aIsHigher ? series.teamAId : series.teamBId;
  const lower = aIsHigher ? series.teamBId : series.teamAId;
  const higherHosts = played === 0 || played === 1 || played === 4 || played === 6;
  return higherHosts
    ? { homeTeamId: higher, awayTeamId: lower }
    : { homeTeamId: lower, awayTeamId: higher };
}

/** Better regular-season record. Wins, then point differential. */
export function betterRecord(state: GmLeagueState, a: string, b: string): string {
  const left = state.standings[a];
  const right = state.standings[b];
  const winsA = left?.wins ?? 0;
  const winsB = right?.wins ?? 0;
  if (winsA !== winsB) return winsA > winsB ? a : b;
  const diffA = (left?.pointsFor ?? 0) - (left?.pointsAgainst ?? 0);
  const diffB = (right?.pointsFor ?? 0) - (right?.pointsAgainst ?? 0);
  if (diffA !== diffB) return diffA > diffB ? a : b;
  return a;
}

/** The 2027 NBA 3-2-1 lottery grants weighted balls to 16 teams. Historic
 * drafts through 2026 use four draws among 14 non-playoff teams. The 2030+
 * regime is not legislated yet; continue the current 3-2-1 rules in future
 * simulated seasons rather than silently reverting to a less realistic shuffle.
 * Draws are deterministic from the season and completed standings, never a
 * new Math.random() roll on reload. */
export type LotteryDraw = { teamId: string; balls: number[]; startingRank: number; oddsPct: number };
export type LotteryResult = { order: string[]; draws: LotteryDraw[]; lotteryCount: number; format: "classic" | "321" };

function lotterySeed(state: GmLeagueState): number {
  const rows = Object.values(state.standings).sort((a,b) => a.teamId.localeCompare(b.teamId));
  return rows.reduce((seed,row) => {
    for (const letter of row.teamId) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619);
    return Math.imul(seed ^ row.wins * 53 ^ row.losses * 97, 16777619);
  }, state.season ^ 0x9e3779b9) >>> 0;
}

export function drawDraftLottery(state: GmLeagueState, playoffIds?: Set<string>): LotteryResult {
  const overall = sortedStandings(state.standings, undefined, state.teams).reverse().map(r => r.teamId);
  const newRules = state.season >= 2027 && state.teams.length === 30;
  const rng = createRng(lotterySeed(state));
  if (newRules) {
    const nonPlayIn = new Set<string>();
    const playInTwo = new Set<string>();
    const playInOne = new Set<string>();
    for (const conf of ["East","West"] as const) {
      const rows = sortedStandings(state.standings, conf, state.teams).map(r => r.teamId);
      rows.slice(10).forEach(id => nonPlayIn.add(id));
      rows.slice(8,10).forEach(id => playInTwo.add(id));
      const matchup = state.playIn?.conferences.find(x => x.conf === conf);
      const loser = matchup?.sevenLoserId ?? rows[7];
      if (loser) playInOne.add(loser);
    }
    const eligible = overall.filter(id => nonPlayIn.has(id) || playInTwo.has(id) || playInOne.has(id));
    const relegated = new Set(overall.filter(id => nonPlayIn.has(id)).slice(0,3));
    const weight = (id: string) => relegated.has(id) ? 2 : nonPlayIn.has(id) ? 3 :
      playInTwo.has(id) ? 2 : 1;
    const left = [...eligible];
    const draws: LotteryDraw[] = [];
    for (let slot=1; slot<=eligible.length; slot++) {
      const forced = slot <= 12 && 13 - slot === left.filter(id => relegated.has(id)).length;
      const pool = forced ? left.filter(id => relegated.has(id)) : left;
      const total = pool.reduce((s,id) => s + weight(id),0);
      let roll = rng()*total;
      let winner = pool[pool.length-1]!;
      for (const id of pool) { roll -= weight(id); if (roll < 0) { winner=id;break; } }
      const startingRank = eligible.indexOf(winner)+1;
      draws.push({teamId:winner,balls:[1+Math.floor(rng()*37)],startingRank,
        oddsPct:Math.round(weight(winner)/37*1000)/10});
      left.splice(left.indexOf(winner),1);
    }
    return {order:[...draws.map(x=>x.teamId),...overall.filter(id=>!eligible.includes(id))],
      draws,lotteryCount:eligible.length,format:"321"};
  }

  const inPlayoffs = playoffIds ?? new Set([
    ...sortedStandings(state.standings,"East",state.teams).slice(0,8).map(x=>x.teamId),
    ...sortedStandings(state.standings,"West",state.teams).slice(0,8).map(x=>x.teamId)
  ]);
  const eligible = overall.filter(id=>!inPlayoffs.has(id));
  const weights = [140,140,140,125,105,90,75,60,45,30,20,15,10,5];
  // The 1,001 unordered four-ball combinations, of which one is unassigned.
  const combinations:number[][]=[];
  for(let a=1;a<=11;a++)for(let b=a+1;b<=12;b++)for(let d=b+1;d<=13;d++)for(let e=d+1;e<=14;e++)
    combinations.push([a,b,d,e]);
  const owners:string[]=[];
  eligible.forEach((id,i)=>{for(let n=0;n<(weights[i]??0);n++)owners.push(id);});
  const drawn:LotteryDraw[]=[];const taken=new Set<string>();
  let guard=0;
  while(drawn.length<Math.min(4,eligible.length) && guard++<20000){
    const index=Math.floor(rng()*combinations.length);
    const owner=owners[index];
    if(!owner || taken.has(owner))continue;
    taken.add(owner);
    drawn.push({teamId:owner,balls:combinations[index]!,startingRank:eligible.indexOf(owner)+1,
      oddsPct:(weights[eligible.indexOf(owner)]??0)/10});
  }
  const remainder=eligible.filter(id=>!taken.has(id));
  return {order:[...drawn.map(x=>x.teamId),...remainder,...overall.filter(id=>!inPlayoffs.has(id)&&!eligible.includes(id)),...overall.filter(id=>inPlayoffs.has(id))],
    draws:drawn,lotteryCount:eligible.length,format:"classic"};
}

export function computeLotteryOrder(state:GmLeagueState, playoffIds?:Set<string>):string[]{
  return drawDraftLottery(state,playoffIds).order;
}
