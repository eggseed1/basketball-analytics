"use client";

import type { CSSProperties, ReactNode } from "react";

import { LinkedHover } from "@/components/continuity/linked-hover";
import { TeamLogo } from "@/components/brand/team-logo";
import type {
  BracketMatchup,
  BracketSlot,
  ConferenceBracket,
  PlayoffBracketModel,
} from "@/lib/playoff-bracket";
import { brandWashColor, buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

/**
 * Vertical rhythm: every first-round track is the same height so R1 / Semis / CF
 * align. Sized to fit MatchCard including a reserved series-result row.
 */
const TRACK = "5.25rem";
/** RoundLabel height plus its bottom margin. */
const LABEL = "1.5rem";
const COLUMN_H = `calc(${LABEL} + 4 * ${TRACK})`;

/**
 * Narrowest a card column gets. Narrow containers zoom the whole grid down in
 * steps (globals.css, keyed to this width and the card count), then scroll.
 */
const CARD_MIN = "6.25rem";
const LINE_W = "1rem";
const GAP_W = "0.5rem";

function modeCopy(model: PlayoffBracketModel): {
  eyebrow: string;
  title: string;
  detail: string;
} {
  if (model.mode === "complete") {
    return {
      eyebrow: "Playoffs",
      title: `${model.season} bracket`,
      detail: "Results from completed postseason games.",
    };
  }
  if (model.mode === "postseason") {
    return {
      eyebrow: "Playoffs",
      title: `${model.season} bracket`,
      detail: "Updates as postseason games are recorded.",
    };
  }
  return {
    eyebrow: "Playoff race",
    title: `${model.season} projection`,
    detail:
      model.source === "standings"
        ? "First-round matchups from current standings. Later rounds open until the postseason."
        : "Seeded from the team board until standings populate.",
  };
}

function TeamLine({ slot }: { slot: BracketSlot }) {
  if (!slot.team) {
    return (
      <div className="flex h-7 items-center truncate rounded-sm border border-dashed border-border/70 bg-white/25 px-1.5 text-[11px] text-muted-foreground dark:bg-secondary">
        {slot.label ?? "TBD"}
      </div>
    );
  }

  const wash = brandWashColor(resolveTeamBrand(slot.team.teamId));

  return (
    <div
      data-link-key={`team-${slot.team.teamId}`}
      data-bracket-line
      data-winner={slot.winner || undefined}
      className={cn(
        "relative flex h-7 min-w-0 items-center gap-1 rounded-sm pl-2 pr-1.5 text-[12px] leading-none",
        slot.winner ? "font-semibold text-foreground" : "text-foreground/90"
      )}
      style={{ "--wash": wash } as CSSProperties}
    >
      <span aria-hidden data-bracket-edge className="absolute inset-y-0 left-0 rounded-l-sm" />
      <span className="w-3 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
        {slot.team.seed}
      </span>
      <TeamLogo teamKey={slot.team.teamId} size="2xs" />
      <span className="min-w-0 flex-1 truncate font-medium tracking-tight">
        {slot.team.abbreviation}
      </span>
      {typeof slot.wins === "number" ? (
        <span
          className={cn(
            "tabular-nums text-[11px]",
            slot.winner ? "font-bold text-foreground" : "text-muted-foreground"
          )}
        >
          {slot.wins}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Flat team-tinted card. It sits on the frosted bracket panel, so it needs no
 * backdrop blur of its own; dozens of nested blurs made scrolling and the
 * panel's fade-in stutter.
 */
function MatchCard({
  matchup,
  emphasize,
}: {
  matchup: BracketMatchup;
  emphasize?: boolean;
}) {
  const theme = buildGameMatchupTheme(matchup.top.team?.teamId, matchup.bottom.team?.teamId);
  const base = "var(--material-standard-bg)";
  const mix = (color: string | undefined, token: string) =>
    color ? `color-mix(in oklab, ${color} var(${token}), ${base})` : base;

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-lg",
        emphasize && "ring-1 ring-foreground/25"
      )}
      style={{
        background: `linear-gradient(180deg, ${mix(theme.awayWash, "--glass-tint-edge")} 0%, ${mix(theme.awayWash, "--glass-tint-inner")} 46%, ${mix(theme.homeWash, "--glass-tint-inner")} 54%, ${mix(theme.homeWash, "--glass-tint-edge")} 100%)`,
        border: "var(--glass-edge-border)",
      }}
    >
      <div className="flex flex-col gap-0.5 p-1">
        <TeamLine slot={matchup.top} />
        <TeamLine slot={matchup.bottom} />
        {/* Always reserve result height so Slot tracks stay aligned. */}
        <div
          className={cn(
            "flex h-3.5 items-center justify-end px-1.5 text-[10px] tabular-nums",
            matchup.result ? "font-semibold text-foreground/70" : "text-transparent"
          )}
          aria-hidden={!matchup.result}
        >
          {matchup.result ?? "0-0"}
        </div>
      </div>
    </div>
  );
}

function RoundLabel({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "center" | "right";
}) {
  return (
    <p
      className={cn(
        "mb-2 h-4 shrink-0 truncate text-[10px] leading-4 font-bold uppercase tracking-[0.12em] text-muted-foreground",
        align === "center" && "text-center",
        align === "right" && "text-right"
      )}
    >
      {children}
    </p>
  );
}

/** Fixed-height slot so R1 (4) / Semis (2) / CF (1) share one vertical rhythm. */
function Slot({ children, span = 1 }: { children?: ReactNode; span?: 1 | 2 | 4 }) {
  return (
    <div
      className="flex min-w-0 flex-col justify-center"
      style={{ height: span === 1 ? TRACK : `calc(${span} * ${TRACK})` }}
    >
      {children ?? null}
    </div>
  );
}

const LINE = "border-foreground/25 dark:border-white/30";

function Elbow({ toward, pairs }: { toward: "right" | "left"; pairs: 1 | 2 }) {
  const mirror = toward === "left";
  return (
    <div aria-hidden className="flex flex-col" style={{ height: COLUMN_H, paddingTop: LABEL }}>
      {Array.from({ length: pairs }, (_, i) => (
        <div key={i} className="relative" style={{ height: `${100 / pairs}%` }}>
          <span className={cn("absolute top-1/4 h-0 w-1/2 border-t", LINE, mirror ? "right-0" : "left-0")} />
          <span className={cn("absolute top-3/4 h-0 w-1/2 border-t", LINE, mirror ? "right-0" : "left-0")} />
          <span className={cn("absolute top-1/4 h-1/2 w-0 border-l", LINE, mirror ? "right-1/2" : "left-1/2")} />
          <span className={cn("absolute top-1/2 h-0 w-1/2 border-t", LINE, mirror ? "left-0" : "right-0")} />
        </div>
      ))}
    </div>
  );
}

function Stem() {
  return (
    <div aria-hidden style={{ height: COLUMN_H, paddingTop: LABEL }}>
      <div className="relative h-full">
        <span className={cn("absolute top-1/2 h-0 w-full border-t", LINE)} />
      </div>
    </div>
  );
}

function RoundColumn({
  title,
  align,
  children,
}: {
  title: string;
  align: "left" | "right" | "center";
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <RoundLabel align={align}>{title}</RoundLabel>
      {children}
    </div>
  );
}

function roundSlots(matchups: BracketMatchup[], span: 1 | 2 | 4) {
  return matchups.map((m) => (
    <Slot key={m.id} span={span}>
      <MatchCard matchup={m} />
    </Slot>
  ));
}

function hasPlayIn(bracket: ConferenceBracket): boolean {
  return bracket.playIn.some((m) => m.top.team || m.bottom.team || m.result);
}

type Column = { key: string; width: string; node: ReactNode };

function conferenceColumns(bracket: ConferenceBracket, side: "west" | "east"): Column[] {
  const align = side === "west" ? "left" : "right";
  const toward = side === "west" ? "right" : "left";
  const card = `minmax(${CARD_MIN}, 1fr)`;
  // 9/10 feeds the 1-seed game (track 0); 7/8 feeds the 2-seed game (track 3);
  // the 8-seed decider sits between them.
  const playIn: Column[] = hasPlayIn(bracket)
    ? [
        {
          key: "pi",
          width: card,
          node: (
            <RoundColumn title="Play-In" align={align}>
              <Slot>
                <MatchCard matchup={bracket.playIn[0]!} />
              </Slot>
              <Slot>{bracket.playInFinal ? <MatchCard matchup={bracket.playInFinal} /> : null}</Slot>
              <Slot />
              <Slot>
                <MatchCard matchup={bracket.playIn[1]!} />
              </Slot>
            </RoundColumn>
          ),
        },
        { key: "pi-gap", width: GAP_W, node: null },
      ]
    : [];
  const rounds: Column[] = [
    {
      key: "r1",
      width: card,
      node: (
        <RoundColumn title="First Round" align={align}>
          {roundSlots(bracket.firstRound, 1)}
        </RoundColumn>
      ),
    },
    { key: "e1", width: LINE_W, node: <Elbow toward={toward} pairs={2} /> },
    {
      key: "r2",
      width: card,
      node: (
        <RoundColumn title="Conf. Semis" align={align}>
          {roundSlots([...bracket.semifinals], 2)}
        </RoundColumn>
      ),
    },
    { key: "e2", width: LINE_W, node: <Elbow toward={toward} pairs={1} /> },
    {
      key: "r3",
      width: card,
      node: (
        <RoundColumn title="Conf. Finals" align={align}>
          {roundSlots([bracket.conferenceFinals], 4)}
        </RoundColumn>
      ),
    },
    { key: "stem", width: LINE_W, node: <Stem /> },
  ];
  const columns = [...playIn, ...rounds];
  return (side === "west" ? columns : columns.reverse()).map((c) => ({ ...c, key: `${side}-${c.key}` }));
}

export function PlayoffBracket({ model }: { model: PlayoffBracketModel }) {
  const copy = modeCopy(model);
  const west = conferenceColumns(model.west, "west");
  const east = conferenceColumns(model.east, "east");
  const finals: Column = {
    key: "finals",
    width: `minmax(${CARD_MIN}, 1fr)`,
    node: (
      <RoundColumn title="Finals" align="center">
        <Slot span={4}>
          <MatchCard matchup={model.finals} emphasize />
        </Slot>
      </RoundColumn>
    ),
  };
  const columns = [...west, finals, ...east];
  const cards = columns.filter((c) => c.width.startsWith("minmax")).length;
  const conferenceLabel = "truncate text-[11px] leading-4 font-bold uppercase tracking-[0.16em] text-foreground/70";

  return (
    <section className="sports-card flex flex-col gap-3 p-3 sm:p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {copy.eyebrow}
        </p>
        <h2 className="text-[16px] font-bold tracking-tight sm:text-[18px]">{copy.title}</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {copy.detail}
          <span className="sm:hidden"> Swipe sideways to see the whole bracket.</span>
        </p>
      </div>

      <div data-bracket-fit className="-mx-3 overflow-x-auto overscroll-x-contain px-3 sm:-mx-4 sm:px-4">
        <div data-bracket-grid data-cards={cards >= 8 ? "9" : "7"} className="leading-none">
          <LinkedHover
            className="grid items-start gap-y-1"
            style={{ gridTemplateColumns: columns.map((c) => c.width).join(" ") }}
          >
            <p className={conferenceLabel} style={{ gridRow: 1, gridColumn: `1 / span ${west.length}` }}>
              {model.west.conference}
            </p>
            <p
              className={cn(conferenceLabel, "text-right")}
              style={{ gridRow: 1, gridColumn: `${west.length + 2} / span ${east.length}` }}
            >
              {model.east.conference}
            </p>
            {columns.map((c, i) => (
              <div key={c.key} className="min-w-0" style={{ gridRow: 2, gridColumn: i + 1 }}>
                {c.node}
              </div>
            ))}
          </LinkedHover>
        </div>
      </div>
    </section>
  );
}

const SKELETON_TEXT = "rounded bg-secondary text-transparent";

/** Same footprint as {@link PlayoffBracket} at every width, so streaming it in doesn't move the page. */
export function PlayoffBracketSkeleton() {
  return (
    <section
      data-skeleton
      className="sports-card flex flex-col gap-3 p-3 sm:p-4"
      aria-busy="true"
      aria-label="Loading playoff bracket"
    >
      <div aria-hidden className="animate-pulse">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]">
          <span className={SKELETON_TEXT}>Playoffs</span>
        </p>
        <h2 className="text-[16px] font-bold tracking-tight sm:text-[18px]">
          <span className={SKELETON_TEXT}>2025-26 bracket</span>
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug">
          <span className={SKELETON_TEXT}>Results from completed postseason games.</span>
        </p>
      </div>
      <div data-bracket-fit className="-mx-3 overflow-hidden px-3 sm:-mx-4 sm:px-4">
        <div data-bracket-grid data-cards="9">
          <div
            className="animate-pulse rounded-lg bg-secondary/50"
            style={{ height: `calc(1rem + 0.25rem + ${COLUMN_H})`, minWidth: "63.25rem" }}
          />
        </div>
      </div>
    </section>
  );
}
