"use client";

import { Moon, Sun } from "lucide-react";

import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamIdentity } from "@/components/teams/team-identity";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/text-link";
import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { boardType, type } from "@/lib/design-system";
import type { ColorScheme, SurfaceStyle } from "@/lib/owner-theme";
import { cn } from "@/lib/utils";

const SCHEMES: Array<{ id: ColorScheme; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const SURFACES: Array<{ id: SurfaceStyle; label: string }> = [
  { id: "solid", label: "Solid" },
  { id: "glass", label: "Glass" },
];

const TYPE_ROWS: Array<{
  name: string;
  className: string;
  size: string;
  sample: string;
}> = [
  { name: "Display", className: type.display, size: "32", sample: "Luka Dončić" },
  { name: "Page", className: type.page, size: "24", sample: "Upcoming Games" },
  { name: "Heading", className: type.heading, size: "20", sample: "Recent NBA Transactions" },
  { name: "Title", className: type.title, size: "18", sample: "East standings" },
  { name: "Body", className: type.body, size: "16", sample: "Waived G Ethan Thompson." },
  { name: "Body sm", className: type.bodySm, size: "14", sample: "See all transactions →" },
  { name: "Caption", className: type.caption, size: "12", sample: "2026-08-13" },
];

const BOARD_TYPE_ROWS: Array<{
  name: string;
  className: string;
  size: string;
  sample: string;
}> = [
  {
    name: "Board head",
    className: boardType.head,
    size: "9.5 → 12",
    sample: "PTS · AST · TRB",
  },
  {
    name: "Board cell",
    className: boardType.cell,
    size: "10.5 → 12",
    sample: "23.1 · 4.3 · 5.2",
  },
  {
    name: "Board name",
    className: boardType.name,
    size: "11 → 16",
    sample: "Victor Oladipo",
  },
];

const TOKEN_SWATCHES: Array<{ label: string; bg: string; fg?: string }> = [
  { label: "Background", bg: "bg-background", fg: "text-foreground" },
  { label: "Card", bg: "bg-card", fg: "text-card-foreground" },
  { label: "Secondary", bg: "bg-secondary", fg: "text-secondary-foreground" },
  { label: "Muted", bg: "bg-muted", fg: "text-muted-foreground" },
  { label: "Primary", bg: "bg-primary", fg: "text-primary-foreground" },
  { label: "Destructive", bg: "bg-destructive", fg: "text-white" },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="inline-flex rounded-lg bg-secondary p-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[14px] font-semibold transition-colors",
              value === opt.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AppleScoreMock({ glass }: { glass: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-xl p-4 sm:p-6"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, #552583 42%, #1d1d1f) 0%, color-mix(in oklab, #0e2240 48%, #1d1d1f) 100%)",
      }}
    >
      <div
        className={cn(
          "flex flex-col gap-3 px-4 py-4",
          glass ? "glass-card" : "sports-card"
        )}
      >
        <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
          Final · West
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="type-heading">LAL</span>
          <span className="type-display tabular-nums">108</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="type-heading">DEN</span>
          <span className="type-display tabular-nums">104</span>
        </div>
        <p className="type-body-sm text-muted-foreground">
          Click a team name in the live site to open that club page.
        </p>
      </div>
    </div>
  );
}

