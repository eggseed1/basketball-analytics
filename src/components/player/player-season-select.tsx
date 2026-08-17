"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PlayerSeasonSelect({
  seasons,
  current,
}: {
  seasons: string[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(current);

  useEffect(() => {
    setSelected(current);
  }, [current]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="player-season">Season</Label>
      <Select
        value={selected}
        onValueChange={(value) => {
          if (value == null) return;
          const nextSeason = String(value);
          setSelected(nextSeason);
          const next = new URLSearchParams(searchParams.toString());
          next.set("season", nextSeason);
          startTransition(() => {
            router.push(`${pathname}?${next.toString()}`, { scroll: false });
          });
        }}
      >
        <SelectTrigger
          id="player-season"
          className="w-full min-w-[8rem]"
          data-pending={pending ? "true" : "false"}
          disabled={pending}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className="max-h-72"
          alignItemWithTrigger={false}
          align="end"
        >
          {seasons.map((season) => (
            <SelectItem key={season} value={season}>
              {season}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
