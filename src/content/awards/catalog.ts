/**
 * Canonical award types shown on player identity + /awards history pages.
 * Maps NBA Stats `playerawards` DESCRIPTION strings → product slugs.
 */

export type AwardTrophyId =
  | "larry-obrien"
  | "michael-jordan"
  | "bill-russell"
  | "olajuwon"
  | "tip-off"
  | "all-nba"
  | "all-defense"
  | "all-star"
  | "hof";

export type AwardDefinition = {
  id: string;
  slug: string;
  /** Short chip label under the trophy. */
  shortLabel: string;
  /** Page / tooltip title. */
  title: string;
  /** Named trophy (when the league has one). */
  trophyName: string;
  trophy: AwardTrophyId;
  /** Exact DESCRIPTION values from stats.nba.com playerawards. */
  descriptions: string[];
  /** One-line history page intro. */
  blurb: string;
  /** Sort order on the player card (lower first). */
  sort: number;
};

export const AWARD_DEFINITIONS: AwardDefinition[] = [
  {
    id: "champion",
    slug: "championships",
    shortLabel: "Titles",
    title: "NBA Championships",
    trophyName: "Larry O’Brien Trophy",
    trophy: "larry-obrien",
    descriptions: ["NBA Champion"],
    blurb:
      "The Larry O’Brien Trophy goes to the NBA Finals winner each season.",
    sort: 10,
  },
  {
    id: "mvp",
    slug: "mvp",
    shortLabel: "MVP",
    title: "NBA Most Valuable Player",
    trophyName: "Michael Jordan Trophy",
    trophy: "michael-jordan",
    descriptions: ["NBA Most Valuable Player"],
    blurb:
      "The regular-season MVP is the league’s top individual honor, presented as the Michael Jordan Trophy.",
    sort: 20,
  },
  {
    id: "finals_mvp",
    slug: "finals-mvp",
    shortLabel: "FMVP",
    title: "NBA Finals Most Valuable Player",
    trophyName: "Bill Russell Trophy",
    trophy: "bill-russell",
    descriptions: ["NBA Finals Most Valuable Player"],
    blurb:
      "The Bill Russell Trophy goes to the outstanding player of the NBA Finals.",
    sort: 30,
  },
  {
    id: "dpoy",
    slug: "dpoy",
    shortLabel: "DPOY",
    title: "Defensive Player of the Year",
    trophyName: "Hakeem Olajuwon Trophy",
    trophy: "olajuwon",
    descriptions: ["NBA Defensive Player of the Year"],
    blurb:
      "The Hakeem Olajuwon Trophy honors the league’s top defensive performer.",
    sort: 40,
  },
  {
    id: "roy",
    slug: "roy",
    shortLabel: "ROY",
    title: "Rookie of the Year",
    trophyName: "Wilt Chamberlain Trophy",
    trophy: "tip-off",
    descriptions: ["NBA Rookie of the Year"],
    blurb: "Rookie of the Year honors the top first-year player in the league.",
    sort: 50,
  },
  {
    id: "all_nba",
    slug: "all-nba",
    shortLabel: "All-NBA",
    title: "All-NBA Team",
    trophyName: "All-NBA",
    trophy: "all-nba",
    descriptions: ["All-NBA"],
    blurb:
      "All-NBA teams honor the season’s best players across first, second, and third teams.",
    sort: 60,
  },
  {
    id: "all_defense",
    slug: "all-defense",
    shortLabel: "All-Defense",
    title: "All-Defensive Team",
    trophyName: "All-Defensive",
    trophy: "all-defense",
    descriptions: ["All-Defensive Team"],
    blurb:
      "All-Defensive teams recognize the season’s best defenders on first and second teams.",
    sort: 70,
  },
  {
    id: "all_star",
    slug: "all-star",
    shortLabel: "All-Star",
    title: "NBA All-Star",
    trophyName: "All-Star",
    trophy: "all-star",
    descriptions: ["NBA All-Star"],
    blurb:
      "All-Star selections for the midseason game, ranked by career selection count from the awards data.",
    sort: 80,
  },
  {
    id: "hof",
    slug: "hall-of-fame",
    shortLabel: "HOF",
    title: "Hall of Fame",
    trophyName: "Hall of Fame",
    trophy: "hof",
    descriptions: ["Hall of Fame Inductee"],
    blurb: "Naismith Memorial Basketball Hall of Fame inductees.",
    sort: 90,
  },
];

export function getAwardBySlug(slug: string): AwardDefinition | undefined {
  return AWARD_DEFINITIONS.find((a) => a.slug === slug);
}

export function getAwardById(id: string): AwardDefinition | undefined {
  return AWARD_DEFINITIONS.find((a) => a.id === id);
}

export function matchAwardDefinition(
  description: string
): AwardDefinition | undefined {
  const d = description.trim();
  return AWARD_DEFINITIONS.find((a) => a.descriptions.includes(d));
}
