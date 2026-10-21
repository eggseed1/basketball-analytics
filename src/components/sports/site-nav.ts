/**
 * DRBL top-level information architecture.
 * Labels describe user mental models; hrefs keep existing routes stable.
 *
 * - Teams → standings (tables, bracket, team stats) + visualizations (race, margin)
 * - Players → player boards + visualizations (race, usage × efficiency)
 */

import { STANDINGS_VISUALIZATIONS_PATH } from "@/lib/standings-routes";

export type NavLink = {
  href: string;
  /** English fallback / tests. UI prefers `labelKey` via next-intl. */
  label: string;
  /** Key under messages Nav.* (e.g. sub_scores). */
  labelKey?: string;
  /** Match active state for this link (exact path / query aware when needed). */
  match?: (pathname: string) => boolean;
};

export type PrimaryNavItem = {
  id: string;
  href: string;
  /** English fallback / tests. UI prefers Nav.{id} via next-intl. */
  label: string;
  /** Emphasize in the bar (Ask DRBL). */
  prominent?: boolean;
  match: (pathname: string) => boolean;
  subnav?: NavLink[];
};

export const PRIMARY_NAV: PrimaryNavItem[] = [
  {
    id: "home",
    href: "/",
    label: "Home",
    match: (p) => p === "/",
  },
  {
    id: "games",
    href: "/scores",
    label: "Games",
    match: (p) =>
      p === "/scores" ||
      p.startsWith("/scores/") ||
      p.startsWith("/explore/games") ||
      p.startsWith("/games/"),
    subnav: [
      {
        href: "/scores",
        label: "Scores",
        labelKey: "sub_scores",
        match: (p) => p === "/scores" || p.startsWith("/scores/"),
      },
      {
        href: "/scores?view=week",
        label: "Schedule",
        labelKey: "sub_schedule",
        match: (p) => p === "/scores" || p.startsWith("/scores/"),
      },
      {
        href: "/explore/games",
        label: "Explore",
        labelKey: "sub_gamesExplore",
        match: (p) => p.startsWith("/explore/games"),
      },
    ],
  },
  {
    id: "players",
    href: "/explore/players",
    label: "Players",
    match: (p) =>
      p.startsWith("/explore/players") || p.startsWith("/players/"),
    subnav: [
      {
        href: "/explore/players",
        label: "Board",
        labelKey: "sub_board",
        match: (p) =>
          p.startsWith("/explore/players") &&
          !p.startsWith("/explore/players/race") &&
          !p.startsWith("/explore/players/visualizations") &&
          !p.startsWith("/explore/players/hot-cold") &&
          !p.startsWith("/explore/players/styles"),
      },
      {
        href: "/explore/players/hot-cold",
        label: "Hot & Cold",
        labelKey: "sub_hotCold",
        match: (p) => p.startsWith("/explore/players/hot-cold"),
      },
      {
        href: "/explore/players/styles",
        label: "Styles",
        labelKey: "sub_styles",
        match: (p) => p.startsWith("/explore/players/styles"),
      },
      {
        href: "/explore/players/visualizations",
        label: "Visualizations",
        labelKey: "sub_visualizations",
        match: (p) =>
          p.startsWith("/explore/players/visualizations") ||
          p.startsWith("/explore/players/race"),
      },
    ],
  },
  {
    id: "teams",
    href: "/standings",
    label: "Teams",
    match: (p) =>
      (p.startsWith("/explore/teams") && !p.startsWith("/explore/teams/trade")) ||
      p.startsWith("/teams/") ||
      p.startsWith("/standings") ||
      p.startsWith("/explore/bracket"),
    subnav: [
      {
        href: "/standings",
        label: "Standings",
        labelKey: "sub_standings",
        match: (p) =>
          (p.startsWith("/standings") && !p.startsWith(STANDINGS_VISUALIZATIONS_PATH)) ||
          p.startsWith("/teams/"),
      },
      {
        href: STANDINGS_VISUALIZATIONS_PATH,
        label: "Visualizations",
        labelKey: "sub_visualizations",
        match: (p) => p.startsWith(STANDINGS_VISUALIZATIONS_PATH),
      },
    ],
  },
  {
    id: "compare",
    href: "/compare",
    label: "Compare",
    match: (p) => p.startsWith("/compare"),
  },
  {
    id: "sentiment",
    href: "/sentiment",
    label: "Sentiment",
    match: (p) => p.startsWith("/sentiment"),
    subnav: [
      { href: "/sentiment", label: "League board", labelKey: "sub_leagueBoard" },
      { href: "/sentiment?view=players", label: "Players", labelKey: "sub_players" },
      { href: "/sentiment?view=teams", label: "Teams", labelKey: "sub_teams" },
      { href: "/sentiment?view=headlines", label: "Headlines", labelKey: "sub_headlines" },
      {
        href: "/sentiment?view=overrated",
        label: "Overrated watch",
        labelKey: "sub_overrated",
      },
    ],
  },
  {
    id: "transactions",
    href: "/offseason",
    label: "Transactions",
    match: (p) =>
      p.startsWith("/offseason") ||
      p.startsWith("/movement") ||
      p.startsWith("/acquisitions") ||
      p.startsWith("/explore/teams/trade"),
    subnav: [
      {
        href: "/offseason",
        label: "Transaction log",
        labelKey: "sub_transactionLog",
        match: (p) => p.startsWith("/offseason"),
      },
      {
        href: "/movement",
        label: "Movement Center",
        labelKey: "sub_movement",
        match: (p) => p.startsWith("/movement"),
      },
      {
        href: "/acquisitions",
        label: "How They Got Him",
        labelKey: "sub_acquisitions",
        match: (p) => p.startsWith("/acquisitions"),
      },
      {
        href: "/explore/teams/trade",
        label: "Trade simulator",
        labelKey: "sub_tradeSim",
        match: (p) => p.startsWith("/explore/teams/trade"),
      },
    ],
  },
  {
    id: "learn",
    href: "/learn",
    label: "Learn",
    match: (p) => p.startsWith("/learn"),
  },
  {
    id: "ask",
    href: "/ask",
    label: "Ask DRBL",
    prominent: true,
    match: (p) => p === "/ask" || p.startsWith("/ask/"),
  },
  {
    id: "history",
    href: "/history",
    label: "History",
    match: (p) =>
      p.startsWith("/history") || p.startsWith("/awards") || p.startsWith("/franchises"),
    subnav: [
      {
        href: "/history",
        label: "Time Machine",
        labelKey: "sub_timeMachine",
        match: (p) => p.startsWith("/history"),
      },
      {
        href: "/franchises",
        label: "Franchise History",
        labelKey: "sub_franchiseHistory",
        match: (p) => p.startsWith("/franchises"),
      },
      {
        href: "/awards",
        label: "Awards",
        labelKey: "sub_awards",
        match: (p) => p.startsWith("/awards"),
      },
    ],
  },
  {
    id: "arcade",
    href: "/arcade",
    label: "Arcade",
    match: (p) => p.startsWith("/arcade") || p === "/gm" || p.startsWith("/gm/"),
    subnav: [
      {
        href: "/arcade",
        label: "All games",
        labelKey: "sub_allGames",
        match: (p) => p === "/arcade",
      },
      {
        href: "/arcade/daily",
        label: "Daily",
        labelKey: "sub_daily",
        match: (p) => p.startsWith("/arcade/daily"),
      },
      {
        href: "/arcade/higher-or-lower",
        label: "Higher or Lower",
        labelKey: "sub_higherLower",
        match: (p) => p.startsWith("/arcade/higher-or-lower"),
      },
      {
        href: "/arcade/zero-82",
        label: "0–82",
        labelKey: "sub_zero82",
        match: (p) => p.startsWith("/arcade/zero-82"),
      },
      {
        href: "/arcade/teammate-chain",
        label: "Teammate Chain",
        labelKey: "sub_teammateChain",
        match: (p) => p.startsWith("/arcade/teammate-chain"),
      },
      {
        href: "/arcade/one-shot",
        label: "ONE SHOT",
        labelKey: "sub_oneShot",
        match: (p) => p.startsWith("/arcade/one-shot"),
      },
      {
        href: "/gm",
        label: "GM Lab",
        labelKey: "sub_gmLab",
        match: (p) => p === "/gm" || p.startsWith("/gm/"),
      },
    ],
  },
];

export function activePrimaryNav(pathname: string): PrimaryNavItem | undefined {
  return PRIMARY_NAV.find((item) => item.match(pathname));
}

/** Deterministic active-domain checks for tests / debugging. */
export function primaryNavLabelForPath(pathname: string): string | null {
  return activePrimaryNav(pathname)?.label ?? null;
}
