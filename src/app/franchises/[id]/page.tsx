import { notFound, redirect } from "next/navigation";

import {
  getFranchiseHistory,
  listFranchiseHistories,
} from "@/data/queries/franchises";
import { teamHistoryHref } from "@/lib/team-identity";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return listFranchiseHistories().map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const f = getFranchiseHistory(id);
  if (!f) return { title: "Franchise | Basketball Analytics" };
  return {
    title: `${f.city} ${f.name} history | Basketball Analytics`,
    description: `All-time ${f.city} ${f.name} records - titles, playoffs, leaders, and fan lore.`,
  };
}

/** Legacy scrapbook URLs → team History tab. */
export default async function FranchiseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const f = getFranchiseHistory(id);
  if (!f) notFound();
  redirect(teamHistoryHref(f.abbr));
}
