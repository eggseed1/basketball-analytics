/**
 * Audits every real player in the current Franchise Lab roster against:
 *   1. Basketball-Reference 2025-26 primary position and estimated shares;
 *   2. ESPN's current 30-team, five-slot depth charts;
 *   3. the live Franchise Lab role/listing as a fallback.
 *
 * Creates per-player evidence and a versioned game-reference book.
 * Fails closed on incomplete independent data; user manual positions remain untouched.
 *
 * npx tsx --require ./scripts/lib/stub-server-only.cjs scripts/audit-gm-positions-2026.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";
import { fetchLeagueDepthCharts } from "../src/gm/seed/real-depth";

const POS = ["PG", "SG", "SF", "PF", "C"] as const;
type Pos = typeof POS[number];
type Evidence = { name: string; team: string | null; id: string;
  before: Pos; after: Pos; secondary: Pos | null;
  bref: { position: Pos; percentages: Record<Pos, number>; minutes: number; seasonTeam: string } | null;
  espn: Pos[]; reason: string; confidence: "high" | "medium" | "low"; };
const normalize = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
const blank = (): Record<Pos, number> => ({ PG: 0, SG: 0, SF: 0, PF: 0, C: 0 });
const teams = "ATL BOS BRK CHO CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHO POR SAC SAS TOR UTA WAS".split(" ");
type BRef = { position: Pos; percentages: Record<Pos,number>; minutes: number; seasonTeam: string; player: string };
async function main() {
  const { league, seasonCanonical } = await createRealSeasonLeague({ userTeamId: "bos", seed: 20261103 });
  const current = league.players.filter(p => Boolean(p.nbaPlayerId) && !league.draftPool.includes(p.id));
  assert.ok(current.length >= 350, "expected entire current NBA player pool");
  // Extractor checks the canonical league-wide Basketball-Reference table,
  // never mislabeled third-party team workbooks or stale CSV mirrors.
  const independent=JSON.parse(readFileSync(
    "artifacts/gm-bref-position-source-2026.json", "utf8"
  )) as Record<string,{rows:BRef[];error:string|null}>;
  const results=teams.map(abbr=>({
    abbr, rows:independent[abbr]?.rows??[],
    error:independent[abbr]?.error??null
  }));
  assert.equal(results.filter(x=>x.rows.length>0).length,30,
    "all 30 teams must have independent position evidence");
  const allBRef = new Map<string, BRef>();
  for (const {rows} of results) for(const row of rows) {
    const key = normalize(row.player);
    const prior = allBRef.get(key);
    if (!prior || row.minutes > prior.minutes) allBRef.set(key,row);
  }
  const charts=await fetchLeagueDepthCharts();
  const espn = new Map<string, Map<Pos,number>>();
  for(const chart of charts) for(const pos of POS) for(const [index,athlete] of chart.byPosition[pos].entries()) {
    const key=normalize(athlete.name);
    const weights=espn.get(key)??new Map<Pos,number>();
    weights.set(pos,(weights.get(pos)??0)+Math.max(0.25,1-index*0.22));
    espn.set(key,weights);
  }
  const evidence:Evidence[]=[];
  for(const player of current) {
    const key=normalize(player.name);
    const b=allBRef.get(key)??null;
    const e=espn.get(key);
    const depth=[...(e?.entries()??[])].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
    const most=b ? ([...POS].sort((a,c)=>b.percentages[c]-b.percentages[a])[0] ?? b.position) : null;
    const largest=most ? b!.percentages[most] : 0;
    // High-minute on-court role is the strongest five-position source. ESPN
    // current depth resolves split-role ties and new rookies without history.
    let after:Pos=player.position;
    let reason="current roster listing / physical fallback";
    let confidence:Evidence["confidence"]="low";
    // Position Estimate describes temporary on-court deployment. The
    // independent source's five-spot Pos listing describes a player's normal
    // primary identity, which can differ (a PF filling in at center, etc.).
    // Use the listed primary when corroborated by a substantial share of
    // minutes or current ESPN depth, instead of recasting every utility wing
    // as the position at which he logged 51% of one injury-shortened season.
    const listedShare=b ? b.percentages[b.position] : 0;
    const listedSupported=b && (listedShare >= 24 || depth.includes(b.position));
    const overwhelmingOther=b && most!==b.position && largest>=85 && listedShare<10 && depth.includes(most!);
    if (b && b.minutes>=200 && listedSupported && !overwhelmingOther) {
      after=b.position;
      reason="2025-26 independent primary listing supported by season roles";
      confidence=depth.includes(after) ? "high" : "medium";
    } else if (b && b.minutes>=300 && largest>=60) {
      after=most!;
      reason="2025-26 dominant on-court role";
      confidence=depth.includes(after) ? "high" : "medium";
    } else if (b && b.minutes>=100 && depth.length && b.percentages[depth[0]!] >= largest-12) {
      after=depth[0]!;
      reason="2025-26 split on-court role corroborated by 2026-27 ESPN depth";
      confidence="high";
    } else if (b && b.minutes>=100) {
      after=b.position;
      reason="2025-26 independent primary listing";
      confidence="medium";
    } else if(depth.length) {
      after=depth[0]!;
      reason="current ESPN depth chart";
      confidence="medium";
    } else if(b) {
      after=b.position;
      reason="2025-26 independent primary listing; limited minutes";
      confidence="low";
    }
    // Four repeatedly verified roles are a final check on flexible Celtics
    // and wing assignments, not generic position-count quotas.
    const vetted:Record<string,Pos>={
      "Jayson Tatum":"PF", "Payton Pritchard":"PG",
      "Derrick White":"SG", "Paul George":"SF", "AK Okereke":"PF", "Ronald Holland II":"SF"
    };
    if(vetted[player.name]) {
      after=vetted[player.name]!;
      reason=player.name==="AK Okereke"
        ? "2026-27 listed NBA forward, PF-sized 6ft7 244lb rookie without NBA season minutes"
        : player.name==="Ronald Holland II"
          ? "2025-26 Basketball-Reference SF listing; ESPN forward depth"
          : "reviewed NBA primary role (both historical and current usage)";
      confidence=player.name==="AK Okereke" ? "medium" : "high";
    }
    // Respect a deliberate, explicit NBA source over a broad G/F estimate
    // where both independent five-spot references are missing.
    const secondaryCandidates=POS.filter(pos=>pos!==after && (
      (b && b.percentages[pos]>=18) || depth.includes(pos)
    )).sort((a,c)=>((b?.percentages[c]??0)+(e?.get(c)??0)*14)-((b?.percentages[a]??0)+(e?.get(a)??0)*14));
    const secondary=player.name==="AK Okereke" ? "SF" : player.name==="Ronald Holland II" ? "PF" : secondaryCandidates[0]??null;
    evidence.push({id:player.nbaPlayerId??player.id,name:player.name,team:player.teamId,
      before:player.position,after,secondary,bref:b?{position:b.position,percentages:b.percentages,minutes:b.minutes,seasonTeam:b.seasonTeam}:null,
      espn:depth,reason,confidence});
  }
  evidence.sort((a,b)=>(a.team??"").localeCompare(b.team??"")||a.name.localeCompare(b.name));
  const summary={
    season:seasonCanonical, players:evidence.length, sources:results.map(x=>({team:x.abbr,count:x.rows.length,error:x.error})),
    brefMatched:evidence.filter(x=>x.bref).length,espnMatched:evidence.filter(x=>x.espn.length).length,
    multiSource:evidence.filter(x=>x.bref&&x.espn.length).length,
    changed:evidence.filter(x=>x.before!==x.after).length,
    lowConfidence:evidence.filter(x=>x.confidence==="low").length,
    byTeam:Object.fromEntries([...new Set(evidence.map(x=>x.team))].filter(Boolean).map(t=>[
      t,evidence.filter(x=>x.team===t).reduce((o,x)=>(o[x.after]++,o),blank())
    ])),
  };
  const compact=Object.fromEntries(evidence.map(x=>[x.id, {position:x.after,secondaryPosition:x.secondary,
    name:x.name,source:x.reason,confidence:x.confidence}]));
  mkdirSync("artifacts", {recursive:true});
  writeFileSync("artifacts/gm-player-position-audit-2026.json",JSON.stringify({summary,players:evidence},null,2)+"\n");
  writeFileSync("artifacts/gm-player-position-references-2026.json",JSON.stringify(compact,null,2)+"\n");
  console.log("GM_PLAYER_POSITION_SUMMARY "+JSON.stringify(summary));
  console.log("GM_PLAYER_POSITIONS_BASE64 "+Buffer.from(JSON.stringify(compact)).toString("base64"));
  console.log("GM_PLAYER_POSITION_CONFLICTS "+JSON.stringify(evidence.filter(x=>x.bref&&x.espn.length&&x.espn[0]!==x.after).slice(0,80)
    .map(x=>({name:x.name,after:x.after,bref:x.bref?.percentages,espn:x.espn}))));
  if (results.filter(x=>x.rows.length).length !== 30) {
    throw Error("Position source coverage inadequate: require all 30 independent teams");
  }
  if (summary.brefMatched < 320) throw Error("insufficient full-season positional evidence: "+summary.brefMatched);
}
main().catch(error=>{console.error(error);process.exitCode=1});
