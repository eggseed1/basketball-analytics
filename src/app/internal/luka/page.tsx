import type { Metadata } from "next";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { LukaBrefProfileView } from "@/components/internal/luka-bref-profile";
import { getLukaBrefProfile } from "@/data/queries/luka-bref-profile";
import { getLukaShotMap } from "@/data/queries/luka-shots";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";

export const metadata: Metadata = {
  title: "Luka Dončić (BRef example)",
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Frozen example profile - see docs/prd-luka-bref-profile-example.md.
 * Does not replace /players/[playerId].
 */
export default async function LukaBrefExamplePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const profile = await getLukaBrefProfile(sp);
  const shotMap =
    profile.tab === "shooting"
      ? await getLukaShotMap({
          season: profile.season,
          seasonType: profile.seasonType,
          team: profile.team,
        })
      : null;
  const washTeam =
    profile.team === "TOT"
      ? profile.teamOptions.filter((t) => t !== "TOT").at(-1)
      : profile.team;
  const brand = resolveTeamBrand(washTeam);
  const atmosphere = brandAtmosphereColors(brand?.primary, brand?.secondary);

  return (
    <DestinationClientShell className="site-shell relative flex flex-1 flex-col gap-4 py-5 sm:py-7">
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <main className="relative z-[1] flex flex-1 flex-col">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Internal example · Basketball-Reference backbone
        </p>
        <LukaBrefProfileView profile={profile} shotMap={shotMap} />
      </main>
    </DestinationClientShell>
  );
}
