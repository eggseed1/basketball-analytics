"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type {
  TeamCompareEdge,
  TeamCompareMetricRow,
  TeamSeasonComparison,
} from "@/analytics/compare-team-seasons";
import { teamCompareEdgeLabel } from "@/analytics/compare-team-seasons";
import type { TeamSeasonEvidence } from "@/analytics/season-evidence";
import { GlassSurface } from "@/components/brand/glass-surface";
import { NBA_ATMOSPHERE } from "@/components/brand/page-atmosphere";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamCompareShare } from "@/components/compare/team-compare-share";
import { TeamSelect, currentTeamChoices } from "@/components/teams/team-select";
import { ComparisonDimensionRow } from "@/components/compare/player-compare-view";
import { QueryUpdatingChrome } from "@/components/continuity/query-nav";
import { MetricHelp } from "@/components/learn/metric-help";
import { TeamSeasonEvidenceCompareSection } from "@/components/compare/team-season-evidence-section";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TextLink } from "@/components/ui/text-link";
import { teamComparePath } from "@/analytics/compare-team-seasons";
import {
  TEAM_SEASON_RANK_MAX,
  TEAM_SEASON_RANK_MIN,
  teamSeasonRankPath,
} from "@/analytics/rank-team-seasons";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";
import { LinkCue } from "@/components/ui/link-cue";
import { Search } from "lucide-react";

type Hit = {
  id: string;
  name: string;
  teamKey?: string;
  subtitle?: string;
};

function TeamSearchField({
  label,
  selectedId,
  onPick,
  hideLabel,
}: {
  label: string;
  selectedId?: string;
  onPick: (hit: Hit) => void;
  hideLabel?: boolean;
}) {
  const teams = currentTeamChoices();
  return (
    <div className="flex flex-col gap-1.5">
      <Label className={hideLabel ? "sr-only" : undefined}>{label}</Label>
      <TeamSelect
        id={label.toLowerCase().replace(/\s+/g, "-")}
        label={label}
        variant="field"
        value={selectedId ?? ""}
        teams={teams}
        placeholder="Pick a team"
        onChange={(id) => {
          const team = teams.find((row) => row.id === id);
          onPick(team ? { id: team.id, name: team.fullName } : { id: "", name: "" });
        }}
      />
    </div>
  );
}

