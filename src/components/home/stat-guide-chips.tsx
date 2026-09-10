import Link from "next/link";

import { listStatGuides } from "@/content/stats/guides";

/** Compact links into learn pages - no pedagogy on the home surface. */
export function StatGuideChips() {
  const preferred = ["drbl", "r1_win_eq", "darko", "ts", "usg", "raptor"];
  const byId = new Map(listStatGuides().map((g) => [g.id, g]));
  const featured = preferred
    .map((id) => byId.get(id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">Stats</h2>
          <p className="text-[14px] text-muted-foreground">
            Tap any metric for a quick guide.
          </p>
        </div>
        <Link
          href="/learn"
          className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          All guides
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {featured.map((g) => (
          <Link
            key={g.id}
            href={`/learn/${g.slug}`}
            className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            {g.shortName}
          </Link>
        ))}
      </div>
    </section>
  );
}
