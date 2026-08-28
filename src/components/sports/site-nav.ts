/**
 * DRBL top-level information architecture.
 * Labels describe user mental models; hrefs keep existing routes stable.
 */

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
  /** Emphasize in the bar (ASK DRBL). */
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
    id: "ask",
    href: "/ask",
    label: "ASK DRBL",
    prominent: true,
    match: (p) => p === "/ask" || p.startsWith("/ask/"),
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
  },
  {
    id: "teams",
    href: "/explore/teams",
    label: "Teams",
    match: (p) =>
      p.startsWith("/standings") ||
      p.startsWith("/explore/teams") ||
      p.startsWith("/teams/"),
    subnav: [
      {
        href: "/standings",
        label: "Standings",
        match: (p) => p.startsWith("/standings") && !p.includes("view=tracker"),
      },
      {
        href: "/standings?view=tracker",
        label: "Tracker",
        match: (p) => p.startsWith("/standings") && p.includes("view=tracker"),
      },
      {
        href: "/explore/teams",
        label: "Teams",
        match: (p) =>
          p.startsWith("/explore/teams") || p.startsWith("/teams/"),
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
      {
        href: "/sentiment",
        label: "League board",
        match: (p) => p === "/sentiment" || p.startsWith("/sentiment?"),
      },
      {
        href: "/sentiment?narrative=overrated",
        label: "Overrated watch",
        match: (p) => p.startsWith("/sentiment"),
      },
    ],
  },
  {
    id: "transactions",
    href: "/offseason",
    label: "Transactions",
    match: (p) => p.startsWith("/offseason") || p.startsWith("/movement"),
    subnav: [
      {
        href: "/offseason",
        label: "Current Offseason",
        match: (p) => p.startsWith("/offseason"),
      },
      {
        href: "/movement",
        label: "Movement Center",
        match: (p) => p.startsWith("/movement"),
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
    id: "history",
    href: "/history",
    label: "History",
    match: (p) => p.startsWith("/franchises") || p.startsWith("/history"),
    subnav: [
      {
        href: "/history",
        label: "Time Machine",
        match: (p) => p.startsWith("/history"),
      },
      {
        href: "/franchises",
        label: "Franchise History",
        match: (p) => p.startsWith("/franchises"),
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
