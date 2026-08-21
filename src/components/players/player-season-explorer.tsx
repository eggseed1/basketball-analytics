import Link from "next/link";

import {
  careerProductionIndex,
  formatCpi,
  isCareerQualifyingSeason,
  seasonComparePath,
  seasonRankPath,
} from "@/analytics";
import { TeamLogo } from "@/components/brand/team-logo";
import type { PlayerSeason } from "@/data/types";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

import { askDrblHref } from "./player-ask-links";

/**
 * Compact career season surface - high-value fields + Compare / Rank / Ask.
 * Not a replacement for Season depth or Rank My Seasons methodology.
 */
export function PlayerSeasonExplorer({
  playerId,
  playerName,
  seasons,
  viewingSeason,
  peakSeason,
  rankDefaults,
}: {
  playerId: string;
  playerName: string;
  /** One primary row per season (already deduped preferred). */
  seasons: PlayerSeason[];
  viewingSeason: string;
  peakSeason?: string | null;
  /** Seasons used when ranking from a single row. */
  rankDefaults: string[];
}) {
  if (seasons.length === 0) {
    return (
      <p className="text-[14px] text-muted-foreground">
        No career seasons available to explore.
      </p>
    );
  }

  const chrono = [...seasons].sort((a, b) => b.season.localeCompare(a.season));
  const preview = chrono.slice(0, 8);
  const rest = chrono.slice(8);

  return (
    <div className="flex flex-col gap-2">
      <SeasonList
        rows={preview}
        playerId={playerId}
        playerName={playerName}
        viewingSeason={viewingSeason}
        peakSeason={peakSeason}
        rankDefaults={rankDefaults}
        allChrono={chrono}
      />
      {rest.length ? (
        <details className="group">
          <summary className="cursor-pointer list-none py-1 text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Show {rest.length} earlier seasons →
            </span>
            <span className="hidden group-open:inline">Hide earlier seasons</span>
          </summary>
          <div className="mt-2">
            <SeasonList
              rows={rest}
              playerId={playerId}
              playerName={playerName}
              viewingSeason={viewingSeason}
              peakSeason={peakSeason}
              rankDefaults={rankDefaults}
              allChrono={chrono}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function SeasonList({
  rows,
  playerId,
  playerName,
  viewingSeason,
  peakSeason,
  rankDefaults,
  allChrono,
}: {
  rows: PlayerSeason[];
  playerId: string;
  playerName: string;
  viewingSeason: string;
  peakSeason?: string | null;
  rankDefaults: string[];
  allChrono: PlayerSeason[];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const brand = resolveTeamBrand(row.teamId);
        const qualifies = isCareerQualifyingSeason(row);
        const cpi = qualifies ? careerProductionIndex(row) : null;
        const usg =
          row.usagePct != null &&
          Number.isFinite(row.usagePct) &&
          row.usagePct > 0
            ? row.usagePct
            : null;
        const isViewing = row.season === viewingSeason;
        const compareOther =
          peakSeason && peakSeason !== row.season
            ? peakSeason
            : allChrono.find((s) => s.season !== row.season)?.season;
        const rankSet = uniqueSeasons([
          row.season,
          ...(rankDefaults.includes(row.season)
            ? rankDefaults
            : [row.season, ...rankDefaults]),
        ]).slice(0, 5);

        return (
          <li
            key={`${row.season}-${row.teamId}`}
            className={cn(
              "rounded-xl border border-border bg-white/45 px-3 py-3 sm:px-4",
              isViewing && "ring-1 ring-foreground/20"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <TeamLogo teamKey={row.teamId} size="2xs" />
                <div className="min-w-0">
                  <p className="text-[16px] font-bold tracking-tight">
                    <Link
                      href={`/players/${playerId}?season=${encodeURIComponent(row.season)}`}
                      scroll={false}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.season}
                    </Link>
                    {isViewing ? (
                      <span className="ml-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Viewing
                      </span>
                    ) : null}
                    {row.season === peakSeason ? (
                      <span className="ml-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Peak
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {brand?.abbr ?? row.teamName}
                    {!qualifies ? " · Below resume qualification" : null}
                  </p>
                </div>
              </div>
              <Link
                href={`/players/${playerId}?season=${encodeURIComponent(row.season)}`}
                scroll={false}
                className="rounded-md bg-secondary px-2.5 py-1 text-[12px] font-semibold"
              >
                View season
              </Link>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Mini label="CPI" value={cpi != null ? formatCpi(cpi) : "-"} />
              <Mini
                label="TS%"
                value={
                  row.trueShootingPct != null && row.trueShootingPct > 0
                    ? formatPct(row.trueShootingPct)
                    : "-"
                }
              />
              <Mini label="USG%" value={usg != null ? formatPct(usg) : "-"} />
              <Mini label="GP" value={formatNumber(row.gamesPlayed)} />
              <Mini label="MIN" value={formatMinutes(row.minutes)} />
            </dl>

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold">
              {compareOther ? (
                <Link
                  href={seasonComparePath(playerId, row.season, compareOther)}
                  className="underline-offset-2 hover:underline"
                >
                  Compare
                </Link>
              ) : null}
              {rankSet.length >= 2 ? (
                <Link
                  href={seasonRankPath(playerId, rankSet)}
                  className="underline-offset-2 hover:underline"
                >
                  Rank
                </Link>
              ) : null}
              <Link
                href={askDrblHref(
                  `${playerName} true shooting ${row.season}`,
                  playerId
                )}
                className="underline-offset-2 hover:underline"
              >
                Ask DRBL
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[14px] font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function uniqueSeasons(seasons: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of seasons) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