function TeamSlot({
  teamId,
  name,
  label,
}: {
  teamId?: string;
  name?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 pb-2 pt-1">
      {teamId ? (
        <div className="flex size-24 items-center justify-center">
          <TeamLogo teamKey={teamId} size="xl" />
        </div>
      ) : (
        <div
          className="frost-surface flex size-24 items-center justify-center rounded-full border-2 border-dashed border-foreground/15 text-muted-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]"
          aria-hidden
        >
          <Search className="size-8" strokeWidth={1.5} />
        </div>
      )}
      <p
        className={cn(
          type.caption,
          "max-w-full truncate font-bold uppercase tracking-[0.12em]",
          name ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {name || label}
      </p>
    </div>
  );
}

function SeasonField({
  id,
  label,
  value,
  seasons,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  seasons: string[];
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const choices = [...new Set(value ? [value, ...seasons] : seasons)].sort((a, b) =>
    b.localeCompare(a)
  );
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? choices.filter((season) => season.toLowerCase().includes(needle))
    : choices;

  return (
    <div className="site-search-field flex min-w-0 items-center gap-2 rounded-md px-3 py-2">
      <span
        className={cn(type.caption, "shrink-0 font-semibold text-muted-foreground")}
      >
        {label}
      </span>
      <Select
        value={value || null}
        onValueChange={(next) => {
          if (next != null) onChange(String(next));
        }}
        onOpenChange={(open) => {
          if (!open) setQuery("");
        }}
        onOpenChangeComplete={(open) => {
          if (open) searchRef.current?.focus();
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={label}
          className={cn(
            type.bodySm,
            "h-auto min-w-0 flex-1 justify-between rounded-none border-0 bg-transparent px-0 py-0 font-semibold shadow-none"
          )}
        >
          <SelectValue placeholder="Pick a season">{value || "Pick a season"}</SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          side="bottom"
          alignItemWithTrigger={false}
          collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
          className="max-h-[min(20rem,var(--available-height))] min-w-[12rem]"
          header={
            <div className="border-b border-border/40 p-1.5">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Search seasons"
                aria-label="Search seasons"
                className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          }
        >
          {visible.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No seasons match.</p>
          ) : (
            visible.map((season) => (
              <SelectItem key={season} value={season}>
                {season}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
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
  intent = "compare",
  availableSeasons = [],
  selectedSeasons = [],
  seasonChoices = [],
}: {
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  seasonA: string;
  seasonB: string;
  intent?: "compare" | "rank";
  availableSeasons?: string[];
  selectedSeasons?: string[];
  seasonChoices?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"compare" | "rank">(intent);
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
  const [picked, setPicked] = useState<string[]>(selectedSeasons);
  const ranking = mode === "rank";

  useEffect(() => {
    setMode(intent);
  }, [intent]);

  useEffect(() => {
    setPicked(selectedSeasons);
    // Join keeps a parent re-render from clearing a season the user just toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasons.join("|")]);

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

  function rankGo() {
    if (!a.id || picked.length < TEAM_SEASON_RANK_MIN) return;
    startTransition(() => {
      router.push(teamSeasonRankPath(a.id, picked));
    });
  }

  function openRank(teamId: string) {
    startTransition(() => {
      router.push(
        `/compare?mode=teams&view=rank&teamId=${encodeURIComponent(teamId)}`
      );
    });
  }

  function chooseMode(next: "compare" | "rank") {
    if (next === "rank") {
      if (!a.id) {
        setMode("rank");
        return;
      }
      openRank(a.id);
      return;
    }
    const params = new URLSearchParams({ mode: "teams" });
    if (a.id) {
      params.set("teamA", a.id);
      if (sa) params.set("seasonA", sa);
    }
    if (b.id) {
      params.set("teamB", b.id);
      if (sb) params.set("seasonB", sb);
    }
    startTransition(() => {
      router.push(`/compare?${params.toString()}`);
    });
  }

  function toggleSeason(season: string) {
    setPicked((prev) => {
      if (prev.includes(season)) return prev.filter((s) => s !== season);
      if (prev.length >= TEAM_SEASON_RANK_MAX) return prev;
      return [...prev, season].sort((x, y) => x.localeCompare(y));
    });
  }

  const hero = ranking || !a.id || !b.id;
  const colorA = resolveTeamBrand(a.id)?.primary ?? NBA_ATMOSPHERE.colorA;
  const colorB = resolveTeamBrand(b.id)?.primary ?? NBA_ATMOSPHERE.colorB;

  const fieldA = (
    <TeamSearchField
      label="Team A"
      hideLabel={hero}
      selectedId={a.id || undefined}
      onPick={(hit) => setA({ id: hit.id, name: hit.name })}
    />
  );
  const fieldB = (
    <TeamSearchField
      label="Team B"
      hideLabel={hero}
      selectedId={b.id || undefined}
      onPick={(hit) => setB({ id: hit.id, name: hit.name })}
    />
  );
  const seasonAField = (
    <SeasonField
      id="season-a"
      label="Season"
      value={sa}
      seasons={seasonChoices}
      onChange={setSa}
    />
  );
  const seasonBField = (
    <SeasonField
      id="season-b"
      label="Season"
      value={sb}
      seasons={seasonChoices}
      onChange={setSb}
    />
  );

  return (
    <GlassSurface
      as="form"
      effect="css"
      backdropBlur={24}
      overflowVisible
      accentColor={colorA}
      accentColorB={colorB}
      className={cn(
        "relative flex flex-col gap-4 rounded-xl",
        hero ? "p-5 sm:p-6" : "p-4",
        pending && "opacity-70"
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (ranking) rankGo();
        else go();
      }}
    >
      <QueryUpdatingChrome pending={pending} />
      <ChoiceTrack aria-label="Team compare" className="self-center">
        <ChoiceChip active={!ranking} onClick={() => chooseMode("compare")}>
          Compare
        </ChoiceChip>
        <ChoiceChip active={ranking} onClick={() => chooseMode("rank")}>
          Rank seasons
        </ChoiceChip>
      </ChoiceTrack>
      {ranking ? (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          <TeamSlot
            teamId={a.id || undefined}
            name={a.name || undefined}
            label="Team"
          />
          <TeamSearchField
            label="Team"
            hideLabel
            selectedId={a.id || undefined}
            onPick={(hit) => {
              setA({ id: hit.id, name: hit.name });
              if (hit.id) openRank(hit.id);
            }}
          />
          {availableSeasons.length > 0 ? (
            <ChoiceTrack className="flex-wrap" aria-label="Seasons to rank">
              {[...availableSeasons]
                .sort((x, y) => y.localeCompare(x))
                .map((season) => (
                  <ChoiceChip
                    key={season}
                    active={picked.includes(season)}
                    disabled={
                      !picked.includes(season) &&
                      picked.length >= TEAM_SEASON_RANK_MAX
                    }
                    onClick={() => toggleSeason(season)}
                  >
                    {season}
                  </ChoiceChip>
                ))}
            </ChoiceTrack>
          ) : (
            <p className={cn(type.caption, "text-center text-muted-foreground")}>
              Pick a team to load its seasons.
            </p>
          )}
        </div>
      ) : (
      <div
        className={cn(
          "grid items-start",
          hero
            ? "gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-6"
            : "gap-3 sm:grid-cols-2"
        )}
      >
        {hero ? (
          <>
            <div className="flex min-w-0 flex-col gap-1.5">
              <TeamSlot teamId={a.id || undefined} name={a.name || undefined} label="Team A" />
              {fieldA}
              {seasonAField}
            </div>
            <div className="flex justify-center sm:pt-9">
              <span
                aria-hidden
                className={cn(
                  type.caption,
                  "flex size-12 shrink-0 items-center justify-center rounded-full font-black uppercase tracking-wide"
                )}
                style={{
                  background: "var(--material-elevated-bg)",
                  border: "1px solid var(--material-elevated-border)",
                  boxShadow: "var(--material-elevated-shadow)",
                }}
              >
                vs
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <TeamSlot teamId={b.id || undefined} name={b.name || undefined} label="Team B" />
              {fieldB}
              {seasonBField}
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-1.5">
              {fieldA}
              {seasonAField}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              {fieldB}
              {seasonBField}
            </div>
          </>
        )}
      </div>
      )}
      <div className="flex flex-col items-center gap-2">
        <button
          type="submit"
          disabled={
            pending ||
            (ranking
              ? !a.id || picked.length < TEAM_SEASON_RANK_MIN
              : !a.id || !b.id)
          }
          className={cn(
            type.bodySm,
            "glass-pill inline-flex h-9 items-center justify-center rounded-md px-3 font-semibold disabled:opacity-50"
          )}
        >
          {pending
            ? "Loading…"
            : ranking
              ? "Rank seasons"
              : "Compare teams"}
        </button>
        <p className={cn(type.caption, "text-center text-muted-foreground")}>
          {ranking
            ? `Pick ${TEAM_SEASON_RANK_MIN} to ${TEAM_SEASON_RANK_MAX} seasons for one franchise.`
            : "Two teams, or the same team in two seasons."}
        </p>
      </div>
    </GlassSurface>
  );
}

function EdgeBadge({
  edge,
  labelA,
  labelB,
  abbrA,
  abbrB,
}: {
  edge: TeamCompareEdge;
  labelA: string;
  labelB: string;
  abbrA: string;
  abbrB: string;
}) {
  const text = teamCompareEdgeLabel(edge, labelA, labelB);
  const conceptId =
    edge === "even"
      ? "essentially_even"
      : edge === "unavailable"
        ? "unavailable"
        : null;
  const winner = edge === "a" ? abbrA : edge === "b" ? abbrB : null;
  const tint = winner ? resolveTeamBrand(winner)?.primary : null;
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums",
        tint ? "text-foreground" : "bg-foreground/[0.05] text-muted-foreground"
      )}
      style={
        tint
          ? { backgroundColor: `color-mix(in srgb, ${tint} 16%, transparent)` }
          : undefined
      }
    >
      {conceptId ? (
        <MetricHelp conceptId={conceptId} labelClassName="font-semibold">
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
  abbrA,
  abbrB,
  edge,
}: {
  title: string;
  rows: TeamCompareMetricRow[];
  labelA: string;
  labelB: string;
  abbrA: string;
  abbrB: string;
  edge: TeamCompareEdge;
}) {
  if (!rows.length) return null;
  return (
    <section className="sports-card px-4 py-3 sm:px-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[16px] font-bold tracking-tight">{title}</h3>
        <EdgeBadge edge={edge} labelA={labelA} labelB={labelB} abbrA={abbrA} abbrB={abbrB} />
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
            <h2 className="text-[24px] font-bold tracking-tight sm:text-[24px]">
              {title}
            </h2>
          </div>
          <EdgeBadge
            edge={result.overall.edge}
            labelA={labelA}
            labelB={labelB}
            abbrA={result.sideA.abbreviation}
            abbrB={result.sideB.abbreviation}
          />
          <TeamCompareShare result={result} />
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
        abbrA={result.sideA.abbreviation}
        abbrB={result.sideB.abbreviation}
        edge={catEdge("performance")}
      />
      <CategoryBlock
        title="Efficiency"
        rows={byCat("efficiency")}
        labelA={labelA}
        labelB={labelB}
        abbrA={result.sideA.abbreviation}
        abbrB={result.sideB.abbreviation}
        edge={catEdge("efficiency")}
      />
      <CategoryBlock
        title="Shooting"
        rows={byCat("shooting")}
        labelA={labelA}
        labelB={labelB}
        abbrA={result.sideA.abbreviation}
        abbrB={result.sideB.abbreviation}
        edge={catEdge("shooting")}
      />
      <CategoryBlock
        title="Rebounding"
        rows={byCat("rebounding")}
        labelA={labelA}
        labelB={labelB}
        abbrA={result.sideA.abbreviation}
        abbrB={result.sideB.abbreviation}
        edge={catEdge("rebounding")}
      />
      <CategoryBlock
        title="Possessions"
        rows={byCat("possession")}
        labelA={labelA}
        labelB={labelB}
        abbrA={result.sideA.abbreviation}
        abbrB={result.sideB.abbreviation}
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
          Explore {labelA} <LinkCue />
        </TextLink>
        <TextLink
          href={`/teams/${encodeURIComponent(result.sideB.abbreviation.toLowerCase())}?season=${encodeURIComponent(result.sideB.season)}`}
        >
          Explore {labelB} <LinkCue />
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
    <div className="rounded-lg border border-border/70 frost-surface px-3 py-2">
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
