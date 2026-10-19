import type { CSSProperties } from "react";

import { resolveTeamBrand } from "@/lib/nba-brand";

/** Paint a subtree with one club's colors. The shell default stays the user's team. */
export function teamColorStyle(teamId?: string | null): CSSProperties {
  const brand = resolveTeamBrand(teamId);
  return {
    "--team-primary": brand?.primary ?? "#1d7a45",
    "--team-secondary": brand?.secondary ?? "#e8e8ed",
  } as CSSProperties;
}
