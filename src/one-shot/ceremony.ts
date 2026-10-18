import type { LifeState, SeasonLine } from "./types";
import { country } from "./world";

/** Season `strength` is the league's rotation level. EuroLeague sits near 67. Taiwan is near 40. */
const TOP_LEAGUE = 66;

const NBA_MVP = /^NBA Most Valuable Player$/;
const FINALS_MVP = /^Finals MVP$/;
const DPOY = /^Defensive Player of the Year$/;
const ALL_NBA = /All-NBA/;
const ALL_NBA_FIRST = /All-NBA First Team/;
const ALL_STAR = /^NBA All-Star$/;

function awardCount(s: LifeState, re: RegExp): number {
  return s.seasons.reduce((n, x) => n + (x.awards ?? []).filter((a) => re.test(a)).length, 0);
}

function topLeagueMvps(s: LifeState): SeasonLine[] {
  return s.seasons.filter((x) => (x.awards ?? []).includes("League MVP") && x.strength >= TOP_LEAGUE);
}

function worldGold(s: LifeState) {
  return s.international.tournaments.find(
    (t) => t.medal === "gold" && (t.kind === "olympics" || t.kind === "world-cup") && !["none", "bench", "deep-bench"].includes(t.role),
  );
}

/**
 * The basketball hall, not a domestic one.
 * A couple of MVPs in a league the size of Taiwan's do not qualify.
 * An NBA MVP, a run of All-NBA teams, or a EuroLeague peak plus a world title does.
 */
export function hofEligible(s: LifeState): boolean {
  if (s.flags.hofDone) return false;
  const nbaMvp = awardCount(s, NBA_MVP);
  const finalsMvp = awardCount(s, FINALS_MVP);
  const dpoy = awardCount(s, DPOY);
  const allNba = awardCount(s, ALL_NBA);
  const allNbaFirst = awardCount(s, ALL_NBA_FIRST);
  const allStar = awardCount(s, ALL_STAR);
  const nbaYears = s.seasons.filter((x) => x.node === "nba" && x.gp >= 50).length;
  const titled = s.seasons.some((x) => (x.awards ?? []).includes("NBA champion") && (x.role === "star" || x.role === "starter"));
  const euroMvp = topLeagueMvps(s).length;
  const gold = Boolean(worldGold(s));

  if (nbaMvp || finalsMvp || dpoy) return true;
  if (allNbaFirst >= 2 || allNba >= 4) return true;
  if (allStar >= 6 && (titled || allNba >= 1)) return true;
  if (nbaYears >= 12 && allStar >= 5) return true;
  if (euroMvp >= 3) return true;
  if (euroMvp >= 2 && gold) return true;
  if (gold && (allNba >= 1 || euroMvp >= 1)) return true;
  return false;
}

const CHOICE_VERB = /^(Ask|Accept|Buy|Cut|Decline|Ease|Email|Fight|Find|Go|Help|Hire|Join|Keep|Learn|Leave|Look|Move|Outwork|Pass|Pick|Play|Post|Promise|Push|Put|Rest|Save|Send|Sign|Sit|Skip|Start|Stay|Stop|Switch|Take|Talk|Train|Turn|Wait|Work)\b/;

interface SpeechBeat {
  month: number;
  age: number;
  weight: number;
  line: string;
}

function ageAt(month: number): number {
  return Math.floor(month / 12);
}

function leagueName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Log lines are written as "You ...". The speech is him remembering it. */
function asSpeaker(text: string): string {
  return text.replace(/^You\b/, "I").replace(/\bYour\b/g, "My").replace(/\byour\b/g, "my").replace(/\byou\b/g, "me");
}

function words(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
}

