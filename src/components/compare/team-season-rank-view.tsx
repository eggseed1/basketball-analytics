"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type {
  TeamSeasonRankEntry,
  TeamSeasonRanking,
} from "@/analytics/rank-team-seasons";
import {
  TEAM_SEASON_RANK_MAX,
  TEAM_SEASON_RANK_MIN,
  teamSeasonRankPath,
} from "@/analytics/rank-team-seasons";
import type { TeamSeasonEvidence } from "@/analytics/season-evidence";
import { preferredEvidenceForRankHints } from "@/analytics/season-evidence";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamSeasonEvidenceSection } from "@/components/compare/team-season-evidence-section";
import { MetricHelp } from "@/components/learn/metric-help";
import { cn } from "@/lib/utils";

function CoverageLine({ entry }: { entry: TeamSeasonRankEntry }) {
  const c = entry.dataCoverage;
  const bits = [
    ["Performance", c.performance],
    ["Efficiency", c.efficiency],
    ["Shooting", c.shooting],
    ["Rebounding", c.rebounding],
    ["Possession", c.possession],
  ] as const;
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className="mr-1 font-medium text-muted-foreground/80">
        Data available:
      </span>
      {bits.map(([label, ok]) => (
        <span key={label} className="mr-2">
          {ok ? "✓" : "—"} {label}
        </span>
      ))}
    </p>
  );
}

function MatrixCellLabel(result: string): string {
  switch (result) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "even":
      return "Even";
    case "unavailable":
      return "Unavailable";
    case "self":
      return "—";
    default:
      return result;
  }
}

function formatPairwiseRecord(entry: TeamSeasonRankEntry): string {
  const parts = [
    `${entry.pairwiseWins} win${entry.pairwiseWins === 1 ? "" : "s"}`,
    `${entry.pairwiseLosses} loss${entry.pairwiseLosses === 1 ? "" : "es"}`,
    `${entry.pairwiseEvens} even`,
  ];
  if (entry.pairwiseUnavailable > 0) {
    parts.push(`${entry.pairwiseUnavailable} unavailable`);
  }
  return `${parts.join(" · ")} · ${entry.copelandPoints} Copeland pts`;
}

