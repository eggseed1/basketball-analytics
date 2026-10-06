import Link from "next/link";

import leagueAverages from "@/data/runtime/league-season-averages.json";
import {
  getBundledBrefUsageRows,
  listBundledBrefSeasons,
} from "@/data/runtime/bref-advanced-snapshot";
import {
  PLAY_TYPE_LABELS,
  getLeagueShotZones,
  getPlayTypeSeasonRows,
} from "@/data/runtime/play-type-snapshot";
import { getRuntimeStandings, runtimeStandingsMeta } from "@/data/runtime/standings-snapshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { UsageEfficiencyChart } from "@/components/home/usage-efficiency-chart";
import { sectionLinkClassName, type } from "@/lib/design-system";
import {
  SHOT_ZONE_GROUPS,
  USAGE_MIN_MINUTES,
  buildPlayTypeMix,
  buildShotProfile,
  buildUsageEfficiency,
  pickTeamMap,
  priorSeason,
  type PlayTypeMixRow,
  type ShotProfileZone,
  type ShotZoneGroup,
  type ShotZoneTotals,
  type TeamMap,
  type UsagePoint,
} from "@/lib/season-glance";
import { cn } from "@/lib/utils";

const ZONE_COLORS: Record<ShotZoneGroup, string> = {
  rim: "#2f64d6",
  paint: "#8eaef0",
  mid: "#b8bdc7",
  corner3: "#f4a27e",
  above3: "#e4553f",
};

function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

function Tile({
  title,
  note,
  children,
  footer,
  href,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
  footer?: string;
  href?: string;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption>
        <h3 className="text-[14px] font-bold tracking-tight">
          {href ? (
            <Link href={href} className="hover:underline">
              {title} →
            </Link>
          ) : (
            title
          )}
        </h3>
        <p className="text-[12px] text-muted-foreground">{note}</p>
      </figcaption>
      {children}
      {footer ? <p className="text-[11px] text-muted-foreground">{footer}</p> : null}
    </figure>
  );
}

