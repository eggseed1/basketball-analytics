import type { ReactNode } from "react";
import { TeamLogo } from "@/components/brand/team-logo";
import type {
  BracketMatchup,
  BracketSlot,
  ConferenceBracket,
  PlayoffBracketModel,
} from "@/lib/playoff-bracket";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const CARD_W = "w-[8.25rem]";

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
      <div className="flex h-7 items-center truncate rounded-sm border border-dashed border-border/70 bg-muted/20 px-2 text-[11px] text-muted-foreground">
        {slot.label ?? "TBD"}
      </div>
    );
  }

  const brand = resolveTeamBrand(slot.team.teamId);
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-sm px-1.5 text-[12px] leading-none",
        slot.winner
          ? "bg-foreground/[0.08] font-semibold text-foreground"
          : "text-foreground/90"
      )}
      style={
        brand && slot.winner
          ? { boxShadow: `inset 3px 0 0 ${brand.primary}` }
          : undefined
      }
    >
      <span className="w-3.5 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
        {slot.team.seed}
      </span>
      <TeamLogo teamKey={slot.team.teamId} size="2xs" />
      <span className="min-w-0 flex-1 truncate font-medium tracking-tight">
        {slot.team.abbreviation}
      </span>
      {typeof slot.wins === "number" ? (
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {slot.wins}
        </span>
      ) : null}
    </div>
  );
}

function MatchCard({
  matchup,
  emphasize,
}: {
  matchup: BracketMatchup;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        CARD_W,
        "flex shrink-0 flex-col gap-px overflow-hidden rounded-md border bg-card shadow-sm",
        emphasize ? "border-foreground/30" : "border-border/70"
      )}
    >
      <TeamLine slot={matchup.top} />
      <TeamLine slot={matchup.bottom} />
      {matchup.result ? (
        <div className="border-t border-border/50 px-2 py-0.5 text-right text-[10px] tabular-nums text-muted-foreground">
          {matchup.result}
        </div>
      ) : null}
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
        "mb-2 h-4 shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground",
        align === "center" && "text-center",
        align === "right" && "text-right"
      )}
    >
      {children}
    </p>
  );
}

/** Fixed-height slot so R1 (4) / Semis (2) / CF (1) share one vertical rhythm. */
function Slot({
  children,
  span = 1,
}: {
  children?: ReactNode;
  /** How many of 4 first-round tracks this slot spans. */
  span?: 1 | 2 | 4;
}) {
  const h =
    span === 4 ? "h-[17.5rem]" : span === 2 ? "h-[8.75rem]" : "h-[4.375rem]";
  return (
    <div className={cn(h, "flex shrink-0 flex-col justify-center")}>
      {children ?? null}
    </div>
  );
}

function Elbow({
  toward,
  pairs,
}: {
  toward: "right" | "left";
  pairs: 1 | 2;
}) {
  const mirror = toward === "left";
  return (
    <div
      aria-hidden
      className="flex w-3 shrink-0 flex-col pt-6 sm:w-4"
      style={{ height: "calc(1rem + 17.5rem)" }}
    >
      {Array.from({ length: pairs }, (_, i) => (
        <div
          key={i}
          className="relative"
          style={{ height: `${100 / pairs}%` }}
        >
          <span
            className={cn(
              "absolute top-1/4 h-0 w-1/2 border-t border-border/70",
              mirror ? "right-0" : "left-0"
            )}
          />
          <span
            className={cn(
              "absolute top-3/4 h-0 w-1/2 border-t border-border/70",
              mirror ? "right-0" : "left-0"
            )}
          />
          <span
            className={cn(
              "absolute top-1/4 h-1/2 w-0 border-l border-border/70",
              mirror ? "right-1/2" : "left-1/2"
            )}
          />
          <span
            className={cn(
              "absolute top-1/2 h-0 w-1/2 border-t border-border/70",
              mirror ? "left-0" : "right-0"
            )}
          />
        </div>
      ))}
    </div>
  );
}

function Stem({ toward }: { toward: "right" | "left" }) {
  const mirror = toward === "left";
  return (
    <div
      aria-hidden
      className="relative w-3 shrink-0 sm:w-4"
      style={{ height: "calc(1rem + 17.5rem)" }}
    >
      <span
        className={cn(
          "absolute top-1/2 h-0 w-full border-t border-border/70",
          mirror ? "origin-right" : "origin-left"
        )}
      />
    </div>
  );
}

