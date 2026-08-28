import Link from "next/link";

import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function StandingsViewTabs({
  active,
  season,
}: {
  active: "table" | "tracker";
  season: string;
}) {
  const seasonQuery = encodeURIComponent(season);
  const tabs = [
    {
      id: "table" as const,
      label: "Standings",
      href: `/standings?season=${seasonQuery}`,
    },
    {
      id: "tracker" as const,
      label: "Tracker",
      href: `/standings?view=tracker&season=${seasonQuery}`,
    },
  ];

  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-lg border border-border/70 bg-secondary/40 p-1"
      role="tablist"
      aria-label="Standings views"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          role="tab"
          aria-selected={active === tab.id}
          className={cn(
            type.caption,
            "rounded-md px-3 py-1.5 font-semibold transition-colors",
            active === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
