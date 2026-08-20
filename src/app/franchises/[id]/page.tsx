import { TransitionLink } from "@/components/continuity/query-nav";
import { notFound } from "next/navigation";

import { GlassSurface } from "@/components/brand/glass-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import type { FranchiseHistory, FranchiseLeader } from "@/data/franchises/history";
import {
  franchiseHistoryAsOf,
  franchisePlayoffWinPct,
  franchiseTitleCount,
  franchiseWinPct,
  getFranchiseHistory,
  listFranchiseHistories,
} from "@/data/queries/franchises";
import { formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return listFranchiseHistories().map((f) => ({ id: f.id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const f = getFranchiseHistory(id);
  if (!f) return { title: "Franchise | Basketball Analytics" };
  return {
    title: `${f.city} ${f.name} history | Basketball Analytics`,
    description: `All-time ${f.city} ${f.name} records - titles, playoffs, leaders, and fan lore.`,
  };
}

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
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight">
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
        <p className="truncate text-[16px] font-semibold">{leader.player}</p>
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
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[20px] font-bold tabular-nums">
        {season.wins}-{season.losses}
      </p>
      <p className="text-[14px] text-muted-foreground">{season.season}</p>
    </div>
  );
}

export default async function FranchiseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const f = getFranchiseHistory(id);
  if (!f) notFound();

  const brand = resolveTeamBrand(f.abbr);
  const titles = franchiseTitleCount(f);
  const rsPct = franchiseWinPct(f);
  const poPct = franchisePlayoffWinPct(f);
  const asOf = franchiseHistoryAsOf();
  const titleYears =
    f.championships.length > 0
      ? f.championships.join(" · ")
      : "Still hunting the first banner";

  return (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <p>
        <TransitionLink
          href="/franchises"
          className="text-[14px] font-semibold text-muted-foreground"
        >
          ← Franchises
        </TransitionLink>
      </p>

      <GlassSurface
        as="header"
        accentColor={brand?.primary}
        className="px-4 py-5 sm:px-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <TeamLogo teamKey={f.abbr} size="lg" />
            <div>
              <p className="text-[14px] font-semibold text-muted-foreground">
                {f.conference} · {f.division} · since {f.firstSeason}
              </p>
              <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
                {f.city} {f.name}
              </h1>
              {f.previousHomes?.length ? (
                <p className="mt-1 text-[14px] text-muted-foreground">
                  Also known as: {f.previousHomes.join(" → ")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TransitionLink
              href="/explore/teams"
              className="rounded-md bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
              This season
            </TransitionLink>
            <TransitionLink
              href="/gm"
              className="rounded-md bg-foreground px-4 py-2 text-[14px] font-semibold text-background"
            >
              Franchise Lab
            </TransitionLink>
          </div>
        </div>
      </GlassSurface>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-[18px] font-bold tracking-tight">
            Peaks & valleys
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <SeasonLine label="Best season" season={f.bestSeason} tone="good" />
            <SeasonLine
              label="Worst season"
              season={f.worstSeason}
              tone="bad"
            />
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Longest win streak
              </p>
              <p className="mt-1 text-[20px] font-bold tabular-nums">
                {f.longestWinStreak.games}
              </p>
              <p className="text-[14px] text-muted-foreground">
                {f.longestWinStreak.note}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Longest losing streak
              </p>
              <p className="mt-1 text-[20px] font-bold tabular-nums">
                {f.longestLosingStreak.games}
              </p>
              <p className="text-[14px] text-muted-foreground">
                {f.longestLosingStreak.note}
              </p>
            </div>
          </div>

          <div className="mt-2 grid gap-3 sm:grid-cols-3">
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
          <h2 className="text-[18px] font-bold tracking-tight">
            Franchise leaders
          </h2>
          <p className="mb-1 text-[14px] text-muted-foreground">
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
      </section>

      <section className="rounded-md border border-border bg-card px-4 py-4 sm:px-5">
        <h2 className="text-[18px] font-bold tracking-tight">Fan lore</h2>
        <p className="mt-0.5 text-[14px] text-muted-foreground">
          The weird, wonderful, and argument-starting stuff.
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {f.funFacts.map((fact) => (
            <li
              key={fact}
              className="flex gap-3 text-[16px] leading-relaxed"
            >
              <span
                className="mt-2 size-1.5 shrink-0 rounded-md bg-foreground/40"
                aria-hidden
              />
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="pb-8 text-[12px] text-muted-foreground">
        Continuous franchises keep relocated history. Counts are curated
        snapshots through {asOf} - browse-friendly, not a live NBA feed.
      </p>
    </main>
  );
}
