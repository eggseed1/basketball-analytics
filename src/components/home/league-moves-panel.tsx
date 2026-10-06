import { TeamLogo } from "@/components/brand/team-logo";
import { LEAGUE_MOVE_MAX_AGE_DAYS, type LeagueMove, type LeagueMoveKind } from "@/lib/league-moves";

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
    <section aria-labelledby="league-moves-title" className="sports-card flex flex-col gap-2 p-4 sm:p-[21px]">
      <div>
        <h2 id="league-moves-title" className="type-heading">League & team moves</h2>
        <p className="type-body-sm text-muted-foreground">
          Front office, coaching, ownership and league news from the last {LEAGUE_MOVE_MAX_AGE_DAYS} days.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {moves.map((m) => {
          const kind = KIND[m.kind];
          return (
            <li key={m.id} className="flex gap-3 py-2.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center">
                {m.teamAbbr ? (
                  <TeamLogo teamKey={m.teamAbbr} size="xs" />
                ) : (
                  <span aria-hidden className="size-2 rounded-full" style={{ background: kind.color }} />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: kind.color }}
                >
                  {kind.label}
                </span>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-semibold leading-snug hover:underline"
                >
                  {m.title}
                </a>
                <span className="text-[11px] text-muted-foreground">
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
