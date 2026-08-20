import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getFranchiseMatchupPage,
  MATCHUP_SCOPE_LABEL,
  matchupHref,
} from "@/data/history/team-matchup-index";
import { getCanonicalTeamById } from "@/data/identity/team-map";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ teamId: string; oppId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parsePage(raw: string | undefined): number {
  return Math.max(1, Number.parseInt(raw ?? "1", 10) || 1);
}

function parseSeasonType(
  raw: string | undefined
): "ALL" | "Regular Season" | "Playoffs" {
  if (raw === "Playoffs" || raw === "playoffs") return "Playoffs";
  if (raw === "Regular Season" || raw === "regular") return "Regular Season";
  return "ALL";
}

function labelFor(canonicalId: string, seasonHint?: string | null): string {
  const team = getCanonicalTeamById(canonicalId);
  if (seasonHint) {
    const brand = resolveHistoricalTeamBrand(canonicalId, seasonHint, "era");
    if (brand?.displayName) return brand.displayName;
  }
  return team?.displayName ?? canonicalId;
}

export async function generateMetadata({ params }: PageProps) {
  const { teamId, oppId } = await params;
  const a = getCanonicalTeamById(teamId)?.abbr ?? teamId;
  const b = getCanonicalTeamById(oppId)?.abbr ?? oppId;
  return {
    title: `${a} vs ${b} | Matchup history`,
    description: `${MATCHUP_SCOPE_LABEL} matchup games between ${a} and ${b}.`,
  };
}

export default async function TeamMatchupPage({
  params,
  searchParams,
}: PageProps) {
  const { teamId, oppId } = await params;
  const sp = await searchParams;
  const page = parsePage(first(sp.gamesPage));
  const seasonType = parseSeasonType(first(sp.seasonType));

  const result = getFranchiseMatchupPage({
    teamA: teamId,
    teamB: oppId,
    page,
    seasonType,
  });
  if (!result) notFound();

  const { summary, rows, pageCount, total } = result;
  const nameA = labelFor(summary.franchiseA, summary.seasonTo);
  const nameB = labelFor(summary.franchiseB, summary.seasonTo);
  const teamA = getCanonicalTeamById(summary.franchiseA);
  const teamB = getCanonicalTeamById(summary.franchiseB);

  const closest = [...rows]
    .sort(
      (x, y) =>
        Math.abs(x.homeScore - x.awayScore) -
        Math.abs(y.homeScore - y.awayScore)
    )
    .slice(0, 5);
  const largest = [...rows]
    .sort(
      (x, y) =>
        Math.abs(y.homeScore - y.awayScore) -
        Math.abs(x.homeScore - x.awayScore)
    )
    .slice(0, 5);

  const filterHref = (st: "ALL" | "Regular Season" | "Playoffs") =>
    matchupHref(summary.franchiseA, summary.franchiseB, {
      seasonType: st,
      page: 1,
    });

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <p>
        <Link
          href={`/teams/${encodeURIComponent(summary.franchiseA)}`}
          className="text-[13px] font-semibold text-muted-foreground"
          prefetch={false}
        >
          ← {teamA?.abbr ?? "Team"}
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link
          href={`/teams/${encodeURIComponent(summary.franchiseB)}`}
          className="text-[13px] font-semibold text-muted-foreground"
          prefetch={false}
        >
          {teamB?.abbr ?? "Opponent"}
        </Link>
      </p>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Franchise matchup · {MATCHUP_SCOPE_LABEL}
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          {nameA} vs {nameB}
        </h1>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Game archive coverage starts in 1996-97. Historical names stay as they
          were on each tip-off — not modern successor brands. This is franchise
          lineage mode, not exact single-era team identity.
        </p>
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Matchup summary"
      >
        <Stat label="Games" value={String(summary.games)} />
        <Stat
          label={`${teamA?.abbr ?? "A"} wins`}
          value={String(summary.winsA)}
        />
        <Stat
          label={`${teamB?.abbr ?? "B"} wins`}
          value={String(summary.winsB)}
        />
        <Stat
          label="Playoffs / OT"
          value={`${summary.playoffGames} / ${summary.otGames}`}
        />
      </section>

      <nav className="flex flex-wrap gap-2 text-[13px]" aria-label="Season type">
        {(
          [
            ["ALL", "All"],
            ["Regular Season", "Regular season"],
            ["Playoffs", "Playoffs"],
          ] as const
        ).map(([st, label]) => (
          <Link
            key={st}
            href={filterHref(st)}
            prefetch={false}
            className={
              seasonType === st
                ? "rounded-md bg-foreground px-3 py-1.5 font-semibold text-background"
                : "rounded-md border border-border px-3 py-1.5 font-semibold"
            }
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
          <p className="text-[12px] text-muted-foreground">
            {total.toLocaleString()} · page {result.page}/{pageCount} · ≤
            {result.pageSize} rows
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No games in this filter.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((g) => (
              <li key={g.gameId}>
                <Link
                  href={`/games/${encodeURIComponent(g.gameId)}?season=${encodeURIComponent(g.season)}`}
                  prefetch={false}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[13px] hover:bg-secondary/40"
                >
                  <span className="font-semibold">
                    {g.date}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {g.awayTricode} @ {g.homeTricode}
                      {g.ot ? " · OT" : ""}
                      {g.seasonType.toLowerCase().includes("playoff")
                        ? " · Playoffs"
                        : ""}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {g.awayScore}–{g.homeScore} · {g.season}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pageCount > 1 ? (
          <nav className="flex gap-3 text-[13px]" aria-label="Matchup pages">
            {result.page > 1 ? (
              <Link
                href={matchupHref(summary.franchiseA, summary.franchiseB, {
                  page: result.page - 1,
                  seasonType,
                })}
                prefetch={false}
                className="font-semibold underline-offset-2 hover:underline"
              >
                ← Prev
              </Link>
            ) : null}
            {result.page < pageCount ? (
              <Link
                href={matchupHref(summary.franchiseA, summary.franchiseB, {
                  page: result.page + 1,
                  seasonType,
                })}
                prefetch={false}
                className="font-semibold underline-offset-2 hover:underline"
              >
                Next →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      {closest.length > 0 ? (
        <HighlightList
          title="Closest on this page"
          rows={closest}
          detail={(g) =>
            `${Math.abs(g.homeScore - g.awayScore)} pt · ${g.awayTricode} ${g.awayScore}–${g.homeScore} ${g.homeTricode}`
          }
        />
      ) : null}
      {largest.length > 0 ? (
        <HighlightList
          title="Largest margins on this page"
          rows={largest}
          detail={(g) =>
            `${Math.abs(g.homeScore - g.awayScore)} pt · ${g.awayTricode} ${g.awayScore}–${g.homeScore} ${g.homeTricode}`
          }
        />
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

function HighlightList({
  title,
  rows,
  detail,
}: {
  title: string;
  rows: Array<{
    gameId: string;
    season: string;
    date: string;
    homeScore: number;
    awayScore: number;
    homeTricode: string;
    awayTricode: string;
  }>;
  detail: (g: (typeof rows)[number]) => string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
      <ul className="sports-card divide-y divide-border px-4">
        {rows.map((g) => (
          <li key={`${title}-${g.gameId}`}>
            <Link
              href={`/games/${encodeURIComponent(g.gameId)}?season=${encodeURIComponent(g.season)}`}
              prefetch={false}
              className="flex flex-col gap-0.5 py-2.5 text-[13px] hover:bg-secondary/40"
            >
              <span className="font-semibold">{g.date}</span>
              <span className="text-muted-foreground">{detail(g)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
