"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Crosshair,
  Gauge,
  Shield,
  Target,
  Trophy,
  Users,
} from "lucide-react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { CareerTeamTrendChartLazy as CareerTeamTrendChart } from "@/components/charts/recharts-lazy";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { TextLink } from "@/components/ui/text-link";
import { LukaShotMapView } from "@/components/internal/luka-shot-map";
import {
  LUKA_COHORT_RULE,
  type LukaBrefProfile,
  type LukaLedgerRow,
  type LukaPercentileRow,
  type LukaTab,
} from "@/data/queries/luka-bref-profile";
import type { LukaShotMap } from "@/data/queries/luka-shots";
import { type } from "@/lib/design-system";
import { formatNumber, formatOrdinal, formatPct } from "@/lib/format";
import { percentileSavantColor, SAVANT_LEGEND } from "@/lib/player-grade";
import { cn } from "@/lib/utils";

function savantMarkLeft(pct: number) {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  return `calc(12px + (100% - 24px) * ${t})`;
}

function hrefFor(
  profile: LukaBrefProfile,
  patch: Partial<{
    season: string;
    seasonType: string;
    team: string;
    rate: string;
    tab: string;
  }>
) {
  const q = new URLSearchParams({
    season: patch.season ?? profile.season,
    seasonType: patch.seasonType ?? profile.seasonType,
    team: patch.team ?? profile.team,
    rate: patch.rate ?? profile.rate,
    tab: patch.tab ?? profile.tab,
  });
  return `/internal/luka?${q.toString()}`;
}

function Cell({
  value,
  kind = "num",
  digits = 1,
}: {
  value: number | null;
  kind?: "num" | "pct";
  digits?: number;
}) {
  if (value == null) {
    return (
      <span
        className="text-muted-foreground"
        title="Not in Basketball-Reference table"
      >
        -
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {kind === "pct" ? formatPct(value, digits) : formatNumber(value, digits)}
    </span>
  );
}

function ContextChip({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: ReactNode;
}) {
  const nav = useQueryNavOptional();
  const router = useRouter();
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        if (nav) nav.replaceHref(href, { scroll: false });
        else router.replace(href);
      }}
      className={cn(
        type.caption,
        "rounded-md px-2.5 py-1 font-semibold",
        active
          ? "bg-foreground text-background"
          : "bg-secondary/70 text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ScaleLegend() {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-end gap-x-2 px-2">
      <span />
      <span className="relative mx-3 h-8" aria-hidden>
        {(
          [
            ["Poor", SAVANT_LEGEND.poor, 0],
            ["Average", SAVANT_LEGEND.average, 50],
            ["Great", SAVANT_LEGEND.great, 100],
          ] as const
        ).map(([label, color, pct]) => (
          <span
            key={label}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: savantMarkLeft(pct), color }}
          >
            <span
              className={cn(type.caption, "font-bold uppercase tracking-wide")}
            >
              {label}
            </span>
            <svg width="8" height="6" viewBox="0 0 8 6">
              <polygon points="4,6 0,0 8,0" fill="currentColor" />
            </svg>
          </span>
        ))}
      </span>
      <span />
    </div>
  );
}

function PercentileRow({ row }: { row: LukaPercentileRow }) {
  const pct = Math.max(0, Math.min(100, row.fillPercentile));
  const fill = percentileSavantColor(pct);
  return (
    <div className="grid w-full grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-x-2 whitespace-nowrap px-2 py-1.5">
      <span className={cn(type.bodySm, "text-right font-semibold")}>
        {row.label}
      </span>
      <span className="relative mx-3 flex h-7 min-w-0 items-center">
        {([0, 50, 100] as const).map((mark) => (
          <span
            key={mark}
            className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-foreground/25"
            style={{ left: savantMarkLeft(mark) }}
          />
        ))}
        <span
          className="absolute inset-y-[8px] rounded-full bg-foreground/[0.08]"
          style={{ left: 12, right: 12 }}
        />
        <span
          className="absolute inset-y-[8px] rounded-full"
          style={{
            left: 12,
            width: `calc((100% - 24px) * ${pct / 100})`,
            backgroundColor: fill,
          }}
        />
        <span
          className={cn(
            type.caption,
            "absolute top-1/2 z-[1] flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background font-bold tabular-nums"
          )}
          style={{ left: savantMarkLeft(pct) }}
        >
          {Math.round(row.percentile)}
        </span>
      </span>
      <span
        className={cn(type.bodySm, "text-right font-semibold tabular-nums")}
      >
        {row.display}
      </span>
    </div>
  );
}

