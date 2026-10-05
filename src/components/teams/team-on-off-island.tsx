import { TeamOnOffPanel, type TeamOnOffViewData } from "@/components/teams/team-on-off-panel";
import { TransitionLink } from "@/components/continuity/query-nav";
import { getOnOffSeasons, getTeamOnOffData, type TeamOnOffData } from "@/data/queries/on-off";
import { lineupRows, teamPlayerRows, wowy, type WowyStates } from "@/lib/on-off/derive";
import type { OnOffView } from "@/lib/on-off/metrics";
import { type } from "@/lib/design-system";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const LINEUP_LIMIT = 20;

function viewData({ file, league }: TeamOnOffData, view: OnOffView): TeamOnOffViewData {
  const rows = teamPlayerRows(file, league, view).sort((a, b) => b.poss - a.poss);
  const pairs: Record<string, WowyStates> = {};
  for (const p of file.pairs) {
    const states = wowy(file, league, p.a, p.b, view);
    if (states) pairs[`${p.a}|${p.b}`] = states;
  }
  return { rows, lineups: lineupRows(file, league, view).slice(0, LINEUP_LIMIT), pairs };
}

export async function TeamOnOffIsland({
  teamId,
  season,
  teamKey,
}: {
  teamId: string;
  season: string;
  teamKey: string;
}) {
  const data = await getTeamOnOffData(teamKey, season);
  if (!data) {
    const seasons = await getOnOffSeasons();
    return (
      <section id="onoff" className="scroll-mt-16 flex flex-col gap-3" aria-label="On/off">
        <h2 className="text-[20px] font-bold tracking-tight">On/off</h2>
        <p className={cn(type.bodySm, "max-w-prose text-muted-foreground")}>
          Possession-level on/off isn&apos;t built for {season}. It needs every game&apos;s
          play-by-play, so it starts once regular-season games are in.
        </p>
        {seasons.length ? (
          <p className={cn(type.bodySm, "flex flex-wrap gap-x-3 gap-y-1")}>
            <span className="text-muted-foreground">Available:</span>
            {seasons.map((s) => (
              <TransitionLink key={s} href={teamPageHref(teamId, { season: s, tab: "onoff" })}>
                {s}
              </TransitionLink>
            ))}
          </p>
        ) : null}
      </section>
    );
  }

  const pairPlayerIds = new Set(data.file.pairs.flatMap((p) => [p.a, p.b]));
  return (
    <TeamOnOffPanel
      season={season}
      teamAbbr={data.file.teamAbbr}
      games={data.file.games}
      pairPlayerIds={[...pairPlayerIds]}
      views={{ clean: viewData(data, "clean"), all: viewData(data, "all") }}
    />
  );
}
