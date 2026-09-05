"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamIdentity } from "@/components/teams/team-identity";
import {
  MetricCard,
  PercentileBadge,
  StatDelta,
  StatGroup,
  StatLabel,
  StatRank,
  StatValue,
} from "@/components/stats/metric-display";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, InlineError, Skeleton } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { boardType, material, shell, type } from "@/lib/design-system";
import type { ColorScheme, SurfaceStyle } from "@/lib/owner-theme";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "typography", label: "Typography" },
  { id: "colors", label: "Colors" },
  { id: "spacing", label: "Spacing" },
  { id: "materials", label: "Glass materials" },
  { id: "radii-shadows", label: "Radii & shadows" },
  { id: "buttons", label: "Buttons" },
  { id: "inputs", label: "Inputs" },
  { id: "tabs", label: "Tabs" },
  { id: "badges", label: "Badges" },
  { id: "cards", label: "Cards" },
  { id: "headers", label: "Page headers" },
  { id: "statistics", label: "Statistics" },
  { id: "tables", label: "Tables" },
  { id: "loading", label: "Loading & empty" },
  { id: "patterns", label: "Patterns" },
  { id: "responsive", label: "Responsive" },
] as const;

const SCHEMES: Array<{ id: ColorScheme; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const SURFACES: Array<{ id: SurfaceStyle; label: string }> = [
  { id: "solid", label: "Solid" },
  { id: "glass", label: "Glass" },
];

const TYPE_ROWS = [
  { name: "Display LG", className: type.displayLg, meta: "40–48 / 700", sample: "118.4" },
  { name: "Title 1", className: type.title1, meta: "32 / 40 / 700", sample: "Luka Dončić" },
  { name: "Display", className: type.display, meta: "32 / 40 / 700", sample: "Final score" },
  { name: "Title 2 / Page", className: type.title2, meta: "24 / 32 / 600", sample: "Upcoming Games" },
  { name: "Heading", className: type.heading, meta: "20 / 28 / 700", sample: "Offense" },
  { name: "Title 3", className: type.title3, meta: "20 / 28 / 600", sample: "Four Factors" },
  { name: "Title", className: type.title, meta: "18 / 24 / 600", sample: "East standings" },
  { name: "Body", className: type.body, meta: "16 / 24 / 400", sample: "Waived G Ethan Thompson." },
  { name: "Body sm", className: type.bodySm, meta: "14 / 20 / 400", sample: "See all transactions →" },
  { name: "Caption", className: type.caption, meta: "12 / 16 / 400", sample: "2025–26 · Regular season" },
  { name: "Micro", className: type.micro, meta: "10 / 14 / 400", sample: "LIVE" },
] as const;

const COLOR_GROUPS: Array<{
  title: string;
  items: Array<{ label: string; token: string; swatch: string }>;
}> = [
  {
    title: "Surfaces",
    items: [
      { label: "App canvas", token: "--surface-app", swatch: "bg-[var(--surface-app)]" },
      { label: "Panel", token: "--surface-panel", swatch: "bg-[var(--surface-panel)]" },
      { label: "Hover", token: "--surface-hover", swatch: "bg-[var(--surface-hover)]" },
    ],
  },
  {
    title: "Text",
    items: [
      { label: "Primary", token: "--text-primary", swatch: "bg-[var(--text-primary)]" },
      { label: "Secondary", token: "--text-secondary", swatch: "bg-[var(--text-secondary)]" },
      { label: "Tertiary", token: "--text-tertiary", swatch: "bg-[var(--text-tertiary)]" },
    ],
  },
  {
    title: "Borders",
    items: [
      { label: "Subtle", token: "--border-subtle", swatch: "bg-[var(--border-subtle)]" },
      { label: "Default", token: "--border-default", swatch: "bg-[var(--border-default)]" },
      { label: "Focus", token: "--border-focus", swatch: "bg-[var(--border-focus)]" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Positive", token: "--accent-positive", swatch: "bg-[var(--accent-positive)]" },
      { label: "Negative", token: "--accent-negative", swatch: "bg-[var(--accent-negative)]" },
      { label: "Warning", token: "--accent-warning", swatch: "bg-[var(--accent-warning)]" },
      { label: "Info", token: "--accent-info", swatch: "bg-[var(--accent-info)]" },
      { label: "Elite", token: "--accent-elite", swatch: "bg-[var(--accent-elite)]" },
      { label: "%ile poor", token: "--percentile-poor", swatch: "bg-[var(--percentile-poor)]" },
      { label: "%ile avg", token: "--percentile-average", swatch: "bg-[var(--percentile-average)]" },
      { label: "%ile elite", token: "--percentile-elite", swatch: "bg-[var(--percentile-elite)]" },
    ],
  },
];

const SPACE_STEPS = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;
const RADIUS_STEPS = [
  { name: "xs", css: "var(--radius-xs)" },
  { name: "sm", css: "var(--radius-sm)" },
  { name: "md", css: "var(--radius-md)" },
  { name: "lg", css: "var(--radius-lg)" },
  { name: "xl", css: "var(--radius-xl)" },
  { name: "2xl", css: "var(--radius-2xl)" },
] as const;

function LabSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 flex flex-col gap-4">
      <SectionHeader title={title} description={description} />
      {children}
    </section>
  );
}

