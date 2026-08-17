import Link from "next/link";

import { listStatGuides } from "@/content/stats/guides";

/** Compact links into learn pages - no pedagogy on the home surface. */
export function StatGuideChips() {
  const featured = listStatGuides().filter((g) =>
    ["darko", "ts", "usg", "net", "lebron"].includes(g.id)
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Stats</h2>
          <p className="text-[13px] text-muted-foreground">
            Tap any metric for a quick guide.
          </p>
        </div>
        <Link
          href="/learn"
          className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          All guides
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {featured.map((g) => (
          <Link
            key={g.id}
            href={`/learn/${g.slug}`}
            className="rounded-md bg-secondary px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            {g.shortName}
          </Link>
        ))}
      </div>
    </section>
  );
}
