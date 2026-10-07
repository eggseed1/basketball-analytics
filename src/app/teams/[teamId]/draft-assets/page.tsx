import Link from "next/link";
import { notFound } from "next/navigation";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { TeamDraftAssetsView } from "@/components/teams/team-draft-assets-view";
import { TeamDraftRightsTable } from "@/components/teams/team-draft-rights-table";
import { FuturePicksSourceNote, TeamFuturePicksTable } from "@/components/teams/team-future-picks";
import { getTeamContracts, getTeamFuturePicks } from "@/data/queries/team-contracts";
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
  return { title: `${name} Draft Assets` };
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
          capital. Use the link below for the current view.
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
  const futurePicks = getTeamFuturePicks(franchiseId);
  const contracts = getTeamContracts(franchiseId);
  if (futurePicks || contracts) {
    const teamName = slice?.team.displayName ?? futurePicks?.teamAbbr ?? contracts?.code ?? franchiseId;
    return (
      <main data-motion-page className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
        <MotionReveal />
        <p className="text-sm">
          <Link href={`/teams/${franchiseId}`} className="underline">
            ← {teamName}
          </Link>
          {" · "}
          <Link href={`/teams/${franchiseId}/payroll`} className="underline">
            Payroll &amp; Contracts
          </Link>
        </p>
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft picks &amp; rights</p>
          <h1 className="text-3xl font-semibold tracking-tight">{teamName}</h1>
        </header>
        {futurePicks ? (
          <section className="flex flex-col gap-3" aria-labelledby="picks-heading">
            <h2 id="picks-heading" className="text-lg font-semibold">
              Future draft picks
            </h2>
            <TeamFuturePicksTable data={futurePicks} />
            <FuturePicksSourceNote data={futurePicks} />
          </section>
        ) : null}
        {contracts ? (
          <section className="flex flex-col gap-3" aria-labelledby="rights-heading">
            <h2 id="rights-heading" className="text-lg font-semibold">
              Draft rights
            </h2>
            <p className="text-sm text-muted-foreground">
              Players the team drafted or traded for who haven&apos;t signed an NBA contract. The team keeps their rights
              if they come over.
            </p>
            <TeamDraftRightsTable data={contracts} />
          </section>
        ) : null}
      </main>
    );
  }
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
    <main data-motion-page className="mx-auto max-w-6xl px-4 py-8">
      <MotionReveal />
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
