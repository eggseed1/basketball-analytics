import { calendar } from "./career";
import { eraAt } from "./era";
import { netWorth } from "./finance";
import { races } from "./league";
import { rivalPeer, rivalPlotValue } from "./peers";
import { coachToneOf, TONE_LABEL } from "./team";
import type { LifeState } from "./types";

export interface PlotLine {
  id: string;
  label: string;
  value: string;
  /** Live arc beat vs durable fact. Threads sort first in the card. */
  kind?: "fact" | "thread";
}

const STYLE_LABEL: Record<string, string> = {
  scorer: "Scorer",
  connector: "Connector",
  defender: "Defender",
};

const AMBITION_LABEL: Record<string, string> = {
  nba: "Make the NBA",
  nation: "Wear the national shirt",
  money: "Provide for the family",
  longevity: "Play as long as the body allows",
};

function ambitionLine(s: LifeState): PlotLine | null {
  const ambition = typeof s.flags.ambition === "string" ? s.flags.ambition : null;
  if (!ambition || !AMBITION_LABEL[ambition]) return null;
  let value = AMBITION_LABEL[ambition]!;
  if (ambition === "nba") {
    if (s.achievements.nbaDebut !== null) value = "Make the NBA · reached";
    else if (s.achievements.drafted) value = "Make the NBA · drafted";
  } else if (ambition === "nation") {
    const caps = s.international.caps;
    value = caps >= 5 ? `National shirt · ${caps} caps` : caps > 0 ? `National shirt · ${caps} cap${caps === 1 ? "" : "s"}` : value;
  } else if (ambition === "money") {
    const w = netWorth(s.finance);
    if (w >= 1_000_000) value = "Provide · seven figures";
    else if ((s.placement.contract?.salary ?? 0) > 0 || s.earnings > 0) value = "Provide · earning";
  } else if (ambition === "longevity" && s.ageMonths >= 30 * 12) {
    value = `Play long · age ${Math.floor(s.ageMonths / 12)}`;
  }
  return { id: "ambition", label: "Ambition", value, kind: "fact" };
}

/** Active mid-career threads the player can chase this season. */
function plotThreads(s: LifeState): PlotLine[] {
  const out: PlotLine[] = [];
  if (s.flags.betOnSelf === true) {
    const left = s.placement.contract?.yearsLeft;
    out.push({
      id: "thread-prove",
      label: "Thread",
      value: left === 1 ? "Prove-it year · last season on this deal" : left != null ? `Prove-it · ${left} year${left === 1 ? "" : "s"} left` : "Prove-it year · betting on yourself",
      kind: "thread",
    });
  } else if (s.placement.contract && s.placement.contract.yearsLeft === 1 && ["nba", "domestic-pro", "foreign-pro"].includes(s.placement.node)) {
    out.push({
      id: "thread-option",
      label: "Thread",
      value:
        s.placement.node === "nba" && ["starter", "star"].includes(s.placement.role)
          ? "Extension year · team can lock you up"
          : "Contract year · one season left",
      kind: "thread",
    });
  }

  const line = s.season;
  if (line?.node === "nba" && line.gp >= 12 && line.nbaYear !== undefined) {
    const games = line.wins + line.losses || line.gp;
    const rookie = !s.seasons.some((x) => x.node === "nba" && x.gp > 0 && x.nbaYear !== line.nbaYear);
    const list = races(line, {
      role: s.placement.role,
      rookie,
      winPct: games ? line.wins / games : 0,
      gamesLeft: Math.max(0, 82 - games),
    });
    const mvp = list.find((r) => r.id === "mvp");
    const allNba = list.find((r) => r.id === "all-nba");
    const as = list.find((r) => r.id === "all-star");
    if (mvp && mvp.status !== "out") {
      out.push({
        id: "thread-mvp",
        label: "Thread",
        value: mvp.status === "in" ? `MVP chase · ${mvp.now}` : `MVP · close (${mvp.now})`,
        kind: "thread",
      });
    } else if (allNba && allNba.status !== "out") {
      out.push({
        id: "thread-allnba",
        label: "Thread",
        value: allNba.status === "in" ? `All-NBA · on track (${allNba.now})` : `All-NBA · close (${allNba.now})`,
        kind: "thread",
      });
    } else if (as && as.status !== "out") {
      out.push({
        id: "thread-as",
        label: "Thread",
        value: as.status === "in" ? `All-Star · on track (${as.now})` : `All-Star · close (${as.now})`,
        kind: "thread",
      });
    } else {
      const sixth = list.find((r) => r.id === "6moy");
      if (sixth && sixth.status !== "out") {
        out.push({
          id: "thread-6th",
          label: "Thread",
          value: sixth.status === "in" ? "Sixth Man · on track" : "Sixth Man · close",
          kind: "thread",
        });
      }
    }
  }

  if (s.flags["soft:nba-demote"] && s.placement.node === "nba" && !["starter", "star"].includes(s.placement.role)) {
    out.push({ id: "thread-demote", label: "Thread", value: "Fighting back into the five", kind: "thread" });
  }
  if (s.flags.softPendingRivalCatch || (s.flags["soft:rival-catch"] && typeof s.flags.rivalCatchAt === "number" && s.ageMonths - s.flags.rivalCatchAt <= 6)) {
    const rival = rivalPeer(s.peers);
    if (rival) out.push({ id: "thread-catch", label: "Thread", value: `Catching ${rival.name}`, kind: "thread" });
  }
  const heat = typeof s.flags.rivalHeat === "number" ? s.flags.rivalHeat : 0;
  if (heat >= 2) {
    const rival = rivalPeer(s.peers);
    if (rival && !rival.done) out.push({ id: "thread-rival", label: "Thread", value: `Rival heat · ${rival.name}`, kind: "thread" });
  }
  if (s.condition.injury && (s.condition.injury.severity >= 3 || s.condition.injury.monthsLeft >= 4)) {
    out.push({
      id: "thread-injury",
      label: "Thread",
      value: `${s.condition.injury.label} · ~${s.condition.injury.monthsLeft} mo`,
      kind: "thread",
    });
  }
  if (typeof s.flags.broke === "number" && s.ageMonths - s.flags.broke <= 4) {
    out.push({ id: "thread-broke", label: "Thread", value: "Money trouble · rent is due", kind: "thread" });
  } else if (typeof s.flags.overseasHunt === "number" && s.ageMonths - s.flags.overseasHunt <= 6) {
    out.push({ id: "thread-abroad", label: "Thread", value: "Hunting a paycheck abroad", kind: "thread" });
  }
  if (s.flags.nbaFreeAgent === true) {
    const holds = typeof s.flags.faHoldouts === "number" ? s.flags.faHoldouts : 0;
    out.push({
      id: "thread-fa",
      label: "Thread",
      value: holds <= 0 ? "Free agency · deals on the table" : holds === 1 ? "Free agency · held out once" : "Free agency · market going cold",
      kind: "thread",
    });
  }
  return out.slice(0, 3);
}

