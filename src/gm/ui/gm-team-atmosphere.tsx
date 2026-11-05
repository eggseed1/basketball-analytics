"use client";

import { NBA_ATMOSPHERE, PageAtmosphere } from "@/components/brand/page-atmosphere";
import { useGmStore } from "@/gm/state/gm-store";
import { resolveTeamBrand } from "@/lib/nba-brand";

/**
 * Reuse the exact site's animated orbs, but tint them with the club owned by
 * this saved franchise rather than the generic NBA blue/red wash.
 *
 * Mounted by the persistent SportsShell so both colors and animations survive
 * each /gm client-side route and its loading boundary.
 */
export function GmTeamAtmosphere() {
  const teamId = useGmStore(state => state.league?.userTeamId);
  const brand = resolveTeamBrand(teamId);
  return <PageAtmosphere
    colorA={brand?.primary ?? NBA_ATMOSPHERE.colorA}
    colorB={brand?.secondary ?? NBA_ATMOSPHERE.colorB}
  />;
}
