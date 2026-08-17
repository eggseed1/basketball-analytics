"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  PlayerSeasonComparison,
  SeasonCompareEdge,
  SeasonMetricRow,
} from "@/analytics/compare-player-seasons";
import { edgeLabel } from "@/analytics/compare-player-seasons";
import { ComparisonDimensionRow } from "@/components/compare/player-compare-view";
import { PlayerIdentity } from "@/components/players/player-identity";
import { cn } from "@/lib/utils";

function CoverageDots({
  label,
  coverage,
}: {
  label: string;
  coverage: PlayerSeasonComparison["coverage"]["a"];
}) {
  const items: Array<[string, boolean]> = [
    ["Production", coverage.production],
    ["Efficiency", coverage.efficiency],
    ["Impact", coverage.historicalImpact],
    ["Team", coverage.teamContext],
  ];
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] font-semibold">
        {label}
        {coverage.incomplete ? (
          <span className="ml-2 font-normal text-muted-foreground">
            · in progress
          </span>
        ) : null}
        {!coverage.qualifying ? (
          <span className="ml-2 font-normal text-muted-foreground">
            · insufficient sample
          </span>
        ) : null}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        {items.map(([name, ok]) => (
          <li key={name}>
            <span className={ok ? "text-foreground" : ""}>
              {ok ? "✓" : "—"} {name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EdgeBadge({
  edge,
  seasonA,
  seasonB,
}: {
  edge: SeasonCompareEdge;
  seasonA: string;
  seasonB: string;
}) {
  const text = edgeLabel(edge, seasonA, seasonB);
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums",
        edge === "even" || edge === "unavailable"
          ? "bg-secondary text-muted-foreground"
          : "bg-foreground text-background"
      )}
    >
      {text}
    </span>
  );
}

function CategoryBlock({
  title,
  rows,
  seasonA,
  seasonB,
  edge,
}: {
  title: string;
  rows: SeasonMetricRow[];
  seasonA: string;
  seasonB: string;
  edge: SeasonCompareEdge;
}) {
  if (!rows.length) return null;
  return (
    <section className="sports-card px-4 py-3 sm:px-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
        <EdgeBadge edge={edge} seasonA={seasonA} seasonB={seasonB} />
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Left = {seasonA} · Right = {seasonB} · badge = category winner
      </p>
      {rows.map((d) => (
        <ComparisonDimensionRow
          key={d.id}
          dimension={d}
          aName={seasonA}
          bName={seasonB}
          evenThreshold={0.0001}
          edgeDisplay={
            d.edge === "a"
              ? `${seasonA} stronger`
              : d.edge === "b"
                ? `${seasonB} stronger`
                : d.edge === "even"
                  ? "Even"
                  : "Unavailable"
          }
        />
      ))}
    </section>
  );
}

export function SeasonComparePicker({
  playerId,
  seasons,
  seasonA,
  seasonB,
}: {
  playerId: string;
  seasons: string[];
  seasonA?: string;
  seasonB?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [a, setA] = useState(seasonA ?? seasons[seasons.length - 1] ?? "");
  const [b, setB] = useState(
    seasonB ?? seasons[Math.max(0, seasons.length - 2)] ?? ""
  );

  function go() {
    if (!a || !b || a === b) return;
    startTransition(() => {
      router.push(
        `/players/${playerId}/season-compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
      );
    });
  }

  if (seasons.length < 2) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Need at least two career seasons to compare.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
        First season
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
          value={a}
          onChange={(e) => setA(e.target.value)}
        >
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <span className="pb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
        vs
      </span>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
        Second season
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold text-foreground"
          value={b}
          onChange={(e) => setB(e.target.value)}
        >
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={go}
        disabled={pending || !a || !b || a === b}
        className="rounded-md bg-foreground px-4 py-2 text-[13px] font-bold text-background disabled:opacity-50"
      >
        {pending ? "Loading…" : "Compare"}
      </button>
    </div>
  );
}

export function PlayerSeasonCompareView({
  result,
}: {
  result: PlayerSeasonComparison;
}) {
  const [showMethod, setShowMethod] = useState(false);
  const { seasonA, seasonB } = result;

  const byCategory = (id: string) =>
    result.metrics.filter((m) => m.category === id);

  const categoryEdge = (id: string): SeasonCompareEdge =>
    result.categories.find((c) => c.id === id)?.edge ?? "unavailable";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Best season lab · Regular season
        </p>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          <PlayerIdentity
            playerId={result.playerId}
            name={result.playerName}
            nameClassName="text-[28px] font-bold tracking-tight sm:text-[32px] no-underline hover:underline"
          >
            <span>{result.playerName}</span>
          </PlayerIdentity>
        </h1>
        <p className="text-[20px] font-bold tracking-tight">
          {seasonA}{" "}
          <span className="text-muted-foreground">vs</span> {seasonB}
        </p>
      </header>

      <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold tracking-tight">
            Overall verdict
          </h2>
          <EdgeBadge
            edge={result.overall.edge}
            seasonA={seasonA}
            seasonB={seasonB}
          />
        </div>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          {result.overall.reason}
        </p>
        {result.insufficientReason ? (
          <p className="text-[12px] text-muted-foreground">
            {result.insufficientReason}
          </p>
        ) : null}
        <p className="text-[12px] text-muted-foreground">
          There is no single universal “best season” score — overall is which
          season wins more category groups (production, efficiency, etc.) from
          the metrics below.
        </p>
      </section>

      <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
        <h2 className="text-[15px] font-bold tracking-tight">
          What data each season has
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Categories marked unavailable are skipped in that season’s edge.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CoverageDots label={seasonA} coverage={result.coverage.a} />
          <CoverageDots label={seasonB} coverage={result.coverage.b} />
        </div>
      </section>

      <CategoryBlock
        title="Production"
        rows={byCategory("production")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("production")}
      />
      <CategoryBlock
        title="Efficiency"
        rows={byCategory("efficiency")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("efficiency")}
      />
      <CategoryBlock
        title="Shooting"
        rows={byCategory("shooting")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("shooting")}
      />
      <CategoryBlock
        title="Offense"
        rows={byCategory("offense")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("offense")}
      />
      <CategoryBlock
        title="Defense"
        rows={byCategory("defense")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("defense")}
      />
      <CategoryBlock
        title="Playmaking"
        rows={byCategory("playmaking")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("playmaking")}
      />
      <CategoryBlock
        title="Rebounding"
        rows={byCategory("rebounding")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("rebounding")}
      />
      <CategoryBlock
        title="Role"
        rows={byCategory("role")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("role")}
      />
      <CategoryBlock
        title="Availability"
        rows={byCategory("availability")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("availability")}
      />
      <CategoryBlock
        title="Impact"
        rows={byCategory("impact")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("impact")}
      />
      <CategoryBlock
        title="Team context"
        rows={byCategory("team_context")}
        seasonA={seasonA}
        seasonB={seasonB}
        edge={categoryEdge("team_context")}
      />

      <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
        <h2 className="text-[15px] font-bold tracking-tight">
          Where each season is stronger
        </h2>
        {result.howDifferent.aStronger.length ? (
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              {seasonA} stronger
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[14px] text-muted-foreground">
              {result.howDifferent.aStronger.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.howDifferent.bStronger.length ? (
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              {seasonB} stronger
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[14px] text-muted-foreground">
              {result.howDifferent.bStronger.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {result.howDifferent.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="text-[12px] text-muted-foreground">
          Shot charts, lineups, play-by-play, and tracking (Level 3) are not
          available yet.
        </p>
      </section>

      <section className="sports-card px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => setShowMethod((v) => !v)}
          className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          aria-expanded={showMethod}
        >
          How is this comparison calculated?
        </button>
        {showMethod ? (
          <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
            <p>Methodology v{result.methodology.version} · {result.methodology.scope}</p>
            <p>{result.methodology.qualifyingRule}</p>
            <p>{result.methodology.toleranceNote}</p>
            <p>{result.methodology.categoryRule}</p>
            <p>{result.methodology.overallRule}</p>
            <p>{result.methodology.impactRule}</p>
            <p>{result.methodology.cpiNote}</p>
            <p>{result.methodology.incompleteNote}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Compact control for the player page. */
export function PlayerSeasonCompareControl({
  playerId,
  seasons,
  defaultA,
  defaultB,
}: {
  playerId: string;
  seasons: string[];
  defaultA?: string;
  defaultB?: string;
}) {
  if (seasons.length < 2) return null;
  return (
    <div className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Compare seasons</h2>
        <p className="text-[13px] text-muted-foreground">
          Which version of this player was better — by production, efficiency,
          and more.
        </p>
      </div>
      <SeasonComparePicker
        playerId={playerId}
        seasons={seasons}
        seasonA={defaultA}
        seasonB={defaultB}
      />
    </div>
  );
}
