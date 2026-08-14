import Link from "next/link";

import { listStatGuides } from "@/content/stats/guides";

export const metadata = {
  title: "Learn",
  description: "Learn NBA advanced stats and DRBL analytical concepts.",
};

export default function LearnIndexPage() {
  const guides = listStatGuides();
  const byCat = {
    impact: guides.filter((g) => g.category === "impact"),
    efficiency: guides.filter((g) => g.category === "efficiency"),
    possession: guides.filter((g) => g.category === "possession"),
    team: guides.filter((g) => g.category === "team"),
  } as const;

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <header>
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Learn
        </p>
        <h1 className="mt-1 text-[28px] font-bold tracking-tight sm:text-[32px]">
          Advanced stats
        </h1>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {(
          [
            ["impact", "Impact"],
            ["efficiency", "Efficiency"],
            ["possession", "Possessions"],
            ["team", "Team"],
          ] as const
        ).map(([key, label]) => (
          <section key={key} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </h2>
            <ul className="sports-card divide-y divide-black/5">
              {byCat[key].map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/learn/${g.slug}`}
                    className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-secondary/50"
                  >
                    <span>
                      <span className="block text-[15px] font-semibold">
                        {g.shortName}
                      </span>
                      <span className="block text-[13px] text-muted-foreground">
                        {g.blurb}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                      Learn
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
