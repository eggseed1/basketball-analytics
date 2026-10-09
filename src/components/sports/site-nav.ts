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
  label: string;
  /** Match active state for this link (exact path / query aware when needed). */
  match?: (pathname: string) => boolean;
};

export type PrimaryNavItem = {
  id: string;
  href: string;
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
        match: (p) => p === "/scores" || p.startsWith("/scores/"),
      },
      {
        href: "/scores?view=week",
        label: "Schedule",
        match: (p) => p === "/scores" || p.startsWith("/scores/"),
      },
      {
        href: "/explore/games",
        label: "Explore",
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
        match: (p) =>
          p.startsWith("/explore/players") &&
          !p.startsWith("/explore/players/race") &&
          !p.startsWith("/explore/players/visualizations") &&
          !p.startsWith("/explore/players/hot-cold"),
      },
      {
        href: "/explore/players/hot-cold",
        label: "Hot & Cold",
        match: (p) => p.startsWith("/explore/players/hot-cold"),
      },
      {
        href: "/explore/players/visualizations",
        label: "Visualizations",
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
      p.startsWith("/explore/bracket") ||
      p.startsWith("/franchises"),
    subnav: [
      {
        href: "/standings",
        label: "Standings",
        match: (p) =>
          (p.startsWith("/standings") && !p.startsWith(STANDINGS_VISUALIZATIONS_PATH)) ||
          p.startsWith("/teams/") ||
          p.startsWith("/franchises"),
      },
      {
        href: STANDINGS_VISUALIZATIONS_PATH,
        label: "Visualizations",
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
      { href: "/sentiment", label: "League board" },
      { href: "/sentiment?view=players", label: "Players" },
      { href: "/sentiment?view=teams", label: "Teams" },
      { href: "/sentiment?view=headlines", label: "Headlines" },
      { href: "/sentiment?view=overrated", label: "Overrated watch" },
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
        match: (p) => p.startsWith("/offseason"),
      },
      {
        href: "/movement",
        label: "Movement Center",
        match: (p) => p.startsWith("/movement"),
      },
      {
        href: "/acquisitions",
        label: "How They Got Him",
        match: (p) => p.startsWith("/acquisitions"),
      },
      {
        href: "/explore/teams/trade",
        label: "Trade simulator",
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
    match: (p) => p.startsWith("/history") || p.startsWith("/awards"),
    subnav: [
      {
        href: "/history",
        label: "Time Machine",
        match: (p) => p.startsWith("/history"),
      },
      {
        href: "/awards",
        label: "Awards",
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
      { href: "/arcade", label: "All games", match: (p) => p === "/arcade" },
      {
        href: "/arcade/higher-or-lower",
        label: "Higher or Lower",
        match: (p) => p.startsWith("/arcade/higher-or-lower"),
      },
      { href: "/arcade/zero-82", label: "0–82", match: (p) => p.startsWith("/arcade/zero-82") },
      {
        href: "/arcade/teammate-chain",
        label: "Teammate Chain",
        match: (p) => p.startsWith("/arcade/teammate-chain"),
      },
      { href: "/arcade/one-shot", label: "ONE SHOT", match: (p) => p.startsWith("/arcade/one-shot") },
      { href: "/gm", label: "GM Lab", match: (p) => p === "/gm" || p.startsWith("/gm/") },
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