const GROUP_ICON = {
  Scoring: Trophy,
  Shooting: Crosshair,
  Creation: Target,
  "Ball security": Shield,
  Rebounding: Users,
  Impact: Gauge,
} as const;

function AllStatsTable({ profile }: { profile: LukaBrefProfile }) {
  const nav = useQueryNavOptional();
  const [sortKey, setSortKey] = useState<keyof LukaLedgerRow>("season");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const rows = useMemo(() => {
    const copy = [...profile.ledger];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") {
        return dir === "asc"
          ? av.localeCompare(String(bv))
          : String(bv).localeCompare(av);
      }
      return dir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return copy;
  }, [dir, profile.ledger, sortKey]);

  function head(key: keyof LukaLedgerRow, label: string) {
    return (
      <th className="sticky top-0 z-[1] bg-background/80 px-2 py-2 text-right font-semibold backdrop-blur">
        <button
          type="button"
          className="tabular-nums"
          onClick={() => {
            if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSortKey(key);
              setDir("desc");
            }
          }}
        >
          {label}
        </button>
      </th>
    );
  }

  const countDigits = profile.rate === "totals" ? 0 : 1;

  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          type.caption,
          "w-full min-w-[56rem] border-separate border-spacing-0"
        )}
      >
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-[2] bg-background/80 px-2 py-2 text-left font-semibold backdrop-blur">
              Season
            </th>
            <th className="sticky left-[4.5rem] top-0 z-[2] bg-background/80 px-2 py-2 text-left font-semibold backdrop-blur">
              Team
            </th>
            {head("gamesPlayed", "GP")}
            {head("gamesStarted", "GS")}
            {head("minutes", profile.rate === "perGame" ? "MP/G" : "MP")}
            {head("points", `PTS ${profile.rateUnit}`)}
            {head("rebounds", `TRB ${profile.rateUnit}`)}
            {head("assists", `AST ${profile.rateUnit}`)}
            {head("fieldGoalPct", "FG%")}
            {head("threePointPct", "3P%")}
            {head("freeThrowPct", "FT%")}
            {head("effectiveFieldGoalPct", "eFG%")}
            {head("trueShootingPct", "TS%")}
            {head("usagePct", "USG%")}
            {head("turnoverPct", "TOV%")}
            {head("per", "PER")}
            {head("bpm", "BPM")}
            {head("vorp", "VORP")}
            {head("winShares", "WS")}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.season}-${row.teamAbbr}-${row.combined}`}
              className="cursor-pointer hover:bg-foreground/5"
              onClick={() =>
                nav?.replaceHref(
                  hrefFor(profile, {
                    season: row.season,
                    team: row.combined ? "TOT" : row.teamAbbr,
                    tab: "overview",
                  }),
                  { scroll: false }
                )
              }
            >
              <td className="sticky left-0 bg-background/80 px-2 py-1.5 font-semibold tabular-nums">
                {row.season}
              </td>
              <td
                className={cn(
                  "sticky left-[4.5rem] bg-background/80 px-2 py-1.5",
                  !row.combined && "pl-5 text-muted-foreground"
                )}
              >
                {row.teamAbbr}
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.gamesPlayed} digits={0} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.gamesStarted} digits={0} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.minutes} digits={countDigits} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.points} digits={countDigits} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.rebounds} digits={countDigits} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.assists} digits={countDigits} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.fieldGoalPct} kind="pct" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.threePointPct} kind="pct" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.freeThrowPct} kind="pct" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.effectiveFieldGoalPct} kind="pct" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.trueShootingPct} kind="pct" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.usagePct} kind="pct" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.turnoverPct} kind="pct" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.per} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.bpm} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.vorp} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Cell value={row.winShares} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewTrend({ profile }: { profile: LukaBrefProfile }) {
  const options = [
    { id: "pts" as const, label: "PTS / G", points: profile.trends.pts },
    { id: "ts" as const, label: "TS%", points: profile.trends.ts },
    { id: "usg" as const, label: "USG%", points: profile.trends.usg },
    { id: "bpm" as const, label: "BPM", points: profile.trends.bpm },
  ];
  const [metric, setMetric] = useState<(typeof options)[number]["id"]>("pts");
  const selected = options.find((o) => o.id === metric) ?? options[0]!;
  return (
    <GlassSurface effect="css" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={type.title}>Career trend · {selected.label}</h2>
        <div className="flex flex-wrap gap-1">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={metric === option.id}
              onClick={() => setMetric(option.id)}
              className={cn(
                type.caption,
                "rounded-md px-2.5 py-1 font-semibold",
                metric === option.id
                  ? "bg-foreground text-background"
                  : "bg-secondary/70 text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
        Combined regular-season rows only (one point per year). Axis labels are
        YY-YY.
      </p>
      <div className="mt-3">
        <CareerTeamTrendChart points={selected.points} height={200} />
      </div>
    </GlassSurface>
  );
}

export function LukaBrefProfileView({
  profile,
  shotMap,
}: {
  profile: LukaBrefProfile;
  shotMap?: LukaShotMap | null;
}) {
  const tabs: Array<{ id: LukaTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "trends", label: "Trends" },
    { id: "shooting", label: "Shooting" },
    { id: "all-stats", label: "All Stats" },
  ];
  const grouped = useMemo(() => {
    if (!profile.percentileRows) return [];
    const order = [
      "Scoring",
      "Shooting",
      "Creation",
      "Ball security",
      "Rebounding",
      "Impact",
    ];
    return order
      .map((group) => ({
        group,
        rows: profile.percentileRows!.filter((r) => r.group === group),
      }))
      .filter((g) => g.rows.length);
  }, [profile.percentileRows]);

  return (
    <div className="flex flex-col gap-4">
      <GlassSurface effect="css" className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <PlayerHeadshot
            playerId={profile.espnId}
            espnId={profile.espnId}
            nbaId={profile.nbaId}
            name={profile.displayName}
            size="xl"
            priority
          />
          <div className="min-w-0 flex-1">
            <h1 className={type.display}>{profile.displayName}</h1>
            {profile.bio.pronunciation ? (
              <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
                {profile.bio.pronunciation}
              </p>
            ) : null}
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Current
                </dt>
                <dd className={cn(type.bodySm, "font-semibold")}>
                  {profile.currentLine}
                </dd>
              </div>
              <div>
                <dt className={cn(type.caption, "text-muted-foreground")}>
                  Viewing
                </dt>
                <dd className={cn(type.bodySm, "font-semibold")}>
                  {profile.viewingLine}
                </dd>
              </div>
            </dl>
            <p className={cn(type.bodySm, "mt-3")}>
              {profile.bio.positionLine ?? profile.viewingPosition ?? "-"}
              {" · "}
              <span className="text-muted-foreground">Role (editorial):</span>{" "}
              Primary creator · Guard / wing assignment
            </p>
            <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
              {[
                profile.bio.heightLabel,
                profile.bio.weightLbs != null
                  ? `${profile.bio.weightLbs} lb`
                  : null,
                profile.viewingAge != null ? `Age ${profile.viewingAge}` : null,
                profile.bio.country ?? profile.bio.birthPlace,
                profile.bio.experienceLine,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {profile.bio.draftLine ? (
              <p className={cn(type.caption, "mt-2")}>
                Draft: {profile.bio.draftLine}.{" "}
                <span className="text-muted-foreground">
                  Annotation: rights traded to Dallas on draft night.
                </span>
              </p>
            ) : null}
            <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
              Source: Basketball-Reference · Scraped{" "}
              {new Date(profile.scrapedAt).toUTCString()} · ESPN {profile.espnId}{" "}
              / NBA {profile.nbaId} (same person)
            </p>
          </div>
        </div>
      </GlassSurface>

      <div className="sticky top-0 z-30 -mx-1 rounded-md bg-background/80 px-1 py-2 backdrop-blur">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {profile.seasons.map((season) => (
              <ContextChip
                key={season}
                active={profile.season === season}
                href={hrefFor(profile, { season })}
              >
                {season}
              </ContextChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <ContextChip
              active={profile.seasonType === "regular"}
              href={hrefFor(profile, { seasonType: "regular" })}
            >
              Regular
            </ContextChip>
            <ContextChip
              active={profile.seasonType === "playoffs"}
              href={hrefFor(profile, { seasonType: "playoffs" })}
            >
              Playoffs
            </ContextChip>
            {profile.teamOptions.map((team) => (
              <ContextChip
                key={team}
                active={profile.team === team}
                href={hrefFor(profile, { team })}
              >
                {team}
              </ContextChip>
            ))}
            {(
              [
                ["perGame", "Per game"],
                ["totals", "Totals"],
                ["per36", "Per 36"],
                ["per100", "Per 100"],
              ] as const
            ).map(([rate, label]) => (
              <ContextChip
                key={rate}
                active={profile.rate === rate}
                href={hrefFor(profile, { rate })}
              >
                {label}
              </ContextChip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <ContextChip
                key={tab.id}
                active={profile.tab === tab.id}
                href={hrefFor(profile, { tab: tab.id })}
              >
                {tab.label}
              </ContextChip>
            ))}
          </div>
        </div>
      </div>

      {profile.emptyPlayoffs ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          No Basketball-Reference playoff table for this season.
        </p>
      ) : null}

      {profile.tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {profile.hero.map((card) => (
              <GlassSurface key={card.key} effect="css" className="p-3">
                <p className={cn(type.caption, "text-muted-foreground")}>
                  {card.label}
                  {card.unit ? ` ${card.unit}` : ""}
                </p>
                <p className={cn(type.heading, "tabular-nums")}>{card.display}</p>
                <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
                  {card.percentilesOnStint
                    ? "Percentiles use combined-season rows"
                    : card.rank != null &&
                        card.cohortSize != null &&
                        card.percentile != null
                      ? `${formatOrdinal(Math.round(card.percentile))} · ${card.rank} of ${card.cohortSize}`
                      : "Rank unavailable"}
                </p>
                <p className={cn(type.caption, "text-muted-foreground")}>
                  {card.qualified ? "Qualified" : "Not qualified"}
                </p>
                {card.deltaDisplay ? (
                  <p className={cn(type.caption, "mt-1")}>
                    {card.deltaDisplay}
                  </p>
                ) : null}
                <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
                  {card.definition}
                </p>
              </GlassSurface>
            ))}
          </div>

          <GlassSurface effect="css" className="p-4">
            <h2 className={type.title}>Percentile profile</h2>
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              {LUKA_COHORT_RULE} Color is extra; the number is the percentile.
            </p>
            {profile.percentileBlockedReason ? (
              <p className={cn(type.bodySm, "mt-3 text-muted-foreground")}>
                {profile.percentileBlockedReason}
              </p>
            ) : (
              <div className="mt-3">
                <ScaleLegend />
                {grouped.map((section) => {
                  const Icon = GROUP_ICON[section.group as keyof typeof GROUP_ICON];
                  return (
                    <section key={section.group} className="mt-3">
                      <div className="mb-1 flex items-center gap-2 border-b-2 border-foreground/70 pb-1">
                        {Icon ? (
                          <Icon className="size-4" strokeWidth={2.25} />
                        ) : null}
                        <h3 className={cn(type.bodySm, "font-bold")}>
                          {section.group}
                        </h3>
                      </div>
                      {section.rows.map((row) => (
                        <div
                          key={row.id}
                          className="border-b border-dashed border-border/80 last:border-0"
                        >
                          <PercentileRow row={row} />
                          <p
                            className={cn(
                              type.caption,
                              "px-2 pb-1 text-right text-muted-foreground"
                            )}
                          >
                            {formatOrdinal(Math.round(row.percentile))}
                            {" · "}
                            {row.rank} of {row.cohortSize}
                            {row.lowerIsBetter ? " (lower TOV% is better)" : ""}
                          </p>
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            )}
          </GlassSurface>

          <OverviewTrend profile={profile} />
        </>
      ) : null}

      {profile.tab === "trends" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {(
            [
              ["PTS / G", profile.trends.pts],
              ["TS%", profile.trends.ts],
              ["USG%", profile.trends.usg],
              ["BPM", profile.trends.bpm],
            ] as const
          ).map(([title, points]) => (
            <GlassSurface key={title} effect="css" className="p-4">
              <h2 className={type.title}>{title}</h2>
              <CareerTeamTrendChart points={points} height={180} />
            </GlassSurface>
          ))}
        </div>
      ) : null}

      {profile.tab === "shooting" ? (
        shotMap ? (
          <LukaShotMapView map={shotMap} />
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Loading shot map…
          </p>
        )
      ) : null}

      {profile.tab === "all-stats" ? (
        <GlassSurface effect="css" className="p-4">
          <h2 className={type.title}>Season ledger</h2>
          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
            Stint rows sit under TOT and are not extra seasons. Counting stats
            follow the rate toggle; TS%, USG%, BPM, VORP, WS, PER stay on BRef
            Advanced. Export is not in this example. Click a row to view it on
            Overview.
          </p>
          <div className="mt-3">
            <AllStatsTable profile={profile} />
          </div>
        </GlassSurface>
      ) : null}

      <p className={cn(type.caption, "text-muted-foreground")}>
        Example only - does not replace the production player page.{" "}
        <TextLink href={`/players/${profile.espnId}`}>
          Open production profile
        </TextLink>
      </p>
    </div>
  );
}
