"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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

  const onSeason = useCallback(
    (value: string | null) => {
      if (!value) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("season", value);
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`);
      });
    },
    [pathname, router, searchParams]
  );

  return (
    <div
      className={`flex flex-wrap items-end gap-3 ${isPending ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team-season">Season</Label>
        <Select value={season} onValueChange={onSeason}>
          <SelectTrigger id="team-season" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
