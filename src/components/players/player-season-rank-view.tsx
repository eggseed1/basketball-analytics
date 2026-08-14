"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type {
  PlayerSeasonRanking,
  SeasonRankEntry,
} from "@/analytics/rank-player-seasons";
import {
  PLAYER_SEASON_RANK_MAX,
  PLAYER_SEASON_RANK_MIN,
  seasonComparePath,
  seasonRankPath,
} from "@/analytics";
import { cn } from "@/lib/utils";

function CoverageLine({ entry }: { entry: SeasonRankEntry }) {
  const c = entry.coverage;
  const bits = [
    ["Production", c.production],
    ["Efficiency", c.efficiency],
    ["Impact", c.historicalImpact],
    ["Team context", c.teamContext],
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

/** Row season’s result when compared against the column season. */
function MatrixCellLabel(result: string): string {
  switch (result) {
    case "win":
      return "Beats";
    case "loss":
      return "Loses";
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

function formatPairwiseRecord(entry: SeasonRankEntry): string {
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

export function SeasonRankPicker({
  playerId,
  careerSeasons,
  selected,
}: {
  playerId: string;
  careerSeasons: string[];
  selected: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string[]>(selected);

  const sortedCareer = useMemo(
    () => [...careerSeasons].sort((a, b) => b.localeCompare(a)),
    [careerSeasons]
  );

  function toggle(season: string) {
    setPicked((prev) => {
      if (prev.includes(season)) return prev.filter((s) => s !== season);
      if (prev.length >= PLAYER_SEASON_RANK_MAX) return prev;
      return [...prev, season].sort((a, b) => a.localeCompare(b));
    });
  }

  function go() {
    if (picked.length < PLAYER_SEASON_RANK_MIN) return;
    startTransition(() => {
      router.push(seasonRankPath(playerId, picked));
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
            Pick {PLAYER_SEASON_RANK_MIN}–{PLAYER_SEASON_RANK_MAX} regular-season
            years ({picked.length} selected).
          </p>
        </div>
        <button
          type="button"
          onClick={go}
          disabled={pending || picked.length < PLAYER_SEASON_RANK_MIN}
          className="rounded-md bg-foreground px-4 py-2 text-[13px] font-bold text-background disabled:opacity-50"
        >
          {pending ? "Ranking…" : "Rank seasons"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sortedCareer.map((season) => {
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

export function PlayerSeasonRankView({
  result,
}: {
  result: PlayerSeasonRanking;
}) {
  const [showMethod, setShowMethod] = useState(false);
  const seasons = result.seasons;
  const topSeason =
    result.ranking.find((e) => e.eligible && e.rank === 1)?.season ??
    result.ranking.find((e) => e.eligible)?.season;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Rank my seasons · Regular season
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          <Link
            href={`/players/${result.playerId}`}
            className="underline-offset-2 hover:underline"
          >
            {result.playerName}
          </Link>
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Each selected season is compared head-to-head with every other; seasons
          earn Copeland points from those matchups. This is not a single
          universal “best season” score.
        </p>
      </header>

      {(result.contested || result.closeTop) && (
        <section className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-[13px] text-muted-foreground">
          {result.closeTopNote ? <p>{result.closeTopNote}</p> : null}
          {result.contestedNote ? (
            <p className={result.closeTopNote ? "mt-1" : undefined}>
              {result.contestedNote}
            </p>
          ) : null}
        </section>
      )}

      <section className="sports-card px-4 py-4 sm:px-5">
        <h2 className="text-[15px] font-bold tracking-tight">
          Season ranking
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Order by Copeland points from head-to-head season comparisons (win =
          1, even = 0.5).
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
                      Unranked
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
        <h2 className="text-[15px] font-bold tracking-tight">
          {topSeason
            ? `Why ${topSeason} ranks first`
            : "Why the top season ranks first"}
        </h2>
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
      </section>

      <section className="sports-card px-4 py-4 sm:px-5">
        <h2 className="text-[15px] font-bold tracking-tight">
          Head-to-head results
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Each cell is the <span className="font-semibold">row season</span>
          ’s overall result against the{" "}
          <span className="font-semibold">column season</span>. Click a cell for
          the full two-season breakdown.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
            <caption className="sr-only">
              Pairwise season comparison matrix. Rows are the season being
              evaluated; columns are the opponent season.
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
                <tr key={row[0]?.rowSeason} className="border-t border-border/70">
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
                      title={
                        cell.result === "self"
                          ? "Same season"
                          : `${cell.rowSeason} vs ${cell.colSeason}: ${MatrixCellLabel(cell.result)}`
                      }
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
        <h2 className="text-[15px] font-bold tracking-tight">
          Open any two-season comparison
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Same engine as the matrix — overall edge is which season won more
          category comparisons.
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
          {result.pairwise.map((p) => (
            <li key={`${p.seasonA}-${p.seasonB}`}>
              <Link
                href={p.href}
                className="font-semibold underline-offset-2 hover:underline"
              >
                {p.seasonA} vs {p.seasonB}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {p.overallEdge === "a"
                  ? `${p.seasonA} stronger overall`
                  : p.overallEdge === "b"
                    ? `${p.seasonB} stronger overall`
                    : p.overallEdge === "even"
                      ? "essentially even overall"
                      : "insufficient data for overall edge"}
              </span>
            </li>
          ))}
        </ul>
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
            <p>Methodology v{result.methodology.version} · {result.methodology.scope}</p>
            <p>{result.methodology.pairwiseRule}</p>
            <p>{result.methodology.rankingRule}</p>
            <p>{result.methodology.tieRule}</p>
            <p>{result.methodology.cycleRule}</p>
            <p>{result.methodology.impactRule}</p>
            <p>{result.methodology.cpiNote}</p>
            <p>{result.methodology.setLimits}</p>
            <p>
              Production appendix (CPI only, not the ranking):{" "}
              {result.productionAppendix
                .map((r) => `${r.season} ${r.cpi.toFixed(1)}`)
                .join(" · ")}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Compact player-page entry for ranking + two-season compare. */
export function PlayerSeasonAnalysisControl({
  playerId,
  seasons,
  defaultA,
  defaultB,
  defaultRankSeasons,
}: {
  playerId: string;
  seasons: string[];
  defaultA?: string;
  defaultB?: string;
  defaultRankSeasons?: string[];
}) {
  if (seasons.length < 2) return null;
  const rankSeasons =
    defaultRankSeasons && defaultRankSeasons.length >= 2
      ? defaultRankSeasons
      : seasons.slice(0, 4);
  const twoHref =
    defaultA && defaultB && defaultA !== defaultB
      ? seasonComparePath(playerId, defaultA, defaultB)
      : `/players/${playerId}/season-compare`;

  return (
    <div className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Season analysis</h2>
        <p className="text-[13px] text-muted-foreground">
          Compare two seasons, or rank a selected set — without a fake universal
          score.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={twoHref}
          className="rounded-md bg-secondary px-3 py-1.5 text-[13px] font-semibold"
        >
          Compare two seasons
        </Link>
        <Link
          href={seasonRankPath(playerId, rankSeasons)}
          className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background"
        >
          Rank my seasons
        </Link>
      </div>
    </div>
  );
}
