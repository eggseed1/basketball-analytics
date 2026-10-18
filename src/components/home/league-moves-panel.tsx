import { TeamLogo } from "@/components/brand/team-logo";
import { NewSinceTag } from "@/components/home/new-since-tag";
import { type LeagueMove, type LeagueMoveKind } from "@/lib/league-moves";

const KIND: Record<LeagueMoveKind, { label: string; color: string }> = {
  coaching: { label: "Coaching", color: "#2f6fdb" },
  "front-office": { label: "Front office", color: "#7a4fd6" },
  ownership: { label: "Ownership", color: "#1f8a5b" },
  league: { label: "League", color: "#c2552d" },
};

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** Sidebar list of front office, coaching, ownership and league headlines. */
export function LeagueMovesPanel({ moves }: { moves: LeagueMove[] }) {
  if (!moves.length) return null;
  return (
    <section aria-labelledby="league-moves-title" className="sports-card flex flex-col gap-2 p-4">
      <h2 id="league-moves-title" className="type-heading">League & team moves</h2>
      <ul className="flex flex-col divide-y divide-border/40">
        {moves.map((m) => {
          const kind = KIND[m.kind];
          return (
            <li key={m.id} data-motion="row" className="flex gap-3 py-2.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center">
                {m.teamAbbr ? (
                  <TeamLogo teamKey={m.teamAbbr} size="xs" />
                ) : (
                  <span aria-hidden className="size-2 rounded-full" style={{ background: kind.color }} />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className="type-micro font-bold uppercase tracking-[0.08em]"
                    style={{ color: kind.color }}
                  >
                    {kind.label}
                  </span>
                  <NewSinceTag id={`move:${m.id}`} />
                </span>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="type-body-sm font-semibold leading-snug hover:underline"
                >
                  {m.title}
                </a>
                <span className="type-caption text-muted-foreground">
                  {shortDate(m.publishedMs)}
                  {m.publication ? ` · ${m.publication}` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
