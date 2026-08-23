"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const DECADES = [
  { id: "1960s", from: 1960, to: 1969, label: "1960s" },
  { id: "1970s", from: 1970, to: 1979, label: "1970s" },
  { id: "1980s", from: 1980, to: 1989, label: "1980s" },
  { id: "1990s", from: 1990, to: 1999, label: "1990s" },
  { id: "2000s", from: 2000, to: 2009, label: "2000s" },
  { id: "2010s", from: 2010, to: 2019, label: "2010s" },
  { id: "2020s", from: 2020, to: 2029, label: "2020s" },
] as const;

export function DecadeChips({
  seasons,
  hrefBase = "/explore/games",
}: {
  seasons: string[];
  hrefBase?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSeason = searchParams.get("season");
  const currentStart = currentSeason
    ? Number(currentSeason.slice(0, 4))
    : undefined;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {DECADES.map((decade) => {
        const firstInDecade = seasons.find((s) => {
          const y = Number(s.slice(0, 4));
          return y >= decade.from && y <= decade.to;
        });
        if (!firstInDecade) return null;
        const active =
          currentStart != null &&
          currentStart >= decade.from &&
          currentStart <= decade.to;
        const href = `${hrefBase}?season=${encodeURIComponent(
          // Prefer a mid-decade classic when opening 1960s
          decade.id === "1960s"
            ? seasons.find((s) => s.startsWith("1969")) ?? firstInDecade
            : firstInDecade
        )}`;
        return (
          <Link
            key={decade.id}
            href={href}
            className={cn(
              "glass-pill shrink-0 rounded-md px-3 py-1.5 text-[14px] font-semibold transition-colors",
              active || (pathname === hrefBase && decade.id === "1960s" && !currentSeason)
                ? "glass-pill-active"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {decade.label}
          </Link>
        );
      })}
    </div>
  );
}