/** Live “this life’s plot” strip. Empty rows are omitted. Threads come first. */
export function plotCard(s: LifeState): PlotLine[] {
  const threads = plotThreads(s);
  const facts: PlotLine[] = [];
  const ambition = ambitionLine(s);
  if (ambition) facts.push(ambition);
  if (s.flags.mentor) facts.push({ id: "mentor", label: "Mentor", value: typeof s.flags.mentorName === "string" ? String(s.flags.mentorName) : "A retired pro nearby", kind: "fact" });
  const style = typeof s.flags.style === "string" ? s.flags.style : null;
  if (style && STYLE_LABEL[style]) facts.push({ id: "style", label: "Style", value: STYLE_LABEL[style], kind: "fact" });
  if (typeof s.flags.listedAs === "string") facts.push({ id: "listed", label: "Listed as", value: String(s.flags.listedAs), kind: "fact" });
  const onLoan = (s.placement.teamName ?? "").includes("(on loan)");
  if (onLoan) facts.push({ id: "loan", label: "Loan", value: s.placement.teamName ?? "On loan", kind: "fact" });
  const rival = rivalPeer(s.peers);
  if (rival) {
    const heat = typeof s.flags.rivalHeat === "number" ? s.flags.rivalHeat : 0;
    facts.push({ id: "rival", label: "Rival", value: rivalPlotValue(rival, heat), kind: "fact" });
  }
  const tone = coachToneOf(s);
  if (tone && (s.placement.node === "nba" || s.placement.node === "g-league" || s.placement.node === "foreign-pro" || s.placement.node === "domestic-pro")) {
    facts.push({ id: "coach", label: "Bench", value: TONE_LABEL[tone], kind: "fact" });
  }
  if (s.flags.hometownHero) facts.push({ id: "home", label: "Hometown", value: "They still talk about him there", kind: "fact" });
  if (s.ageMonths >= 18 * 12) {
    const era = eraAt(calendar(s).year);
    facts.push({ id: "era", label: "Era", value: era.label, kind: "fact" });
  }
  // Prefer threads, then facts; keep the card short.
  return [...threads, ...facts].slice(0, 8);
}

/** Five punchy history lines for the museum / end highlight reel. */
export function highlightReel(s: LifeState, limit = 5): string[] {
  const want = s.history.filter((h) => h.kind === "milestone" || h.kind === "draft" || (h.kind === "move" && (h.text.startsWith("Moved") || h.text.startsWith("Joined") || h.text.startsWith("Signed"))) || (h.kind === "decision" && h.tone === "good"));
  const scored = want.map((h) => {
    let w = h.kind === "milestone" ? 5 : h.kind === "draft" ? 4 : 2;
    if (/NBA debut|Hall of Fame|champion|MVP|Drafted|unicorn|Gold,/i.test(h.text)) w += 3;
    if (/paycheck|national|loan|mentor|rival|hometown|parade|Prove-it|All-Star|All-NBA|Out of the five|Same league as him|Last youth|Left home|senior dud|500 NBA|1,000 NBA|NBA Finals|Traded|Season over|Finals end|Series win|Free agency|No calls|Held out|Re-signed in free agency|Contender free agency|Prove-it free agency/i.test(h.text)) w += 1;
    return { h, w };
  });
  scored.sort((a, b) => b.w - a.w || b.h.month - a.h.month);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { h } of scored) {
    const key = h.text.slice(0, 48);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`Age ${Math.floor(h.month / 12)}: ${h.text}`);
    if (lines.length >= limit) break;
  }
  return lines;
}

export { AMBITION_LABEL, STYLE_LABEL, TONE_LABEL };
