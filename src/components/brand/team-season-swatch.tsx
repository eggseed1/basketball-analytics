"use client";

import {
  teamSeasonFillStyle,
  teamSeasonIsMulti,
  type TeamPalette,
} from "@/lib/team-season-colors";
import { useChartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

export function TeamSeasonSwatch({
  teamKeys,
  className,
  size = "sm",
  palette,
}: {
  teamKeys: string[];
  className?: string;
  size?: "xs" | "sm" | "md";
  palette?: TeamPalette;
}) {
  const { surface } = useChartTheme();
  const sizeClass =
    size === "xs" ? "size-1.5" : size === "md" ? "size-3" : "size-2";
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        teamSeasonIsMulti(teamKeys) && "ring-1 ring-background/80",
        sizeClass,
        className
      )}
      style={teamSeasonFillStyle(teamKeys, surface, palette)}
      aria-hidden
    />
  );
}
