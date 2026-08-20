import Link from "next/link";

import type { TeamArcModel } from "@/lib/team-arc";
import {
  teamArcEvidenceHref,
  teamArcFullHref,
  teamArcGamesHref,
  teamArcSeasonHref,
} from "@/lib/team-arc";
import { teamComparePath } from "@/analytics/compare-team-seasons";
import { teamSeasonRankPath } from "@/analytics/rank-team-seasons";
import { askDrblTeamHref } from "@/components/teams/team-ask-links";
import { cn } from "@/lib/utils";

export function TeamArcSection({
  arc,
  teamRouteKey,
  teamId,
  teamName,
  viewingSeason,
  teamEspnId,
}: {
  arc: TeamArcModel;
  /** URL segment for /teams/[teamId] */
  teamRouteKey: string;
  teamId: string;
  teamName: string;
  viewingSeason: string;
  /** Canonical ESPN id for ASK deep links. */
  teamEspnId: string;
}) {
  const rankSeasons = arc.rows
    .map((r) => r.season)
    .slice(0, 6)
    .sort((a, b) => a.localeCompare(b));
  const rankHref =
    rankSeasons.length >= 2
      ? teamSeasonRankPath(teamEspnId, rankSeasons)
      : `/compare?mode=teams&view=rank&teamId=${encodeURIComponent(teamEspnId)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">{arc.label}</h2>
          <p className="text-[14px] text-muted-foreground">
            How this team got here - season board history, not asset genealogy.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] font-semibold">
          {arc.hasMoreHistory || arc.showingFull ? (
            <Link
              href={teamArcFullHref(
                teamRouteKey,
                viewingSeason,
                !arc.showingFull
              )}
              className="underline-offset-2 hover:underline"
            >
              {arc.showingFull ? "Show recent window →" : "Show full history →"}
            </Link>
          ) : null}
          <Link
            href={rankHref}
            className="underline-offset-2 hover:underline"
          >
            Rank this team&apos;s seasons →
          </Link>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">{arc.coverageNote}</p>
      <p className="text-[12px] text-muted-foreground">{arc.continuityNote}</p>

      {arc.transitions.length ? (
        <div>
          <h3 className="text-[14px] font-bold tracking-tight">
            Biggest team changes
          </h3>
          <p className="mb-2 text-[12px] text-muted-foreground">
            Same noise floors as analyzeTeamProfile - not a second trend
            methodology.
          </p>
          <ul className="flex flex-col gap-2">
            {arc.transitions.map((t) => (
              <li
                key={`${t.fromSeason}-${t.toSeason}`}
                className="rounded-xl border border-border bg-white/45 px-3 py-2.5"
              >
                <p className="text-[14px] font-semibold">
                  {t.fromSeason} → {t.toSeason}
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {t.changes.map((c) => (
                    <li
                      key={c.id}
                      className="flex justify-between gap-2 text-[12px]"
                    >
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="font-bold tabular-nums">
                        {c.deltaDisplay}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[14px] text-muted-foreground">
          No multi-season deltas cleared the documented noise filter in this
          window.
        </p>
      )}

      {arc.rows.length === 0 ? (
        <p className="text-[14px] text-muted-foreground">
          No team-season rows available for this arc window.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white/40">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="border-b border-border bg-white/50 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Season</th>
                <th className="px-2 py-2 text-right">Diff</th>
                <th className="px-2 py-2 text-right">TS%</th>
                <th className="px-2 py-2 text-right">eFG%</th>
                <th className="px-2 py-2 text-right">Off</th>
                <th className="px-2 py-2 text-right">Def</th>
                <th className="px-3 py-2 text-right">Explore</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {arc.rows.map((row) => {
                const viewing = row.season === viewingSeason;
                return (
                  <tr
                    key={row.season}
                    className={cn(
                      "hover:bg-white/55",
                      viewing && "bg-secondary/40"
                    )}
                  >
                    <td className="px-3 py-2 font-semibold">
                      <Link
                        href={teamArcSeasonHref(teamRouteKey, row.season)}
                        scroll={false}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.season}
                      </Link>
                      {row.thin ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-muted-foreground">
                          Thin
                        </span>
                      ) : null}
                      {viewing ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-muted-foreground">
                          Viewing
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.avgDiffDisplay}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.tsDisplay}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.efgDisplay}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.ppgDisplay}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {row.oppPpgDisplay}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] font-semibold">
                      <Link
                        href={teamArcSeasonHref(teamRouteKey, row.season)}
                        scroll={false}
                        className="underline-offset-2 hover:underline"
                      >
                        Season
                      </Link>
                      {row.season !== viewingSeason ? (
                        <>
                          <span className="mx-1 text-muted-foreground">·</span>
                          <Link
                            href={teamComparePath({
                              teamA: teamEspnId,
                              teamB: teamEspnId,
                              seasonA: viewingSeason,
                              seasonB: row.season,
                            })}
                            className="underline-offset-2 hover:underline"
                          >
                            Compare
                          </Link>
                        </>
                      ) : null}
                      <span className="mx-1 text-muted-foreground">·</span>
                      <Link
                        href={teamArcEvidenceHref(teamRouteKey, row.season)}
                        className="underline-offset-2 hover:underline"
                      >
                        Evidence
                      </Link>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <Link
                        href={teamArcGamesHref(teamId, row.season)}
                        className="underline-offset-2 hover:underline"
                      >
                        Games
                      </Link>
                      <span className="mx-1 text-muted-foreground">·</span>
                      <Link
                        href={askDrblTeamHref(
                          `${teamName} true shooting ${row.season}`,
                          teamEspnId
                        )}
                        className="underline-offset-2 hover:underline"
                      >
                        Ask
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] text-muted-foreground">
        Off = team PPG · Def = opponent PPG. Missing cells are unavailable, not
        zero. Roster for a year lives under Who drives it after you select the
        season.
      </p>
    </div>
  );
}
