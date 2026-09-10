import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Legacy race URL → Visualizations hub. */
export default async function PlayerRaceRedirect({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  params.set("view", "race");
  for (const key of ["season", "metric", "top", "pin", "end", "minmp"] as const) {
    const value = one(sp, key);
    if (value) params.set(key, value);
  }
  redirect(`/explore/players/visualizations?${params.toString()}`);
}
