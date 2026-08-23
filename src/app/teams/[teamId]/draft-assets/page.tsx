import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamDraftAssetsView } from "@/components/teams/team-draft-assets-view";
import {
  buildTeamDraftAssetsPresentation,
  isCurrentFrontOfficeSeason,
  resolveFrontOfficeFranchiseId,
  resolveTeamFrontOfficeSlice,
} from "@/data/front-office/load-team-front-office";
import { resolveTeamBrand } from "@/lib/nba-brand";

interface PageProps {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps) {
  const { teamId } = await params;
  const brand = resolveTeamBrand(teamId);
  const name = brand?.abbr ?? teamId;
  return { title: `${name} Draft Assets | Basketball Analytics` };
}

export default async function TeamDraftAssetsPage({
  params,
  searchParams,
}: PageProps) {
  const { teamId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const franchiseId = resolveFrontOfficeFranchiseId(teamId);
  if (!franchiseId) notFound();

  if (seasonParam && !isCurrentFrontOfficeSeason(seasonParam)) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Historical draft assets</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Draft assets for {seasonParam} are not shown as current franchise
          capital. Temporal jump must stay explicit.
        </p>
        <Link
          href={`/teams/${franchiseId}/draft-assets`}
          className="mt-4 inline-flex font-semibold underline"
        >
          View current franchise draft assets
        </Link>
      </main>
    );
  }

  const slice = await resolveTeamFrontOfficeSlice(franchiseId);
  if (!slice) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Draft assets unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No validated front-office snapshot is published for this franchise.
        </p>
      </main>
    );
  }

  const data = buildTeamDraftAssetsPresentation(slice);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm">
        <Link href={`/teams/${franchiseId}`} className="underline">
          ← {data.franchise.displayName}
        </Link>
        {" · "}
        <Link href={`/teams/${franchiseId}/payroll`} className="underline">
          Payroll &amp; Contracts
        </Link>
      </p>
      <TeamDraftAssetsView data={data} />
    </main>
  );
}
