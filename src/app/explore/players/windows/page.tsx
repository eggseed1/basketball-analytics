import Link from "next/link";

import { StatDetectiveLists } from "@/components/explore/stat-detective-panel";
import { PageHeader } from "@/components/layout/page-header";
import {
  isStatWindowId,
  statDetectiveSeason,
  statDetectiveWindow,
  statDetectiveWindows,
} from "@/data/runtime/stat-detective-windows";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Stat Detective",
  description:
    "Regular-season scoring windows compared with a player's own season or the five games before. Playoffs are left out.",
};

export default async function StatDetectivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.window) ? params.window[0] : params.window;
  const windows = statDetectiveWindows();
  const active = statDetectiveWindow(isStatWindowId(raw) ? raw : "last5");
  const season = statDetectiveSeason();

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Players"
        title="Stat Detective"
        subtitle={
          season
            ? `${season} regular-season logs only. A player needs 20 games and 18 minutes a game in both sides of the comparison. Missing logs are omitted, not filled in.`
            : "No baked game logs for a window comparison yet."
        }
      />

      <div className="flex flex-wrap gap-2">
        {windows.map((window) => (
          <Link
            key={window.id}
            href={`/explore/players/windows?window=${window.id}`}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[13px] font-semibold",
              window.id === active.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {window.label}
          </Link>
        ))}
      </div>

      <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
        <p className="text-[13px] text-muted-foreground">{active.note}</p>
        <StatDetectiveLists risers={active.risers} fallers={active.fallers} />
      </section>
    </main>
  );
}
