import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import { ALL_TEAM_ABBRS, TEAM_BRANDS } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const BROWSE = [
  { href: "/scores", label: "Games", key: "bos" },
  { href: "/explore/players", label: "Players", key: "gsw" },
  { href: "/explore/teams", label: "Teams", key: "den" },
  { href: "/standings", label: "Standings", key: "nyk" },
  { href: "/compare", label: "Compare", key: "lal" },
  { href: "/offseason", label: "Transactions", key: "mia" },
  { href: "/ask", label: "ASK DRBL", key: "phx" },
  { href: "/learn", label: "Learn", key: "mil" },
  { href: "/franchises", label: "History", key: "chi" },
];

export function BrowseCircles({
  mode = "modules",
}: {
  mode?: "modules" | "teams";
}) {
  if (mode === "teams") {
    return (
      <div className="grid grid-cols-5 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {ALL_TEAM_ABBRS.map((abbr) => {
          const brand = TEAM_BRANDS[abbr]!;
          return (
            <Link
              key={abbr}
              href={`/teams/${brand.espnTeamId}`}
              className="flex flex-col items-center gap-2"
            >
              <span className="flex size-[4.5rem] items-center justify-center rounded-full bg-secondary shadow-inner">
                <TeamLogo teamKey={abbr} size="lg" />
              </span>
              <span className="text-[13px] font-medium">{brand.abbr}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9">
      {BROWSE.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center gap-2"
        >
          <span
            className={cn(
              "flex size-[4.5rem] items-center justify-center rounded-full bg-secondary"
            )}
          >
            <TeamLogo teamKey={item.key} size="lg" />
          </span>
          <span className="text-center text-[13px] font-medium">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
