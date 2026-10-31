import { challengeResult } from "./challenges";
import { rivalPeer } from "./peers";
import type { LifeState } from "./types";

/** Small collectible stamp for an end-of-life run. Labels stay short for chips and share text. */
export interface CareerBadge {
  id: string;
  label: string;
}

/**
 * Named stamps earned by how the life went, not by cash.
 * Order is priority for the chip strip; keep the list short.
 */
export function careerBadges(s: LifeState): CareerBadge[] {
  const out: CareerBadge[] = [];
  if (s.unicorn) out.push({ id: "unicorn", label: "Unicorn seed" });
  if (s.flags.hofDone) out.push({ id: "hof", label: "Hall of Fame" });
  if (s.international.tournaments.some((t) => t.medal === "gold")) out.push({ id: "gold", label: "Gold medal" });
  if (s.achievements.nbaDebut !== null && !s.achievements.drafted) out.push({ id: "undrafted-nba", label: "Undrafted NBA" });
  if (s.achievements.drafted?.round === 1) out.push({ id: "first-round", label: "First-round pick" });
  if (s.flags["soft:nba-climb"]) out.push({ id: "starter", label: "NBA starting five" });
  if (s.flags["soft:nba-demote"]) out.push({ id: "demoted", label: "Lost the five once" });
  if (s.flags["soft:all-star"] || s.seasons.some((x) => (x.awards ?? []).includes("NBA All-Star"))) {
    out.push({ id: "all-star", label: "All-Star" });
  }
  if (s.flags["soft:all-nba"] || s.seasons.some((x) => (x.awards ?? []).some((a) => /All-NBA/.test(a)))) {
    out.push({ id: "all-nba", label: "All-NBA" });
  }
  if (s.flags["soft:finals-appear"] || s.seasons.some((x) => x.playoffs && x.playoffs.rounds >= 3)) {
    out.push({ id: "finals", label: "Reached the Finals" });
  }
  if (s.flags["soft:nba-trade"]) out.push({ id: "traded", label: "Traded once" });
  if (s.nbaGames >= 1000 || s.flags["soft:1000"]) out.push({ id: "1000", label: "1,000 NBA games" });
  else if (s.nbaGames >= 500 || s.flags["soft:500"]) out.push({ id: "500", label: "500 NBA games" });
  else if (s.nbaGames >= 100) out.push({ id: "100", label: "100 NBA games" });
  if (s.flags["soft:series-win"]) out.push({ id: "series-win", label: "Playoff series win" });
  if (s.flags["soft:nba-fa"] || s.flags["soft:nba-fa-miss"]) out.push({ id: "fa", label: "Tested free agency" });
  if (s.flags["soft:nba-ext"] || s.evidence.some((e) => /Signed extension/i.test(e.text))) out.push({ id: "ext", label: "Signed an extension" });
  if (s.flags["soft:new-coach"]) out.push({ id: "new-coach", label: "Survived a coaching change" });
  if (s.flags["soft:ros-deal"]) out.push({ id: "ros", label: "Rest-of-season deal" });

  const rival = rivalPeer(s.peers);
  if (rival) {
    if (s.achievements.nbaDebut !== null && rival.debutMonth === null) out.push({ id: "beat-rival", label: `Beat ${rival.name}` });
    else if (s.achievements.nbaDebut === null && rival.debutMonth !== null) out.push({ id: "rival-first", label: `${rival.name} got there first` });
    else if (s.achievements.nbaDebut !== null && rival.debutMonth !== null) out.push({ id: "shared-nba", label: "Same league as rival" });
    if (s.flags["soft:ahead-rival"]) out.push({ id: "clear-young", label: "Pulled clear young" });
  }

  if (s.flags.betOnSelf === true || s.evidence.some((e) => /Prove-it year/i.test(e.text))) {
    out.push({ id: "prove-it", label: "Prove-it year" });
  }
  if (s.flags["soft:season-injury"] || s.evidence.some((e) => /Season injury/i.test(e.text))) {
    out.push({ id: "survived-injury", label: "Survived a long injury" });
  }
  if (s.challenge && challengeResult(s) === "cleared") {
    out.push({ id: "challenge", label: "Challenge cleared" });
  }
  if (s.after?.track === "coach" && Math.floor(s.ageMonths / 12) <= 40 && (s.after.step >= 1 || s.after.years.length >= 1)) {
    out.push({ id: "coach-early", label: "Coaching by 40" });
  }

  // Deduplicate by id while keeping priority order.
  const seen = new Set<string>();
  return out.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true))).slice(0, 6);
}

/** Labels only, for boards and share text. */
export function badgeLabels(s: LifeState): string[] {
  return careerBadges(s).map((b) => b.label);
}