function TeamMapChart({ map }: { map: TeamMap }) {
  const ppg = map.teams.map((t) => t.ppg);
  const opp = map.teams.map((t) => t.oppPpg);
  // Headroom keeps edge logos clear of the frame and the corner labels.
  const xPad = (Math.max(...ppg) - Math.min(...ppg)) * 0.07 + 0.5;
  const yPad = (Math.max(...opp) - Math.min(...opp)) * 0.14 + 0.5;
  const xLo = Math.min(...ppg) - xPad;
  const xHi = Math.max(...ppg) + xPad;
  const yLo = Math.min(...opp) - yPad;
  const yHi = Math.max(...opp) + yPad;
  const left = (v: number) => ((v - xLo) / (xHi - xLo)) * 100;
  // Fewer points allowed sits higher, so the top right is the best corner.
  const top = (v: number) => ((v - yLo) / (yHi - yLo)) * 100;
  const avgOpp = opp.reduce((s, v) => s + v, 0) / opp.length;
  return (
    <Tile
      title={`Team map, ${map.season}`}
      note="Points scored against points allowed per game. Best teams sit top right."
      footer="Per game, not per possession, so fast teams drift right and down."
    >
      <div className="relative aspect-[4/3] w-full rounded-[10px] bg-foreground/[0.025] ring-1 ring-inset ring-foreground/[0.06]">
        <span aria-hidden className="absolute inset-y-2 w-px bg-border" style={{ left: `${left(map.leaguePpg)}%` }} />
        <span aria-hidden className="absolute inset-x-2 h-px bg-border" style={{ top: `${top(avgOpp)}%` }} />
        <span className="absolute right-2 top-1.5 text-[10px] font-semibold text-muted-foreground">Good both ways</span>
        <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-muted-foreground">Struggling both ways</span>
        {map.teams.map((t) => (
          <span
            key={t.teamId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${left(t.ppg)}%`, top: `${top(t.oppPpg)}%` }}
            title={`${t.name} ${t.wins}-${t.losses}: ${t.ppg.toFixed(1)} scored, ${t.oppPpg.toFixed(1)} allowed`}
          >
            <TeamLogo teamKey={t.abbr} size="xs" />
          </span>
        ))}
      </div>
    </Tile>
  );
}

function UsageChart({
  season,
  points,
  leagueTs,
}: {
  season: string;
  points: UsagePoint[];
  leagueTs: number | null;
}) {
  return (
    <Tile
      title={`Usage and efficiency, ${season}`}
      href={`/explore/players/visualizations?view=usage&season=${season}`}
      note={`Each dot is a player with ${USAGE_MIN_MINUTES.toLocaleString()}+ minutes, sized by minutes. Blue beats league true shooting. Hover a dot for the details.`}
    >
      <UsageEfficiencyChart points={points} leagueTs={leagueTs} />
    </Tile>
  );
}

function PlayTypes({ season, rows }: { season: string; rows: PlayTypeMixRow[] }) {
  const maxShare = Math.max(...rows.map((r) => r.share));
  const totalPoss = rows.reduce((s, r) => s + r.poss, 0);
  const avgPpp = rows.reduce((s, r) => s + r.ppp * r.poss, 0) / totalPoss;
  const byPpp = [...rows].sort((a, b) => b.ppp - a.ppp);
  const label = (r: PlayTypeMixRow) => (PLAY_TYPE_LABELS[r.key] ?? r.key).toLowerCase();
  return (
    <Tile
      title={`How teams score, ${season}`}
      note={`Share of tracked plays and points per play. Across all of them: ${avgPpp.toFixed(2)}.`}
      footer={`Blue bars beat the overall rate. ${label(byPpp[0]!).replace(/^./, (c) => c.toUpperCase())} scores best and ${label(byPpp[byPpp.length - 1]!)} least.`}
    >
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const above = r.ppp >= avgPpp;
          return (
            <li key={r.key} className="grid grid-cols-[7.5rem_1fr_2.5rem_2.25rem] items-center gap-2 text-[12px]">
              <span className="truncate">{PLAY_TYPE_LABELS[r.key] ?? r.key}</span>
              <span className="h-2 rounded-full bg-foreground/[0.06]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(r.share / maxShare) * 100}%`, background: above ? "#2f64d6" : "#9aa3b2" }}
                />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{pct(r.share)}</span>
              <span className={cn("text-right font-semibold tabular-nums", above ? "text-foreground" : "text-muted-foreground")}>
                {r.ppp.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

function ShotProfile({
  season,
  zones,
  prior,
}: {
  season: string;
  zones: ShotProfileZone[];
  prior: string | null;
}) {
  return (
    <Tile
      title={`Where shots come from, ${season}`}
      note={`Share of league field-goal attempts by zone${prior ? `, with the change from ${prior}` : ""}.`}
    >
      <div className="flex h-5 overflow-hidden rounded-[5px]">
        {zones.map((z) => (
          <span key={z.id} style={{ width: `${z.share * 100}%`, background: ZONE_COLORS[z.id] }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5 text-[12px]">
        {SHOT_ZONE_GROUPS.map((g) => {
          const z = zones.find((x) => x.id === g.id)!;
          const change = z.shareChange;
          return (
            <li key={g.id} className="grid grid-cols-[1fr_2.75rem_3.5rem_3.75rem] items-center gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: ZONE_COLORS[g.id] }} />
                <span className="truncate">{g.label}</span>
              </span>
              <span className="text-right font-semibold tabular-nums">{pct(z.share)}</span>
              <span
                className={cn(
                  "text-right tabular-nums",
                  change == null || Math.abs(change) < 0.05
                    ? "text-muted-foreground"
                    : change > 0
                      ? "text-[#1f8a5b] dark:text-[#5fd39b]"
                      : "text-[#c2410c] dark:text-[#fb923c]"
                )}
              >
                {change == null
                  ? "—"
                  : Math.abs(change) < 0.05
                    ? "0.0"
                    : `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}`}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{pct(z.fgPct)} FG</span>
            </li>
          );
        })}
      </ul>
      {prior ? (
        <p className="text-[11px] text-muted-foreground">Change is in percentage points of all shots.</p>
      ) : null}
    </Tile>
  );
}

/** First season at or before `anchor` (newest first) that `has` accepts. */
function newestWith(anchor: string, seasons: string[], has: (s: string) => boolean): string | null {
  return [...seasons].sort().reverse().find((s) => s <= anchor && has(s)) ?? null;
}

/** League-wide views of one season, under the fan sentiment board. */
export function SeasonGlancePanel() {
  const map = pickTeamMap(
    runtimeStandingsMeta().seasons.flatMap((season) => {
      const st = getRuntimeStandings(season);
      return st ? [{ season, rows: st.conferences.flatMap((c) => c.rows) }] : [];
    })
  );
  const brefSeasons = listBundledBrefSeasons();
  const anchor = map?.season ?? [...brefSeasons].sort().reverse()[0] ?? null;
  if (!anchor) return null;

  const usageSeason = newestWith(anchor, brefSeasons, (s) => buildUsageEfficiency(getBundledBrefUsageRows(s)).length >= 20);
  const usage = usageSeason ? buildUsageEfficiency(getBundledBrefUsageRows(usageSeason)) : [];
  const averages = (leagueAverages as unknown as { seasons: Record<string, { tsPct?: number }> }).seasons;
  const leagueTs = usageSeason ? averages[usageSeason]?.tsPct ?? null : null;

  const playSeason = getPlayTypeSeasonRows(anchor) ? anchor : priorSeason(anchor);
  const playData = playSeason ? getPlayTypeSeasonRows(playSeason) : null;
  const playRows = playData ? buildPlayTypeMix(playData.rows, playData.playTypes) : [];

  const zoneSeason = getLeagueShotZones(anchor) ? anchor : priorSeason(anchor);
  const zoneNow = zoneSeason ? getLeagueShotZones(zoneSeason) : null;
  const zonePriorSeason = zoneSeason ? priorSeason(zoneSeason) : null;
  const zonePrior = zonePriorSeason ? getLeagueShotZones(zonePriorSeason) : null;
  const zones = zoneNow
    ? buildShotProfile(zoneNow as unknown as ShotZoneTotals, zonePrior as unknown as ShotZoneTotals | null)
    : [];

  if (!map && usage.length === 0 && playRows.length === 0 && zones.length === 0) return null;

  return (
    <section className="sports-card flex flex-col gap-5 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={type.heading}>{anchor} at a glance</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            League-wide views of one season. Each moves to the new season once there are enough games to read.
          </p>
        </div>
        <Link href="/explore/players/visualizations" className={cn(type.bodySm, sectionLinkClassName)}>
          All visualizations →
        </Link>
      </div>
      <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
        {map ? <TeamMapChart map={map} /> : null}
        {usage.length && usageSeason ? <UsageChart season={usageSeason} points={usage} leagueTs={leagueTs} /> : null}
        {playRows.length && playSeason ? <PlayTypes season={playSeason} rows={playRows} /> : null}
        {zones.length && zoneSeason ? (
          <ShotProfile season={zoneSeason} zones={zones} prior={zonePrior ? zonePriorSeason : null} />
        ) : null}
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Standings from ESPN, advanced stats from Basketball Reference, play types and shot zones from NBA.com.
      </p>
    </section>
  );
}
