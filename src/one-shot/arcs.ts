import { medalCount, outcomeTier } from "./report";
import type { LifeState } from "./types";
import { maybeLeague } from "./world";

/**
 * A short name for how this life reads at the end. NBA careers keep the
 * existing tier labels; everyone else gets a specific arc so a Euro peak or
 * a coaching climb does not feel like the same "missed the league" stamp.
 */

export interface CareerArc {
  id: string;
  /** Chip / fanfare title. */
  title: string;
  /** One or two sentences for the farewell overlay or end report. */
  line: string;
  /** Worth pausing for a farewell fanfare. */
  proud: boolean;
}

const TOP_LEAGUE = 66;

function topProSeasons(s: LifeState) {
  return s.seasons.filter((x) => (maybeLeague(x.leagueId)?.model?.strength ?? x.strength) >= TOP_LEAGUE && x.gp >= 10);
}

function leagueMvps(s: LifeState, minStrength = 50) {
  return s.seasons.filter((x) => (x.awards ?? []).includes("League MVP") && x.strength >= minStrength);
}

export function careerArc(s: LifeState): CareerArc {
  const tier = outcomeTier(s);
  const medals = medalCount(s);
  const caps = s.international.caps;
  const top = topProSeasons(s);
  const euroMvps = leagueMvps(s, TOP_LEAGUE);
  const domesticMvps = leagueMvps(s, 45);
  const age = Math.floor(s.ageMonths / 12);

  if (tier === "nba-career") {
    return {
      id: "nba-career",
      title: "NBA career",
      line: `${s.nbaGames} regular-season games. The league kept his name on a roster.`,
      proud: true,
    };
  }
  if (tier === "nba-debut") {
    return {
      id: "nba-debut",
      title: "Made the NBA",
      line: "One regular-season game was the goal. He got it.",
      proud: true,
    };
  }
  if (s.after?.track === "coach" && (s.after.step >= 2 || s.after.years.length >= 5)) {
    return {
      id: "coach-path",
      title: "Coach's climb",
      line: `He left the floor and kept working. ${s.after.title} with ${s.after.employer}.`,
      proud: true,
    };
  }
  if (euroMvps.length >= 1 || (top.length >= 4 && domesticMvps.length === 0 && top.some((x) => x.node === "foreign-pro"))) {
    const league = top[0]?.levelLabel ?? "Europe";
    return {
      id: "euro-star",
      title: "European peak",
      line: euroMvps.length
        ? `League MVP in a top European league. The NBA was not the only summit.`
        : `Years in ${league}. He was a real name on that side of the ocean.`,
      proud: true,
    };
  }
  if (medals.gold || (caps >= 40 && (medals.silver || medals.bronze))) {
    return {
      id: "national-pillar",
      title: "National team pillar",
      line: caps
        ? `${caps} caps${medals.gold ? " and a gold medal" : medals.silver ? " and silver" : medals.bronze ? " and bronze" : ""}. His country kept calling.`
        : "He wore the national shirt when it mattered.",
      proud: true,
    };
  }
  if (s.seasons.some((x) => x.node === "g-league" && x.gp >= 40) && s.nbaGames === 0) {
    return {
      id: "g-league-grind",
      title: "G League grind",
      line: "Affiliate buses, 10-days that went nowhere, and film that never quite stuck upstairs.",
      proud: true,
    };
  }
  if (domesticMvps.length >= 2 || (domesticMvps.length >= 1 && s.seasons.filter((x) => x.node === "domestic-pro" && x.gp >= 15).length >= 6)) {
    return {
      id: "domestic-legend",
      title: "Domestic legend",
      line: "He owned a league at home. Scouts knew the name even when the NBA did not call.",
      proud: true,
    };
  }
  if (tier === "drafted") {
    return {
      id: "drafted",
      title: "Drafted, never debuted",
      line: "A team called his name on draft night. An NBA box score never did.",
      proud: false,
    };
  }
  if (tier === "top-pro" || tier === "pro") {
    return {
      id: "working-pro",
      title: "Working pro",
      line: `Paid to play into his ${age}s. Not every career needs a US jersey.`,
      proud: true,
    };
  }
  if (tier === "semi-pro") {
    return {
      id: "college-story",
      title: "College and senior ball",
      line: "He kept playing after school. The next level stayed one step away.",
      proud: false,
    };
  }
  return {
    id: "short-run",
    title: "A short run",
    line: "Basketball was part of the life. It was not the whole life.",
    proud: false,
  };
}
