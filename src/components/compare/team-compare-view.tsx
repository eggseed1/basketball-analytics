"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type {
  TeamCompareEdge,
  TeamCompareMetricRow,
  TeamSeasonComparison,
} from "@/analytics/compare-team-seasons";
import { teamCompareEdgeLabel } from "@/analytics/compare-team-seasons";
import type { TeamSeasonEvidence } from "@/analytics/season-evidence";
import { TeamLogo } from "@/components/brand/team-logo";
import { ComparisonDimensionRow } from "@/components/compare/player-compare-view";
import { MetricHelp } from "@/components/learn/metric-help";
import { TeamSeasonEvidenceCompareSection } from "@/components/compare/team-season-evidence-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextLink } from "@/components/ui/text-link";
import { teamComparePath } from "@/analytics/compare-team-seasons";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  name: string;
  teamKey?: string;
  subtitle?: string;
};

function TeamSearchField({
  label,
  selectedId,
  selectedName,
  onPick,
}: {
  label: string;
  selectedId?: string;
  selectedName?: string;
  onPick: (hit: Hit) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const trimmed = q.trim();
  const visibleHits = trimmed.length < 2 ? [] : hits;

  useEffect(() => {
    if (trimmed.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}&kind=team`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((body) => {
          const data = (body?.data ?? []) as Hit[];
          setHits(data.slice(0, 8));
          setOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed]);

  return (
    <div className="relative flex flex-col gap-1.5">
      <Label>{label}</Label>
      {selectedId && selectedName ? (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
          <TeamLogo teamKey={selectedId} size="xs" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
            {selectedName}
          </span>
          <button
            type="button"
            className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            onClick={() => {
              setQ("");
              onPick({ id: "", name: "" });
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => visibleHits.length && setOpen(true)}
          placeholder="Search team"
          autoComplete="off"
        />
      )}
      {open && visibleHits.length > 0 && !selectedId ? (
        <ul className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-md">
          {visibleHits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary"
                onClick={() => {
                  onPick(hit);
                  setOpen(false);
                  setQ("");
                }}
              >
                <TeamLogo teamKey={hit.teamKey ?? hit.id} size="xs" />
                <span className="text-[14px] font-semibold">{hit.name}</span>
                {hit.subtitle ? (
                  <span className="text-[12px] text-muted-foreground">
                    {hit.subtitle}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TeamComparePicker({
  teamAId,
  teamBId,
  teamAName,
  teamBName,
  seasonA,
  seasonB,
}: {
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  seasonA: string;
  seasonB: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [a, setA] = useState<Hit>({
    id: teamAId ?? "",
    name: teamAName ?? "",
  });
  const [b, setB] = useState<Hit>({
    id: teamBId ?? "",
    name: teamBName ?? "",
  });
  const [sa, setSa] = useState(seasonA);
  const [sb, setSb] = useState(seasonB);
  const current = canonicalSeasonFromStartYear(currentNbaStartYear());

  function go() {
    if (!a.id || !b.id || !sa || !sb) return;
    startTransition(() => {
      router.push(
        teamComparePath({
          teamA: a.id,
          teamB: b.id,
          seasonA: sa,
          seasonB: sb,
        })
      );
    });
  }

  return (
    <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <TeamSearchField
          label="Team A"
          selectedId={a.id || undefined}
          selectedName={a.name || undefined}
          onPick={(hit) => setA({ id: hit.id, name: hit.name })}
        />
        <TeamSearchField
          label="Team B"
          selectedId={b.id || undefined}
          selectedName={b.name || undefined}
          onPick={(hit) => setB({ id: hit.id, name: hit.name })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="season-a">Season A</Label>
          <Input
            id="season-a"
            value={sa}
            onChange={(e) => setSa(e.target.value)}
            placeholder={current}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="season-b">Season B</Label>
          <Input
            id="season-b"
            value={sb}
            onChange={(e) => setSb(e.target.value)}
            placeholder={current}
          />
        </div>
      </div>
      <button
        type="button"
        disabled={pending || !a.id || !b.id}
        onClick={go}
        className="rounded-md bg-foreground px-3 py-2 text-[14px] font-semibold text-background disabled:opacity-50"
      >
        {pending ? "Loading…" : "Compare teams"}
      </button>
      <p className="text-[12px] text-muted-foreground">
        Same team + two seasons = Team Season Compare. Two teams = Team vs Team.
        Canonical seasons: YYYY-YY.
      </p>
    </div>
  );
}

function EdgeBadge({
  edge,
  labelA,
  labelB,
}: {
  edge: TeamCompareEdge;
  labelA: string;
  labelB: string;
}) {
  const text = teamCompareEdgeLabel(edge, labelA, labelB);
  const conceptId =
    edge === "even"
      ? "essentially_even"
      : edge === "unavailable"
        ? "unavailable"
        : null;
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums",
        edge === "even" || edge === "unavailable"
          ? "bg-secondary text-muted-foreground"
          : "bg-foreground text-background"
      )}
    >
      {conceptId ? (
        <MetricHelp conceptId={conceptId} labelClassName="font-bold">
          {text}
        </MetricHelp>
      ) : (
        text
      )}
    </span>
  );
}

function CategoryBlock({
  title,
  rows,
  labelA,
  labelB,
  edge,
}: {
  title: string;
  rows: TeamCompareMetricRow[];
  labelA: string;
  labelB: string;
  edge: TeamCompareEdge;
}) {
  if (!rows.length) return null;
  return (
    <section className="sports-card px-4 py-3 sm:px-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[16px] font-bold tracking-tight">{title}</h3>
        <EdgeBadge edge={edge} labelA={labelA} labelB={labelB} />
      </div>
      <p className="mb-2 text-[12px] text-muted-foreground">
        Left = {labelA} · Right = {labelB} · badge = category winner
      </p>
      {rows.map((d) => (
        <ComparisonDimensionRow
          key={d.id}
          dimension={d}
          aName={labelA}
          bName={labelB}
          evenThreshold={0.0001}
          edgeDisplay={
            d.edge === "a"
              ? `${labelA} stronger`
              : d.edge === "b"
                ? `${labelB} stronger`
                : d.edge === "even"
                  ? "Even"
                  : "Unavailable"
          }
        />
      ))}
    </section>
  );
}

export function TeamCompareView({
  result,
  evidenceA,
  evidenceB,
}: {
  result: TeamSeasonComparison;
  evidenceA?: TeamSeasonEvidence | null;
  evidenceB?: TeamSeasonEvidence | null;
}) {
  const labelA = `${result.sideA.abbreviation} ${result.sideA.season}`;
  const labelB = `${result.sideB.abbreviation} ${result.sideB.season}`;
  const title =
    result.mode === "same_team"
      ? `${result.sideA.fullName}: ${result.sideA.season} vs ${result.sideB.season}`
      : `${result.sideA.fullName} ${result.sideA.season} vs ${result.sideB.fullName} ${result.sideB.season}`;

  const byCat = (id: string) =>
    result.metrics.filter((m) => m.category === id);
  const catEdge = (id: string) =>
    result.categories.find((c) => c.id === id)?.edge ?? "unavailable";

  return (
    <div className="flex flex-col gap-4">
      <header className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <TeamLogo teamKey={result.sideA.abbreviation} size="lg" />
          {result.mode === "cross_team" ? (
            <TeamLogo teamKey={result.sideB.abbreviation} size="lg" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {result.mode === "same_team"
                ? "Team season compare"
                : "Team vs team"}
              {" · "}
              methodology v{result.methodology.version}
            </p>
            <h2 className="text-[24px] font-bold tracking-tight sm:text-[24px]">
              {title}
            </h2>
          </div>
          <EdgeBadge
            edge={result.overall.edge}
            labelA={labelA}
            labelB={labelB}
          />
        </div>
        <p className="text-[14px] text-muted-foreground">
          {result.overall.reason}
        </p>
        {result.insufficientReason ? (
          <p className="text-[12px] text-muted-foreground">
            {result.insufficientReason}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <CoverageCard side={result.coverage.a} />
          <CoverageCard side={result.coverage.b} />
        </div>
      </header>

      <CategoryBlock
        title="Performance"
        rows={byCat("performance")}
        labelA={labelA}
        labelB={labelB}
        edge={catEdge("performance")}
      />
      <CategoryBlock
        title="Efficiency"
        rows={byCat("efficiency")}
        labelA={labelA}
        labelB={labelB}
        edge={catEdge("efficiency")}
      />
      <CategoryBlock
        title="Shooting"
        rows={byCat("shooting")}
        labelA={labelA}
        labelB={labelB}
        edge={catEdge("shooting")}
      />
      <CategoryBlock
        title="Rebounding"
        rows={byCat("rebounding")}
        labelA={labelA}
        labelB={labelB}
        edge={catEdge("rebounding")}
      />
      <CategoryBlock
        title="Possessions"
        rows={byCat("possession")}
        labelA={labelA}
        labelB={labelB}
        edge={catEdge("possession")}
      />

      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <h3 className="text-[16px] font-bold tracking-tight">
          How are they different?
        </h3>
        {result.howDifferent.aStronger.length ? (
          <div>
            <p className="text-[12px] font-semibold text-muted-foreground">
              {labelA} stronger
            </p>
            <ul className="mt-1 list-disc pl-4 text-[14px]">
              {result.howDifferent.aStronger.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.howDifferent.bStronger.length ? (
          <div>
            <p className="text-[12px] font-semibold text-muted-foreground">
              {labelB} stronger
            </p>
            <ul className="mt-1 list-disc pl-4 text-[14px]">
              {result.howDifferent.bStronger.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.howDifferent.notes.length ? (
          <ul className="list-disc pl-4 text-[14px] text-muted-foreground">
            {result.howDifferent.notes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <TeamSeasonEvidenceCompareSection
        evidenceA={evidenceA ?? null}
        evidenceB={evidenceB ?? null}
        labelA={labelA}
        labelB={labelB}
      />

      <p className="flex flex-wrap gap-3 text-[14px]">
        <TextLink
          href={`/teams/${encodeURIComponent(result.sideA.abbreviation.toLowerCase())}?season=${encodeURIComponent(result.sideA.season)}`}
        >
          Explore {labelA} →
        </TextLink>
        <TextLink
          href={`/teams/${encodeURIComponent(result.sideB.abbreviation.toLowerCase())}?season=${encodeURIComponent(result.sideB.season)}`}
        >
          Explore {labelB} →
        </TextLink>
      </p>

      <details className="text-[12px] text-muted-foreground">
        <summary className="cursor-pointer font-semibold">Methodology</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>{result.methodology.qualifyingRule}</li>
          <li>{result.methodology.toleranceNote}</li>
          <li>{result.methodology.categoryRule}</li>
          <li>{result.methodology.overallRule}</li>
          <li>{result.methodology.incompleteNote}</li>
          <li>{result.methodology.continuityNote}</li>
        </ul>
      </details>
    </div>
  );
}

function CoverageCard({
  side,
}: {
  side: TeamSeasonComparison["coverage"]["a"];
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-white/40 px-3 py-2">
      <p className="text-[14px] font-semibold">
        {side.abbreviation} {side.season}
        {side.incomplete ? (
          <span className="ml-2 font-normal text-muted-foreground">
            · in progress
          </span>
        ) : null}
        {side.thin ? (
          <span className="ml-2 font-normal text-muted-foreground">
            · limited sample
          </span>
        ) : null}
      </p>
      <p className="text-[12px] text-muted-foreground">
        {side.gamesPlayed} GP
        {side.qualifying ? " · qualifying" : " · not eligible for overall"}
      </p>
    </div>
  );
}