export function TeamSeasonRankPicker({
  teamId,
  availableSeasons,
  selected,
}: {
  teamId: string;
  availableSeasons: string[];
  selected: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string[]>(selected);

  const sorted = useMemo(
    () => [...availableSeasons].sort((a, b) => b.localeCompare(a)),
    [availableSeasons]
  );

  function toggle(season: string) {
    setPicked((prev) => {
      if (prev.includes(season)) return prev.filter((s) => s !== season);
      if (prev.length >= TEAM_SEASON_RANK_MAX) return prev;
      return [...prev, season].sort((a, b) => a.localeCompare(b));
    });
  }

  function go() {
    if (picked.length < TEAM_SEASON_RANK_MIN) return;
    startTransition(() => {
      router.push(teamSeasonRankPath(teamId, picked));
    });
  }

  return (
    <div className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">
            Selected seasons
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Pick {TEAM_SEASON_RANK_MIN}–{TEAM_SEASON_RANK_MAX} regular-season
            years ({picked.length} selected).
          </p>
        </div>
        <button
          type="button"
          onClick={go}
          disabled={pending || picked.length < TEAM_SEASON_RANK_MIN}
          className="rounded-md bg-foreground px-4 py-2 text-[13px] font-bold text-background disabled:opacity-50"
        >
          {pending ? "Ranking…" : "Rank seasons"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sorted.map((season) => {
          const on = picked.includes(season);
          return (
            <button
              key={season}
              type="button"
              onClick={() => toggle(season)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[12px] font-semibold tabular-nums",
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {season}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TeamSeasonRankView({
  result,
  topEvidence,
}: {
  result: TeamSeasonRanking;
  /** Lightweight evidence for the #1 eligible season (Game Lab gateway). */
  topEvidence?: TeamSeasonEvidence | null;
}) {
  const [showMethod, setShowMethod] = useState(false);
  const seasons = result.seasons;
  const topSeason =
    result.ranking.find((e) => e.eligible && e.rank === 1)?.season ??
    result.ranking.find((e) => e.eligible)?.season;
  const ledger = result.topCategorySummary;
  const evidenceHighlights = preferredEvidenceForRankHints([
    ...(ledger?.wins ?? []),
    ...(result.ranking.find((e) => e.rank === 1)?.categoryWins ?? []),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Rank team seasons · Regular season
        </p>
        <h2 className="flex items-center gap-2 text-[24px] font-bold tracking-tight sm:text-[28px]">
          <TeamLogo teamKey={result.teamId} size="sm" />
          <Link
            href={`/teams/${encodeURIComponent(result.abbreviation.toLowerCase())}`}
            className="underline-offset-2 hover:underline"
          >
            {result.fullName}
          </Link>
        </h2>
        <p className="text-[14px] text-muted-foreground">
          Each selected season is compared head-to-head with every other using
          Team Season Compare; seasons earn Copeland points from those matchups.
          This is not an opaque “best team” score.
        </p>
      </header>

      {(result.contested || result.closeTop) && (
        <section className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-[13px] text-muted-foreground">
          {result.closeTopNote ? (
            <p>
              <MetricHelp conceptId="close_top" labelClassName="font-semibold">
                Close top
              </MetricHelp>
              {" — "}
              {result.closeTopNote}
            </p>
          ) : null}
          {result.contestedNote ? (
            <p className={result.closeTopNote ? "mt-1" : undefined}>
              <MetricHelp conceptId="contested" labelClassName="font-semibold">
                Contested
              </MetricHelp>
              {" — "}
              {result.contestedNote}
            </p>
          ) : null}
        </section>
      )}

      <section className="sports-card px-4 py-4 sm:px-5">
        <h3 className="text-[15px] font-bold tracking-tight">Season ranking</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Order by Copeland points (win = 1, even = 0.5, loss/unavailable = 0).
        </p>
        <ol className="mt-3 flex flex-col gap-3">
          {result.ranking.map((entry) => (
            <li
              key={entry.season}
              className="flex flex-col gap-1 border-b border-border/70 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-bold tracking-tight">
                  {entry.rank != null ? (
                    <span className="mr-2 text-muted-foreground">
                      #{entry.rank}
                    </span>
                  ) : (
                    <span className="mr-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <MetricHelp conceptId="not_eligible">
                        Not eligible
                      </MetricHelp>
                    </span>
                  )}
                  {entry.season}
                </p>
                <p className="text-[12px] tabular-nums text-muted-foreground">
                  {entry.eligible
                    ? formatPairwiseRecord(entry)
                    : entry.eligibilityNote ?? "Not eligible for ranking"}
                </p>
              </div>
              <CoverageLine entry={entry} />
              {entry.categoryWins.length ? (
                <p className="text-[12px] text-muted-foreground">
                  Most often stronger in: {entry.categoryWins.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="sports-card flex flex-col gap-2 px-4 py-4 sm:px-5">
        <h3 className="text-[15px] font-bold tracking-tight">
          {topSeason
            ? `Why is ${topSeason} #1?`
            : "Why the top season ranks first"}
        </h3>
        {result.topSeasonWhy.length ? (
          <ul className="flex flex-col gap-2">
            {result.topSeasonWhy.map((line) => (
              <li
                key={line}
                className="text-[14px] leading-relaxed text-muted-foreground"
              >
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">
            Not enough eligible seasons to explain a top ranking.
          </p>
        )}
        {ledger &&
        (ledger.wins.length || ledger.close.length || ledger.lost.length) ? (
          <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 text-[13px] sm:grid-cols-3">
            <div>
              <p className="font-semibold">Advantages</p>
              <p className="text-muted-foreground">
                {ledger.wins.length ? ledger.wins.join(", ") : "—"}
              </p>
            </div>
            <div>
              <p className="font-semibold">Close</p>
              <p className="text-muted-foreground">
                {ledger.close.length ? ledger.close.join(", ") : "—"}
              </p>
            </div>
            <div>
              <p className="font-semibold">Trailing</p>
              <p className="text-muted-foreground">
                {ledger.lost.length ? ledger.lost.join(", ") : "—"}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {topEvidence ? (
        <TeamSeasonEvidenceSection
          evidence={topEvidence}
          title={
            topSeason
              ? `See the evidence · ${topSeason}`
              : "See the evidence"
          }
          subtitle="Representative games that illustrate the #1 season’s scoreboard profile — not “most important” games. Each card opens Game Lab."
          highlightCategoryIds={evidenceHighlights}
        />
      ) : null}

      <section className="sports-card px-4 py-4 sm:px-5">
        <h3 className="text-[15px] font-bold tracking-tight">
          Head-to-head matrix
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Each cell is the <span className="font-semibold">row season</span>
          ’s overall result against the{" "}
          <span className="font-semibold">column season</span>. Click a cell for
          the full Team Season Compare.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
            <caption className="sr-only">
              Pairwise team-season comparison matrix.
            </caption>
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">
                  Row season
                </th>
                {seasons.map((s) => (
                  <th
                    key={s}
                    className="px-2 py-2 text-center font-semibold tabular-nums"
                    scope="col"
                  >
                    <span className="block text-[10px] font-medium text-muted-foreground">
                      vs
                    </span>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.matrix.map((row) => (
                <tr
                  key={row[0]?.rowSeason}
                  className="border-t border-border/70"
                >
                  <th
                    className="px-2 py-2 text-left font-semibold tabular-nums"
                    scope="row"
                  >
                    {row[0]?.rowSeason}
                  </th>
                  {row.map((cell) => (
                    <td
                      key={`${cell.rowSeason}-${cell.colSeason}`}
                      className="px-2 py-2 text-center"
                    >
                      {cell.href ? (
                        <Link
                          href={cell.href}
                          className={cn(
                            "font-semibold underline-offset-2 hover:underline",
                            cell.result === "win" && "text-foreground",
                            cell.result === "loss" && "text-muted-foreground",
                            cell.result === "even" && "text-muted-foreground"
                          )}
                        >
                          {MatrixCellLabel(cell.result)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {MatrixCellLabel(cell.result)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sports-card px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => setShowMethod((v) => !v)}
          className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          aria-expanded={showMethod}
        >
          How is this ranking calculated?
        </button>
        {showMethod ? (
          <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
            <p>
              Methodology v{result.methodology.version} ·{" "}
              {result.methodology.scope}
            </p>
            <p>{result.methodology.pairwiseRule}</p>
            <p>{result.methodology.rankingRule}</p>
            <p>{result.methodology.tieRule}</p>
            <p>{result.methodology.cycleRule}</p>
            <p>{result.methodology.qualificationNote}</p>
            <p>{result.methodology.setLimits}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
