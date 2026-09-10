"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function ChipGroup({
  children,
  className,
  scrollable = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <GlassSurface
      effect="css"
      overflowVisible={!scrollable}
      className={cn(
        "flex min-w-0 items-center gap-0.5 p-1",
        scrollable &&
          "w-full max-w-full flex-nowrap touch-scroll-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      style={
        scrollable
          ? { overflowX: "auto", overflowY: "hidden" }
          : undefined
      }
      {...rest}
    >
      {children}
    </GlassSurface>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "rounded-md px-2.5 py-1.5 font-semibold transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

const selectTriggerClass =
  "h-7 border-0 bg-transparent shadow-none hover:bg-foreground/10 dark:bg-transparent dark:hover:bg-foreground/10 data-[size=default]:h-7 px-2.5 text-[12px] font-semibold";

export function TeamSeasonToolbar({
  seasons,
  defaultSeason,
}: {
  seasons: string[];
  defaultSeason: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const season = searchParams.get("season") ?? defaultSeason;
  const confParam = searchParams.get("conference")?.toLowerCase();
  const conference =
    confParam === "east" ? "East" : confParam === "west" ? "West" : "ALL";

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (
          value == null ||
          value === "" ||
          (key === "conference" && value === "ALL")
        ) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      if (!next.get("season")) next.set("season", defaultSeason);
      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      const nav = Object.prototype.hasOwnProperty.call(patch, "season")
        ? router.push
        : router.replace;
      startTransition(() => {
        nav.call(router, href, { scroll: false });
      });
    },
    [defaultSeason, pathname, router, searchParams]
  );

  const seasonIndex = Math.max(0, seasons.indexOf(season));
  const olderSeason = seasons[seasonIndex + 1];
  const newerSeason = seasonIndex > 0 ? seasons[seasonIndex - 1] : undefined;
  let seasonYear = season.slice(0, 4);
  try {
    seasonYear = String(espnYearFromCanonicalSeason(season));
  } catch {
    /* keep start year */
  }

  return (
    <GlassSurface
      effect="css"
      className={cn(
        "relative z-40 w-full min-w-0 max-w-full p-2 sm:p-3",
        isPending && "opacity-70"
      )}
    >
      <form
        className="flex w-full min-w-0 max-w-full flex-col gap-2"
        aria-label="Team board filters"
        onSubmit={(e) => e.preventDefault()}
        data-pending={isPending ? "true" : "false"}
      >
        <div className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 touch-scroll-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ChipGroup className="shrink-0">
            <button
              type="button"
              aria-label="Older season"
              disabled={!olderSeason}
              onClick={() =>
                olderSeason && updateParams({ season: olderSeason })
              }
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <Select
              value={season}
              onValueChange={(value) => {
                if (value != null) updateParams({ season: String(value) });
              }}
            >
              <SelectTrigger
                id="team-board-season"
                className={cn(
                  selectTriggerClass,
                  "min-w-[5.5rem] gap-1.5 sm:min-w-[6.5rem]"
                )}
                aria-label="Season"
              >
                <Calendar
                  className="size-3.5 text-muted-foreground"
                  aria-hidden
                />
                <SelectValue>{seasonYear}</SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                side="bottom"
                alignItemWithTrigger={false}
              >
                {seasons.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              aria-label="Newer season"
              disabled={!newerSeason}
              onClick={() =>
                newerSeason && updateParams({ season: newerSeason })
              }
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </ChipGroup>

          <ChipGroup className="shrink-0" aria-label="Conference">
            {(
              [
                ["ALL", "All"],
                ["East", "East"],
                ["West", "West"],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                active={conference === id}
                onClick={() => updateParams({ conference: id })}
              >
                {label}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      </form>
    </GlassSurface>
  );
}