export function DesignSystemLab() {
  const { scheme, surface, setScheme, setSurface } = useOwnerTheme();
  const [tabDemo, setTabDemo] = useState<"overview" | "stats" | "games">("overview");
  const [segDemo, setSegDemo] = useState<"perGame" | "per36" | "per100">("perGame");
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      Boolean
    ) as HTMLElement[];
    if (!nodes.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.4] }
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative flex flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:w-52 lg:shrink-0 lg:overflow-y-auto">
        <p className="type-caption mb-3 font-semibold uppercase tracking-wide text-muted-foreground">
          Design system
        </p>
        <nav className="flex flex-row gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "shrink-0 rounded-[var(--radius-md)] px-2.5 py-1.5 type-caption font-medium transition-colors",
                active === s.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 flex flex-col gap-14">
        <LabSection
          id="overview"
          title="Overview"
          description="macOS-inspired spatial hierarchy + analytics density. Glass establishes separation — never nest blur inside blur."
        >
          <Surface variant="glass" padding="md" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className={type.title}>Appearance</h3>
                <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
                  Light/dark lives in the site header. Glass is default; solid remains available.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                {scheme === "dark" ? (
                  <Moon className="size-4" aria-hidden />
                ) : (
                  <Sun className="size-4" aria-hidden />
                )}
                <span className="type-caption font-semibold uppercase tracking-wide">
                  {scheme} · {surface}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-6">
              <SegmentedControl
                label="Color"
                value={scheme}
                options={SCHEMES}
                onChange={setScheme}
              />
              <SegmentedControl
                label="Surface"
                value={surface}
                options={SURFACES}
                onChange={setSurface}
              />
            </div>
            <ul className={cn(type.bodySm, "list-disc space-y-1 pl-5 text-muted-foreground")}>
              <li>Opaque canvas → one glass structural layer → transparent content.</li>
              <li>Semantic tokens in <code className="type-caption">drbl-tokens.css</code>.</li>
              <li>Primitives under <code className="type-caption">components/ui</code> + stats/layout.</li>
              <li>Shell widths: {shell.standard} · {shell.wide} · {shell.full}.</li>
            </ul>
          </Surface>
        </LabSection>

        <LabSection
          id="typography"
          title="Typography"
          description="Even-pixel web scale. Boards use boardType separately."
        >
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border">
            {TYPE_ROWS.map((row) => (
              <div
                key={row.name}
                className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <p className="w-44 shrink-0 type-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.name}
                  <span className="mt-0.5 block font-normal normal-case tracking-normal">
                    {row.meta}
                  </span>
                </p>
                <p className={row.className}>{row.sample}</p>
              </div>
            ))}
          </div>
          <p className={cn(type.bodySm, "tabular-nums text-muted-foreground")}>
            Tabular numerals: 12.4 · 108.0 · +7.2 · 91st
          </p>
        </LabSection>

        <LabSection id="colors" title="Colors" description="Restrained neutrals; color carries meaning.">
          <div className="flex flex-col gap-6">
            {COLOR_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-3">
                <h3 className={type.title}>{group.title}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {group.items.map((item) => (
                    <div
                      key={item.token}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2"
                    >
                      <span
                        className={cn(
                          "size-8 shrink-0 rounded-[var(--radius-sm)] border border-border",
                          item.swatch
                        )}
                      />
                      <div className="min-w-0">
                        <p className={cn(type.bodySm, "font-semibold")}>{item.label}</p>
                        <p className="type-micro truncate text-muted-foreground">
                          {item.token}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </LabSection>

        <LabSection id="spacing" title="Spacing" description="4px rhythm. Avoid 13 / 18 / 27 px one-offs.">
          <div className="flex flex-col gap-2">
            {SPACE_STEPS.map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="w-10 type-caption tabular-nums text-muted-foreground">
                  {n}
                </span>
                <div
                  className="h-3 rounded-[var(--radius-xs)] bg-[var(--accent-info)]/40"
                  style={{ width: n }}
                />
              </div>
            ))}
          </div>
        </LabSection>

        <LabSection
          id="materials"
          title="Glass materials"
          description="Four levels. Prefer sports-card (Material 2) for panels — not nested glass."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["Canvas", material.canvas, "Page foundation · no blur"],
                ["Subtle", material.subtle, "Chips · mini panels"],
                ["Standard", material.standard, "Cards · boards"],
                ["Elevated", material.elevated, "Menus · modals"],
              ] as const
            ).map(([label, cls, usage]) => (
              <div
                key={label}
                className={cn(
                  "flex min-h-28 flex-col justify-end gap-1 rounded-[var(--radius-lg)] p-4",
                  cls
                )}
              >
                <p className={cn(type.title, "font-semibold")}>{label}</p>
                <p className={cn(type.caption, "text-muted-foreground")}>{usage}</p>
              </div>
            ))}
          </div>
        </LabSection>

        <LabSection id="radii-shadows" title="Radii & shadows">
          <div className="flex flex-wrap gap-3">
            {RADIUS_STEPS.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div
                  className="size-14 border border-border bg-secondary"
                  style={{ borderRadius: r.css }}
                />
                <span className="type-caption text-muted-foreground">{r.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["shadow-sm", "var(--shadow-sm)"],
                ["shadow-md", "var(--shadow-md)"],
                ["shadow-overlay", "var(--shadow-overlay)"],
              ] as const
            ).map(([name, shadow]) => (
              <div
                key={name}
                className="rounded-[var(--radius-lg)] bg-card p-4"
                style={{ boxShadow: shadow }}
              >
                <p className={type.bodySm}>{name}</p>
              </div>
            ))}
          </div>
        </LabSection>

        <LabSection id="buttons" title="Buttons">
          <div className="flex flex-col gap-4">
            {(["default", "secondary", "outline", "ghost", "destructive"] as const).map(
              (variant) => (
                <div key={variant} className="flex flex-wrap items-center gap-2">
                  <span className="w-24 type-caption capitalize text-muted-foreground">
                    {variant}
                  </span>
                  <Button variant={variant} size="sm">
                    Small
                  </Button>
                  <Button variant={variant}>Medium</Button>
                  <Button variant={variant} size="lg">
                    Large
                  </Button>
                  <Button variant={variant} disabled>
                    Disabled
                  </Button>
                </div>
              )
            )}
          </div>
        </LabSection>

        <LabSection id="inputs" title="Inputs">
          <div className="grid max-w-lg gap-3">
            <Input placeholder="Search players…" />
            <Input defaultValue="Luka Dončić" aria-invalid />
            <Input disabled placeholder="Disabled" />
          </div>
        </LabSection>

        <LabSection id="tabs" title="Tabs & segmented">
          <SegmentedControl
            label="Standard"
            value={tabDemo}
            options={[
              { id: "overview", label: "Overview" },
              { id: "stats", label: "Stats" },
              { id: "games", label: "Games" },
            ]}
            onChange={setTabDemo}
          />
          <SegmentedControl
            label="Compact / rate base"
            size="sm"
            value={segDemo}
            options={[
              { id: "perGame", label: "Per Game" },
              { id: "per36", label: "Per 36" },
              { id: "per100", label: "Per 100" },
            ]}
            onChange={setSegDemo}
          />
        </LabSection>

        <LabSection id="badges" title="Badges">
          <div className="flex flex-wrap gap-2">
            {(
              [
                "neutral",
                "positive",
                "negative",
                "warning",
                "info",
                "elite",
                "live",
                "injury",
                "transaction",
                "glass",
              ] as const
            ).map((v) => (
              <Badge key={v} variant={v}>
                {v}
              </Badge>
            ))}
            <PercentileBadge percentile={94} />
          </div>
        </LabSection>

        <LabSection id="cards" title="Cards / surfaces">
          <div className="grid gap-3 md:grid-cols-2">
            <Surface variant="glass" padding="md">
              <h3 className={type.title}>Glass card</h3>
              <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
                Standard panel for boards and sections.
              </p>
            </Surface>
            <Surface variant="subtle" padding="md">
              <h3 className={type.title}>Subtle</h3>
              <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
                Nested content inside a glass parent.
              </p>
            </Surface>
            <Surface variant="elevated" padding="md">
              <h3 className={type.title}>Elevated</h3>
              <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
                Menus and floating chrome.
              </p>
            </Surface>
            <Surface variant="interactive" padding="md" className="cursor-pointer">
              <h3 className={type.title}>Interactive</h3>
              <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
                Hover affordance for clickable panels.
              </p>
            </Surface>
          </div>
        </LabSection>

        <LabSection id="headers" title="Page & section headers">
          <Surface variant="glass" padding="md">
            <PageHeader
              eyebrow="Player"
              title="Luka Dončić"
              subtitle="Los Angeles Lakers · Guard"
              meta={
                <>
                  <span>6&apos;7&quot;</span>
                  <span aria-hidden>·</span>
                  <span>230 lb</span>
                  <span aria-hidden>·</span>
                  <span>Age 27</span>
                </>
              }
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Compare
                  </Button>
                  <Button size="sm">Favorite</Button>
                </>
              }
            />
          </Surface>
        </LabSection>

        <LabSection id="statistics" title="Statistics">
          <StatGroup>
            <MetricCard label="PTS" value="28.4" rank={3} percentile={96} />
            <MetricCard label="AST" value="8.1" rank={7} percentile={88} />
            <MetricCard label="REB" value="7.9" rank={22} percentile={72} />
            <MetricCard label="TS%" value="61.8%" delta="+4.2" percentile={91} />
            <MetricCard label="USG%" value="31.2%" rank={4} />
            <MetricCard label="NET RTG" value="+7.2" percentile={94} delta="+1.1" />
          </StatGroup>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <StatLabel>OFF RTG</StatLabel>
              <StatValue size="lg">118.4</StatValue>
              <StatRank rank={6} of={30} />
            </div>
            <div>
              <StatLabel>Delta</StatLabel>
              <StatDelta value={8.7} label="vs league" />
            </div>
          </div>
        </LabSection>

        <LabSection id="tables" title="Tables" description="boardType + tabular-nums. Sticky name columns stay in board-scroll-host.">
          <div className="board-scroll-frame overflow-x-auto rounded-[var(--radius-md)] border border-border">
            <table className="board-stats w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {["Player", "Tm", "GP", "PTS", "AST", "REB", "TS%", "USG%"].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "border-b border-border px-2 py-1.5 font-semibold uppercase text-muted-foreground",
                        boardType.head
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Luka Dončić", "LAL", "62", "28.4", "8.1", "7.9", "61.8", "31.2"],
                  ["Shai Gilgeous-Alexander", "OKC", "68", "32.1", "6.2", "5.1", "63.4", "33.0"],
                  ["Nikola Jokić", "DEN", "64", "29.2", "10.1", "12.4", "66.1", "29.8"],
                ].map((row) => (
                  <tr key={row[0]} className="hover:bg-[var(--surface-hover)]">
                    {row.map((cell, i) => (
                      <td
                        key={`${row[0]}-${i}`}
                        className={cn(
                          "border-b border-border/60 px-2 py-1",
                          boardType.cell,
                          i === 0 ? cn(boardType.name, "font-semibold") : "tabular-nums"
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LabSection>

        <LabSection id="loading" title="Loading, empty & errors">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <EmptyState
              compact
              title="No games yet"
              description="Schedule rows appear after tip-off."
            />
            <InlineError
              title="Couldn’t load standings"
              description="Try again in a moment."
            />
          </div>
        </LabSection>

        <LabSection id="patterns" title="Composition patterns">
          <Surface variant="glass" padding="md" className="flex flex-col gap-4">
            <PageHeader
              title="Boston Celtics"
              subtitle="2025–26 · 52–30 · 2nd East"
              actions={<Button size="sm" variant="secondary">Share</Button>}
            />
            <StatGroup className="lg:grid-cols-4">
              <MetricCard label="ORTG" value="118.2" rank={3} />
              <MetricCard label="DRTG" value="110.4" rank={5} />
              <MetricCard label="NET" value="+7.8" percentile={95} />
              <MetricCard label="PACE" value="99.1" rank={14} />
            </StatGroup>
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Identity links:{" "}
              <PlayerIdentity
                playerId="1629029"
                name="Luka Dončić"
                teamKey="lal"
                teamLabel="LAL"
                variant="compact"
                className="inline-flex align-baseline"
                nameClassName="inline"
              >
                Luka Dončić
              </PlayerIdentity>
              {" · "}
              <TeamIdentity teamKey="bos" label="Celtics" />
              {" · "}
              <TextLink href="/standings">Standings</TextLink>
            </p>
          </Surface>
        </LabSection>

        <LabSection
          id="responsive"
          title="Responsive"
          description="Gutters scale via --space-page-gutter. Tables scroll; tabs overflow-x."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Mobile", "320–430", "14–16px gutter · stacked stats"],
              ["Tablet", "768–1024", "20–24px · 2–3 col grids"],
              ["Desktop", "1280+", "24–32px · wide shell when dense"],
            ].map(([label, range, note]) => (
              <Surface key={label} variant="subtle" padding="sm">
                <p className={cn(type.title, "font-semibold")}>{label}</p>
                <p className="type-caption tabular-nums text-muted-foreground">{range}</p>
                <p className={cn(type.bodySm, "mt-2 text-muted-foreground")}>{note}</p>
              </Surface>
            ))}
          </div>
        </LabSection>
      </div>
    </div>
  );
}