function RoundStack({
  title,
  align,
  matchups,
  span,
}: {
  title: string;
  align: "left" | "right" | "center";
  matchups: BracketMatchup[];
  span: 1 | 2 | 4;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      <RoundLabel align={align}>{title}</RoundLabel>
      <div className="flex flex-col">
        {matchups.map((m) => (
          <Slot key={m.id} span={span}>
            <MatchCard matchup={m} />
          </Slot>
        ))}
      </div>
    </div>
  );
}

function PlayInStack({
  bracket,
  align,
}: {
  bracket: ConferenceBracket;
  align: "left" | "right";
}) {
  const show = bracket.playIn.some(
    (m) => m.top.team || m.bottom.team || m.result
  );
  if (!show) return null;

  // 9/10 feeds 1-seed game (track 0); 7/8 feeds 2-seed game (track 3).
  return (
    <div className="flex shrink-0 flex-col">
      <RoundLabel align={align}>Play-In</RoundLabel>
      <Slot span={1}>
        <MatchCard matchup={bracket.playIn[0]!} />
      </Slot>
      <Slot span={1} />
      <Slot span={1} />
      <Slot span={1}>
        <MatchCard matchup={bracket.playIn[1]!} />
      </Slot>
    </div>
  );
}

function ConferenceSide({
  bracket,
  side,
}: {
  bracket: ConferenceBracket;
  side: "west" | "east";
}) {
  const toward = side === "west" ? "right" : "left";
  const align = side === "west" ? "left" : "right";
  const showPlayIn = bracket.playIn.some(
    (m) => m.top.team || m.bottom.team || m.result
  );

  const playIn = showPlayIn ? (
    <PlayInStack key="pi" bracket={bracket} align={align} />
  ) : null;
  const r1 = (
    <RoundStack
      key="r1"
      title="First Round"
      align={align}
      matchups={bracket.firstRound}
      span={1}
    />
  );
  const semis = (
    <RoundStack
      key="r2"
      title="Conf. Semis"
      align={align}
      matchups={[...bracket.semifinals]}
      span={2}
    />
  );
  const cf = (
    <RoundStack
      key="r3"
      title="Conf. Finals"
      align={align}
      matchups={[bracket.conferenceFinals]}
      span={4}
    />
  );

  const parts =
    side === "west"
      ? [
          playIn,
          showPlayIn ? <div key="pi-gap" className="w-2 shrink-0" /> : null,
          r1,
          <Elbow key="e1" toward={toward} pairs={2} />,
          semis,
          <Elbow key="e2" toward={toward} pairs={1} />,
          cf,
          <Stem key="stem" toward={toward} />,
        ]
      : [
          <Stem key="stem" toward={toward} />,
          cf,
          <Elbow key="e2" toward={toward} pairs={1} />,
          semis,
          <Elbow key="e1" toward={toward} pairs={2} />,
          r1,
          showPlayIn ? <div key="pi-gap" className="w-2 shrink-0" /> : null,
          playIn,
        ];

  return (
    <div className="flex shrink-0 flex-col">
      <p
        className={cn(
          "mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/70",
          align === "right" && "text-right"
        )}
      >
        {bracket.conference}
      </p>
      <div className="flex items-start">{parts}</div>
    </div>
  );
}

function FinalsBlock({ matchup }: { matchup: BracketMatchup }) {
  return (
    <div
      className="flex shrink-0 flex-col items-center"
      style={{ paddingTop: "1.75rem" }}
    >
      <RoundLabel align="center">Finals</RoundLabel>
      <Slot span={4}>
        <MatchCard matchup={matchup} emphasize />
      </Slot>
    </div>
  );
}

export function PlayoffBracket({ model }: { model: PlayoffBracketModel }) {
  const copy = modeCopy(model);

  return (
    <section className="sports-card flex flex-col gap-3 p-3 sm:p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {copy.eyebrow}
        </p>
        <h2 className="text-[16px] font-bold tracking-tight sm:text-[18px]">
          {copy.title}
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {copy.detail}
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex w-max items-start gap-0">
          <ConferenceSide bracket={model.west} side="west" />
          <FinalsBlock matchup={model.finals} />
          <ConferenceSide bracket={model.east} side="east" />
        </div>
      </div>
    </section>
  );
}