export function DesignSystemLab() {
  const { scheme, surface, setScheme, setSurface } = useOwnerTheme();

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
          Internal · not in public navigation
        </p>
        <h1 className="type-page">Design system</h1>
        <p className="type-body max-w-2xl text-muted-foreground">
          Light / dark lives next to search in the header. Glass is the default
          surface; solid is still available here. Preferences persist in this
          browser so you can leave this page and preview Home, Scores, and
          team pages.
        </p>
      </header>

      <section className="sports-card flex flex-col gap-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="type-heading">Appearance</h2>
            <p className="type-body-sm mt-1 text-muted-foreground">
              Default is light + glass. These controls only change this
              browser.
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
          <Segmented
            label="Color"
            value={scheme}
            options={SCHEMES}
            onChange={setScheme}
          />
          <Segmented
            label="Surface"
            value={surface}
            options={SURFACES}
            onChange={setSurface}
          />
        </div>
        <p className="type-body-sm text-muted-foreground">
          Glass remaps <code className="font-semibold">.sports-card</code> site-wide
          while this preference is on. Home uses an NBA blue/red wash; team and
          player pages use a light club-color wash so the frost has color to
          sample. Open{" "}
          <TextLink href="/">Home</TextLink> or{" "}
          <TextLink href="/scores">Scores</TextLink> to judge it in context.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="type-heading">Type scale</h2>
        <p className="type-body-sm text-muted-foreground">
          Even pixel sizes only. Body copy is 16. No odd sizes, no rem decimals.
        </p>
        <div className="overflow-hidden rounded-md border border-border">
          {TYPE_ROWS.map((row) => (
            <div
              key={row.name}
              className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <p className="w-28 shrink-0 type-caption font-semibold uppercase tracking-wide text-muted-foreground">
                {row.name} · {row.size}
              </p>
              <p className={row.className}>{row.sample}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="type-heading">Board type scale</h2>
        <p className="type-body-sm text-muted-foreground">
          Separate from web type. Dense BRef-like sizes on mobile; steps up at{" "}
          <code className="type-caption">sm</code>. Use{" "}
          <code className="type-caption">boardType</code> for stats tables — never{" "}
          <code className="type-caption">type.body</code>.
        </p>
        <div className="overflow-hidden rounded-md border border-border">
          {BOARD_TYPE_ROWS.map((row) => (
            <div
              key={row.name}
              className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <p className="w-36 shrink-0 type-caption font-semibold uppercase tracking-wide text-muted-foreground">
                {row.name} · {row.size}
              </p>
              <p className={row.className}>{row.sample}</p>
            </div>
          ))}
        </div>
        <div className="board-scroll-frame overflow-x-auto rounded-md border border-border">
          <table className="board-stats w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {["Season", "Tm", "G", "MP", "PTS", "AST", "TRB"].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "border-b border-border px-1 py-1 font-semibold uppercase text-muted-foreground",
                      boardType.head
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={cn("px-1 py-0.5", boardType.cell)}>2017-18</td>
                <td className={cn("px-1 py-0.5 font-semibold", boardType.cell)}>
                  IND
                </td>
                <td className={cn("px-1 py-0.5 tabular-nums", boardType.cell)}>
                  75
                </td>
                <td className={cn("px-1 py-0.5 tabular-nums", boardType.cell)}>
                  34.0
                </td>
                <td className={cn("px-1 py-0.5 tabular-nums", boardType.cell)}>
                  23.1
                </td>
                <td className={cn("px-1 py-0.5 tabular-nums", boardType.cell)}>
                  4.3
                </td>
                <td className={cn("px-1 py-0.5 tabular-nums", boardType.cell)}>
                  5.2
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="type-heading">Color</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOKEN_SWATCHES.map((swatch) => (
            <div
              key={swatch.label}
              className={cn(
                "rounded-md border border-border px-4 py-5",
                swatch.bg,
                swatch.fg
              )}
            >
              <p className="type-caption font-semibold uppercase tracking-wide opacity-70">
                {swatch.label}
              </p>
              <p className="type-title mt-2">Aa</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="type-heading">Links</h2>
        <p className="type-body max-w-2xl">
          Clickable names use{" "}
          <TextLink href="/teams/13">underlined semibold TextLink</TextLink>
          . Team mentions stay hoverable and clickable. Players who have never
          appeared in an NBA game stay hoverable only:{" "}
          <PlayerIdentity
            name="Two-Way Prospect"
            hasPlayedNba={false}
            variant="compact"
            className="inline-flex align-baseline"
            nameClassName="inline"
          >
            Two-Way Prospect
          </PlayerIdentity>
          .
        </p>
        <p className="type-body">
          Played example:{" "}
          <PlayerIdentity
            playerId="1629029"
            name="Luka Dončić"
            teamKey="dal"
            teamLabel="DAL"
            variant="compact"
            className="inline-flex align-baseline"
            nameClassName="inline"
          >
            Luka Dončić
          </PlayerIdentity>
          {" · "}
          <TeamIdentity teamKey="lal" label="Lakers" />
        </p>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <span className="sports-pill">sports-pill</span>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="type-heading">Solid vs glass</h2>
        <p className="type-body-sm text-muted-foreground">
          Apple Sports puts frosted cards on a colored stage. Left is the
          current solid card. Right is the glass material.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
              Solid
            </p>
            <AppleScoreMock glass={false} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
              Glass
            </p>
            <AppleScoreMock glass />
          </div>
        </div>
      </section>
    </div>
  );
}
