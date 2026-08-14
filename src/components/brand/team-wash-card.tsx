import type { CSSProperties, ReactNode } from "react";

import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

/**
 * Soft dual-tone team wash — same language as the player hero card.
 * `teamKey` / `secondaryTeamKey` drive --away-color / --home-color.
 */
export function TeamWashCard({
  teamKey,
  secondaryTeamKey,
  className,
  children,
  as: Tag = "section",
}: {
  teamKey?: string | null;
  /** Optional second brand (e.g. career first team → current). */
  secondaryTeamKey?: string | null;
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "aside" | "header";
}) {
  const primary = resolveTeamBrand(teamKey);
  const secondary =
    resolveTeamBrand(secondaryTeamKey) ?? primary;

  return (
    <Tag
      className={cn(
        "sports-card score-card-wash overflow-hidden",
        className
      )}
      style={
        primary
          ? ({
              "--away-color": primary.primary,
              "--home-color":
                secondary?.secondary ??
                secondary?.primary ??
                primary.secondary ??
                primary.primary,
            } as CSSProperties)
          : undefined
      }
    >
      {children}
    </Tag>
  );
}
