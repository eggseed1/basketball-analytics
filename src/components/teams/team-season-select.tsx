"use client";

import { useRouter } from "next/navigation";

import { type } from "@/lib/design-system";
import {
  teamPageHref,
  type TeamPageHrefOpts,
} from "@/lib/team-destination";
import { cn } from "@/lib/utils";

export function TeamSeasonSelect({
  teamId,
  season,
  seasons,
  hrefOpts,
}: {
  teamId: string;
  season: string;
  seasons: string[];
  hrefOpts?: TeamPageHrefOpts;
}) {
  const router = useRouter();
  const options = [...new Set([season, ...seasons])]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  return (
    <label className="inline-flex items-center gap-2">
      <span
        className={cn(
          type.caption,
          "font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        Season
      </span>
      <select
        className={cn(
          type.caption,
          "glass-pill h-8 min-w-[7.5rem] cursor-pointer rounded-md border-0 px-2.5 font-semibold text-foreground outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring"
        )}
        value={season}
        aria-label="Season"
        onChange={(e) => {
          const next = e.target.value;
          const href = hrefOpts
            ? teamPageHref(teamId, { ...hrefOpts, season: next })
            : `/teams/${encodeURIComponent(teamId)}?season=${encodeURIComponent(next)}`;
          router.push(href, { scroll: false });
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
