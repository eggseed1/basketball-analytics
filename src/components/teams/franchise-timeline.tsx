import Link from "next/link";

import {
  getFranchiseByCanonicalId,
  type FranchiseRecord,
} from "@/data/identity/franchise-registry";

/** Compact explicit franchise timeline — no modern logo overwrite of eras. */
export function FranchiseTimeline({
  canonicalTeamId,
  franchise,
}: {
  canonicalTeamId: string;
  franchise?: FranchiseRecord | null;
}) {
  const f =
    franchise ?? getFranchiseByCanonicalId(canonicalTeamId) ?? null;
  if (!f) return null;

  return (
    <section
      id="franchise"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Franchise history"
    >
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">
          Franchise timeline
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Explicit lineage (renames / relocations). Historical names are not
          replaced by the current brand.
        </p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        <ol className="flex flex-col gap-3">
          {f.identities.map((id) => (
            <li
              key={id.teamSeasonIdentityId}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-[15px] font-semibold">{id.displayName}</p>
                <p className="text-[12px] text-muted-foreground">
                  {id.city} · {id.abbreviation}
                  {id.seasonTo
                    ? ` · ${id.seasonFrom} → ${id.seasonTo}`
                    : ` · ${id.seasonFrom} → present`}
                </p>
              </div>
              <Link
                href={`/teams/${encodeURIComponent(canonicalTeamId)}?season=${encodeURIComponent(id.seasonFrom)}&from=history`}
                prefetch={false}
                className="text-[12px] font-semibold underline-offset-2 hover:underline"
              >
                Open {id.seasonFrom} →
              </Link>
            </li>
          ))}
        </ol>
        {f.lineageEvents.length > 1 ? (
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-[12px] text-muted-foreground">
            {f.lineageEvents.map((e, i) => (
              <li key={`${e.season}-${e.type}-${i}`}>
                <span className="font-semibold uppercase tracking-wide">
                  {e.type}
                </span>
                {" · "}
                {e.season}: {e.note}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-[13px]">
          <Link
            href="#franchise-book"
            prefetch={false}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Franchise scrapbook ↑
          </Link>
          {" · "}
          <Link
            href="/franchises"
            prefetch={false}
            className="font-semibold underline-offset-2 hover:underline"
          >
            All franchises →
          </Link>
        </p>
      </div>
    </section>
  );
}
