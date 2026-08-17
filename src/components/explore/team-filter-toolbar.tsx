"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TEAM_SORT_OPTIONS,
  getTeamSortOption,
  parseSortDir,
} from "@/lib/team-explore-sort";

export function TeamFilterToolbar({
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
  const conference = searchParams.get("conference") ?? "ALL";
  const sortKey = getTeamSortOption(searchParams.get("sort")).key;
  const sortDir = parseSortDir(searchParams.get("dir"));
  const [seasonDraft, setSeasonDraft] = useState(season);

  useEffect(() => {
    setSeasonDraft(season);
  }, [season]);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "ALL") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      if (
        (next.get("sort") ?? "netRating") === "netRating" &&
        (next.get("dir") ?? "desc") === "desc"
      ) {
        next.delete("sort");
        next.delete("dir");
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

  return (
    <form
      className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Team filters"
      data-pending={isPending ? "true" : "false"}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-filter-season">Season</Label>
        <Select
          value={seasonDraft}
          onValueChange={(value) => {
            if (value == null) return;
            const next = String(value);
            setSeasonDraft(next);
            updateParams({ season: next });
          }}
        >
          <SelectTrigger
            id="team-filter-season"
            className="w-full"
            disabled={isPending}
          >
            <SelectValue>{seasonDraft}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72" alignItemWithTrigger={false}>
            {seasons.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-filter-conf">Conference</Label>
        <Select
          value={conference}
          onValueChange={(value) => {
            if (value != null) updateParams({ conference: String(value) });
          }}
        >
          <SelectTrigger id="team-filter-conf" className="w-full">
            <SelectValue>
              {conference === "ALL" ? "All conferences" : conference}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All conferences</SelectItem>
            <SelectItem value="East">East</SelectItem>
            <SelectItem value="West">West</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-filter-sort">Sort by</Label>
        <Select
          value={sortKey}
          onValueChange={(value) => {
            if (value == null) return;
            const opt = getTeamSortOption(String(value));
            updateParams({ sort: opt.key, dir: opt.defaultDir });
          }}
        >
          <SelectTrigger id="team-filter-sort" className="w-full">
            <SelectValue>{getTeamSortOption(sortKey).label}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TEAM_SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.key} value={opt.key}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-filter-dir">Order</Label>
        <Select
          value={sortDir}
          onValueChange={(value) => {
            if (value != null) updateParams({ dir: String(value) });
          }}
        >
          <SelectTrigger id="team-filter-dir" className="w-full">
            <SelectValue>
              {sortDir === "asc" ? "Low → high" : "High → low"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">High → low</SelectItem>
            <SelectItem value="asc">Low → high</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </form>
  );
}
