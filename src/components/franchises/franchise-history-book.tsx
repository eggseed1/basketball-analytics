import type { FranchiseHistory, FranchiseLeader } from "@/data/franchises/history";
import {
  franchiseHistoryAsOf,
  franchisePlayoffWinPct,
  franchiseTitleCount,
  franchiseWinPct,
} from "@/data/queries/franchises";
import { formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function LeaderRow({
  label,
  leader,
}: {
  label: string;
  leader: FranchiseLeader;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-[15px] font-semibold">{leader.player}</p>
        {leader.note ? (
          <p className="text-[12px] text-muted-foreground">{leader.note}</p>
        ) : null}
      </div>
      <p className="shrink-0 text-[18px] font-bold tabular-nums">
        {formatNumber(leader.value)}
      </p>
    </div>
  );
}

function SeasonLine({
  label,
  season,
  tone,
}: {
  label: string;
  season: FranchiseHistory["bestSeason"];
  tone: "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3",
        tone === "good"
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-rose-500/25 bg-rose-500/5"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[20px] font-bold tabular-nums">
        {season.wins}-{season.losses}
      </p>
      <p className="text-[13px] text-muted-foreground">{season.season}</p>
    </div>
  );
}

/**
 * Curated franchise scrapbook — titles, peaks, leaders, fan lore.
 * Lives on the team History tab (and was formerly /franchises/[id]).
 */
export function FranchiseHistoryBook({
  franchise: f,
}: {
  franchise: FranchiseHistory;
}) {
  const titles = franchiseTitleCount(f);
  const rsPct = franchiseWinPct(f);
  const poPct = franchisePlayoffWinPct(f);
  const asOf = franchiseHistoryAsOf();
  const titleYears =
    f.championships.length > 0
      ? f.championships.join(" · ")
      : "Still hunting the first banner";

  return (
    <section
      id="franchise-book"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Franchise scrapbook"
    >
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">
          Franchise scrapbook
        </h2>
        <p className="text-[13px] text-muted-foreground">
          All-time ledger and fan lore through {asOf} — curated snapshots, not
          live season intelligence.
          {f.previousHomes?.length
            ? ` Also known as: ${f.previousHomes.join(" → ")}.`
            : null}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Championships"
          value={String(titles)}
          hint={titleYears}
        />
        <StatTile
          label="Finals appearances"
          value={String(f.finalsAppearances)}
          hint={`${f.conferenceTitles} conference titles`}
        />
        <StatTile
          label="Playoff record"
          value={`${formatNumber(f.playoffWins)}-${formatNumber(f.playoffLosses)}`}
          hint={`${formatPct(poPct)} · ${f.playoffAppearances} appearances`}
        />
        <StatTile
          label="Regular season"
          value={`${formatNumber(f.regularSeasonWins)}-${formatNumber(f.regularSeasonLosses)}`}
          hint={`${formatPct(rsPct)} all-time`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <h3 className="text-[15px] font-bold tracking-tight">
            Peaks & valleys
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <SeasonLine label="Best season" season={f.bestSeason} tone="good" />
            <SeasonLine
              label="Worst season"
              season={f.worstSeason}
              tone="bad"
            />
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Longest win streak
              </p>
              <p className="mt-1 text-[20px] font-bold tabular-nums">
                {f.longestWinStreak.games}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {f.longestWinStreak.note}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Longest losing streak
              </p>
              <p className="mt-1 text-[20px] font-bold tabular-nums">
                {f.longestLosingStreak.games}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {f.longestLosingStreak.note}
              </p>
            </div>
          </div>

          <div className="mt-1 grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Division titles"
              value={String(f.divisionTitles)}
            />
            <StatTile
              label="Retired numbers"
              value={String(f.retiredNumbers)}
            />
            <StatTile
              label="History as of"
              value={asOf}
              hint="Curated franchise book"
            />
          </div>
        </div>

        <div className="rounded-md border border-border bg-card px-4 py-3">
          <h3 className="text-[15px] font-bold tracking-tight">
            Franchise leaders
          </h3>
          <p className="mb-1 text-[13px] text-muted-foreground">
            Career totals in this continuous franchise.
          </p>
          <LeaderRow label="Points" leader={f.leaders.points} />
          <LeaderRow label="Rebounds" leader={f.leaders.rebounds} />
          <LeaderRow label="Assists" leader={f.leaders.assists} />
          {f.leaders.steals ? (
            <LeaderRow label="Steals" leader={f.leaders.steals} />
          ) : null}
          {f.leaders.blocks ? (
            <LeaderRow label="Blocks" leader={f.leaders.blocks} />
          ) : null}
          {f.leaders.threes ? (
            <LeaderRow label="Threes" leader={f.leaders.threes} />
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card px-4 py-4 sm:px-5">
        <h3 className="text-[15px] font-bold tracking-tight">Fan lore</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          The weird, wonderful, and argument-starting stuff.
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {f.funFacts.map((fact) => (
            <li
              key={fact}
              className="flex gap-3 text-[15px] leading-relaxed"
            >
              <span
                className="mt-2 size-1.5 shrink-0 rounded-md bg-foreground/40"
                aria-hidden
              />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Continuous franchises keep relocated history. Counts are curated
        snapshots through {asOf}. Season boards and roster live on the other
        team tabs.
      </p>
    </section>
  );
}
