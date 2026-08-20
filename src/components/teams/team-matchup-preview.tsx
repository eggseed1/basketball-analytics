import Link from "next/link";

import { listMatchupPairSummaries, matchupHref } from "@/data/history/team-matchup-index";
import { getCanonicalTeamById } from "@/data/identity/team-map";

/** Compact rival suggestions for a franchise — not a full matchup dump. */
export function TeamMatchupPreview({
  canonicalTeamId,
  limit = 6,
}: {
  canonicalTeamId: string;
  limit?: number;
}) {
  const pairs = listMatchupPairSummaries()
    .filter(
      (p) =>
        p.franchiseA === canonicalTeamId || p.franchiseB === canonicalTeamId
    )
    .slice(0, limit);

  if (!pairs.length) return null;

  return (
    <section
      id="matchups"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Matchups"
    >
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Matchups</h2>
        <p className="text-[13px] text-muted-foreground">
          Since 1996-97 · franchise lineage mode · summary first
        </p>
      </div>
      <ul className="sports-card divide-y divide-border px-4">
        {pairs.map((p) => {
          const oppId =
            p.franchiseA === canonicalTeamId ? p.franchiseB : p.franchiseA;
          const opp = getCanonicalTeamById(oppId);
          const wins =
            p.franchiseA === canonicalTeamId ? p.winsA : p.winsB;
          const losses =
            p.franchiseA === canonicalTeamId ? p.winsB : p.winsA;
          return (
            <li key={p.pairKey}>
              <Link
                href={matchupHref(canonicalTeamId, oppId)}
                prefetch={false}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[13px] hover:bg-secondary/40"
              >
                <span className="font-semibold">
                  vs {opp?.displayName ?? oppId}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {p.games} games · {wins}–{losses}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
