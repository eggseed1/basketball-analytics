import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamPayrollView } from "@/components/teams/team-payroll-view";
import {
  buildTeamPayrollPresentation,
  isCurrentFrontOfficeSeason,
  loadTeamFrontOfficeSlice,
  resolveFrontOfficeFranchiseId,
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
  return { title: `${name} Payroll & Contracts | Basketball Analytics` };
}

export default async function TeamPayrollPage({
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
        <h1 className="text-2xl font-semibold">Historical front office</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Payroll &amp; contracts for {seasonParam} are not shown on this
          historical team page. Current franchise front-office data is separate.
        </p>
        <Link
          href={`/teams/${franchiseId}/payroll`}
          className="mt-4 inline-flex font-semibold underline"
        >
          View current franchise front office
        </Link>
      </main>
    );
  }

  const slice = loadTeamFrontOfficeSlice(franchiseId);
  if (!slice) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Payroll unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No validated front-office snapshot is published for this franchise.
        </p>
        <Link href={`/teams/${franchiseId}`} className="mt-4 inline-flex underline">
          Back to team
        </Link>
      </main>
    );
  }

  const data = buildTeamPayrollPresentation(slice);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-sm">
        <Link href={`/teams/${franchiseId}`} className="underline">
          ← {data.team.displayName}
        </Link>
        {" · "}
        <Link href={`/teams/${franchiseId}/draft-assets`} className="underline">
          Draft Assets
        </Link>
      </p>
      <TeamPayrollView data={data} />
    </main>
  );
}
