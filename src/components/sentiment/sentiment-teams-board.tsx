import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  formatSentimentDate,
  LaneOriginTag,
  sentimentPct,
} from "@/components/sentiment/sentiment-source";
import { MoreInfo } from "@/components/ui/more-info";
import type { CuratedSentimentLane, TeamSentimentProfile } from "@/sentiment/curated-types";
import { ALL_TEAM_ABBRS, resolveTeamBrand } from "@/lib/nba-brand";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function LaneCell({ lane }: { lane?: CuratedSentimentLane }) {
  if (!lane) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="font-semibold tabular-nums">{sentimentPct(lane.score)}</span>
      <LaneOriginTag lane={{ origin: lane.origin, mentionVolume: lane.mentionVolume }} />
    </span>
  );
}

function topTopics(lane?: CuratedSentimentLane, limit = 2): string[] {
  if (!lane) return [];
  return Object.entries(lane.topicBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([topic]) => topic.replace(/_/g, " "));
}

export function SentimentTeamsBoard({ teams }: { teams: TeamSentimentProfile[] }) {
  const byEspnId = new Map<string, TeamSentimentProfile>();
  for (const team of teams) {
    const key = team.teamKey ?? team.teamIds[0];
    if (key) byEspnId.set(String(key), team);
  }
  const rows = ALL_TEAM_ABBRS.map((abbr) => {
    const brand = resolveTeamBrand(abbr);
    const espnId = brand?.espnTeamId ?? abbr;
    return { abbr: brand?.abbr ?? abbr, espnId, profile: byEspnId.get(espnId) };
  }).sort((a, b) => {
    const va = a.profile?.media?.score;
    const vb = b.profile?.media?.score;
    if (va == null && vb == null) return a.abbr.localeCompare(b.abbr);
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });
  const covered = rows.filter((row) => row.profile).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className={cn(type.bodySm, "font-bold")}>Team sentiment board</h2>
        <p className={cn(type.caption, "max-w-3xl text-muted-foreground")}>
          All 30 teams, sorted by media tone. {covered} have at least one lane. Blank means not
          enough coverage yet, not neutral.
        </p>
        <MoreInfo>
          <p>
            A team&apos;s media lane comes from headlines that name the team, and it needs 3 in the
            last 7 days. Curated fan lanes are rolled up from tracked players.
          </p>
        </MoreInfo>
      </div>
      <div className="sports-card overflow-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-border bg-secondary/90 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Team</th>
              <th className="px-3 py-2 text-right font-semibold">Fan</th>
              <th className="px-3 py-2 text-right font-semibold">Media</th>
              <th className="px-3 py-2 text-right font-semibold">Headlines</th>
              <th className="px-3 py-2 font-semibold">Top topics</th>
              <th className="px-3 py-2 font-semibold">Latest headline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ abbr, espnId, profile }) => {
              const latest = profile?.headlines?.[0];
              const headlineCount =
                profile?.media?.origin === "headlines" ? profile.media.mentionVolume : null;
              return (
                <tr key={abbr} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-3 py-2">
                    <Link
                      href={`/teams/${encodeURIComponent(espnId)}?tab=organization`}
                      className={cn("inline-flex items-center gap-2 font-semibold", textLinkClassName)}
                    >
                      <TeamLogo teamKey={espnId} size="xs" />
                      {abbr}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <LaneCell lane={profile?.fan} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <LaneCell lane={profile?.media} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {headlineCount ?? "—"}
                  </td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">
                    {topTopics(profile?.media ?? profile?.fan).join(", ") || "—"}
                  </td>
                  <td className="max-w-[22rem] px-3 py-2">
                    {latest ? (
                      <a
                        href={latest.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn("line-clamp-2", textLinkClassName)}
                      >
                        {latest.title}
                        <span className="text-muted-foreground">
                          {" "}
                          · {latest.outlet}, {formatSentimentDate(latest.publishedAt)}
                        </span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