/** The log stores a menu title and the label he picked. Say it once. */
function choiceLine(age: number, title: string, label: string, outcome: string): string {
  const labelLower = `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  const titleLower = `${title.charAt(0).toLowerCase()}${title.slice(1)}`;
  const labelWords = words(label);
  const titleWords = words(title);
  const same = labelWords.length > 0 && (labelWords.every((w) => titleWords.includes(w)) || titleWords.every((w) => labelWords.includes(w)));
  const phrase = CHOICE_VERB.test(label)
    ? `I decided to ${same && titleLower.startsWith(labelLower) ? titleLower : labelLower}`
    : `I went with ${labelLower}`;
  const remembered = outcome ? ` ${asSpeaker(outcome.replace(/\.$/, ""))}.` : "";
  if (same) return `At ${age} ${phrase}.${remembered}`;
  return `At ${age}, ${titleLower}: ${phrase}.${remembered}`;
}

function speakHistory(text: string, age: number): { weight: number; line: string } | null {
  const moved = text.match(/^(?:Moved to ([^.]+)\. )?Joined (.+?) \(([^)]+)\)/);
  if (moved) {
    const league = leagueName(moved[3]!);
    if (/mini|playground|home/i.test(league)) return null;
    const team = moved[2]!.trim();
    if (moved[1]) return { weight: 5, line: `At ${age} I moved to ${moved[1]} and joined ${team}.` };
    return { weight: 2, line: `At ${age} I joined ${team} in the ${league}.` };
  }
  const drafted = text.match(/^Drafted (\S+) overall(?: \(second round\))? by the ([^.]+)/);
  if (drafted) return { weight: 5, line: `I put my name in the draft at ${age}. The ${drafted[2]} took me ${drafted[1]} overall.` };
  if (text.startsWith("Undrafted")) return { weight: 4, line: `I put my name in the draft at ${age}, and nobody called it.` };
  if (text.includes("return to school") || text.startsWith("Not declaring")) return { weight: 4, line: `At ${age} I stayed in school and skipped the draft.` };
  if (text.startsWith("You take it in") || text === "You keep playing." || text.startsWith("The speech ends")) return null;
  const resigned = text.match(/^Re-signed with ([^:]+):/);
  if (resigned) return { weight: 4, line: `I re-signed with ${resigned[1]!.trim()} instead of leaving.` };
  if (text.startsWith("You turn the offers down")) return { weight: 4, line: `I turned down the offers in front of me and waited.` };
  if (text.startsWith("You accept the call-up")) return { weight: 5, line: `The NBA called, and I took the call-up.` };
  const twoWay = text.match(/^Signed a two-way contract with the ([^.]+)/);
  if (twoWay) return { weight: 4, line: `I signed a two-way with the ${twoWay[1]}.` };
  const camp = text.match(/^Signed a training camp deal with the ([^.]+)/);
  if (camp) return { weight: 4, line: `I took a training camp deal with the ${camp[1]} and tried to make the roster.` };
  if (text.startsWith("Signed with a G League")) return { weight: 4, line: `I signed in the G League and waited on a call.` };
  if (text.includes("highlight tape") || text.includes("calling clubs abroad")) return { weight: 4, line: `I sent my tape to clubs abroad.` };
  if (text.startsWith("You withdraw from the national")) return { weight: 3, line: `I sat out the national team that summer.` };
  if (text.startsWith("One more season")) return { weight: 3, line: `They asked if I was finished. I played another year.` };
  const colon = text.indexOf(": ");
  if (colon > 0 && age >= 8) {
    const title = text.slice(0, colon);
    const rest = text.slice(colon + 2);
    const split = rest.indexOf(". ");
    const label = (split >= 0 ? rest.slice(0, split) : rest).replace(/\.$/, "");
    const outcome = split >= 0 ? rest.slice(split + 2).split(/(?<=\.)\s+/)[0]! : "";
    if (!label || label.length > 80) return null;
    return { weight: age >= 16 ? 3 : 2, line: choiceLine(age, title, label, outcome) };
  }
  return null;
}

function speechBeats(s: LifeState): string[] {
  const beats: SpeechBeat[] = [];
  for (const h of s.history) {
    if (h.kind !== "move" && h.kind !== "draft" && h.kind !== "decision") continue;
    const age = ageAt(h.month);
    const spoken = speakHistory(h.text, age);
    if (!spoken) continue;
    beats.push({ month: h.month, age, ...spoken });
  }
  const early = beats.filter((b) => b.age < 16).sort((a, b) => b.weight - a.weight || a.month - b.month).slice(0, 2);
  const later = beats.filter((b) => b.age >= 16).sort((a, b) => b.weight - a.weight || a.month - b.month).slice(0, 3);
  return [...early, ...later].sort((a, b) => a.month - b.month).map((b) => b.line);
}

function honorLine(s: LifeState): string | null {
  const mvp = awardCount(s, NBA_MVP);
  const finals = awardCount(s, FINALS_MVP);
  const dpoy = awardCount(s, DPOY);
  const allNba = awardCount(s, ALL_NBA);
  const stars = awardCount(s, ALL_STAR);
  const euro = topLeagueMvps(s);
  const gold = worldGold(s);
  if (mvp) return mvp === 1 ? "They named me MVP once." : `They named me MVP ${mvp} times.`;
  if (finals) return finals === 1 ? "I won Finals MVP." : `I won Finals MVP ${finals} times.`;
  if (dpoy) return dpoy === 1 ? "I won Defensive Player of the Year." : `I won Defensive Player of the Year ${dpoy} times.`;
  if (allNba >= 2) return `I made All-NBA ${allNba} times.`;
  if (euro.length) {
    const league = leagueName(euro[0]!.levelLabel);
    return euro.length === 1 ? `I was the best player in the ${league} once.` : `I was the best player in the ${league} ${euro.length} times.`;
  }
  if (stars >= 5) return `I made the All-Star game ${stars} times.`;
  if (gold) return `We won gold at the ${gold.name}.`;
  return null;
}

/** He gives the speech. Decisions come from this life's log, in the order he made them. */
export function hofSpeech(s: LifeState): string {
  const place = s.birthplace.locality || country(s.birthplace.countryId).name;
  const lines = ["Thank you.", `I am ${s.identity.displayName}, from ${place}.`];
  const beats = speechBeats(s);
  if (beats.length) lines.push(...beats);
  else {
    const played = s.seasons.filter((x) => x.gp >= 8 && x.teamName);
    const first = played[0];
    const last = played[played.length - 1];
    if (first) lines.push(`I started at ${first.ageYears} with ${first.teamName}.`);
    if (last && last !== first && last.teamName !== first?.teamName) lines.push(`I finished with ${last.teamName}.`);
  }
  const honor = honorLine(s);
  if (honor) lines.push(honor);
  const gold = worldGold(s);
  if (gold && honor && !honor.includes(gold.name)) lines.push(`We won gold at the ${gold.name}.`);
  if (s.family.support === "high") lines.push("My parents kept paying for the gym and the trips.");
  else if (s.finance.agent) lines.push(`My agent was ${s.finance.agent.name}.`);
  return lines.join(" ");
}
