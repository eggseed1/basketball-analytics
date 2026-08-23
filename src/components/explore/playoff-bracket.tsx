import { TeamLogo } from "@/components/brand/team-logo";
import type {
  BracketMatchup,
  BracketSlot,
  ConferenceBracket,
  PlayoffBracketModel,
} from "@/lib/playoff-bracket";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

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

function TeamLine({
  slot,
  compact,
}: {
  slot: BracketSlot;
  compact?: boolean;
}) {
  if (!slot.team) {
    return (
      <div
        className={cn(
          "flex h-5 items-center truncate rounded border border-dashed border-border/70 px-1 text-[9px] text-muted-foreground",
          compact && "h-4 text-[8px]"
        )}
      >
        {slot.label ?? "TBD"}
      </div>
    );
  }

  const brand = resolveTeamBrand(slot.team.teamId);
  return (
    <div
      className={cn(
        "flex h-5 items-center gap-1 rounded px-1 text-[9px] leading-none",
        compact && "h-4 gap-0.5 text-[8px]",
        slot.winner
          ? "bg-foreground/10 font-semibold text-foreground"
          : "text-foreground/85"
      )}
      style={
        brand && slot.winner
          ? { boxShadow: `inset 2px 0 0 ${brand.primary}` }
          : undefined
      }
    >
      <span className="w-3 shrink-0 text-center text-[8px] tabular-nums text-muted-foreground">
        {slot.team.seed}
      </span>
      <TeamLogo teamKey={slot.team.teamId} size="2xs" />
      <span className="min-w-0 truncate">{slot.team.abbreviation}</span>
      {typeof slot.wins === "number" ? (
        <span className="ml-auto tabular-nums text-[8px] text-muted-foreground">
          {slot.wins}
        </span>
      ) : null}
    </div>
  );
}

function MiniMatchup({
  matchup,
  compact,
}: {
  matchup: BracketMatchup;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-px rounded border border-border/60 bg-card/60 p-0.5">
      <TeamLine slot={matchup.top} compact={compact} />
      <TeamLine slot={matchup.bottom} compact={compact} />
      {matchup.result ? (
        <div className="px-1 text-right text-[8px] tabular-nums text-muted-foreground">
          {matchup.result}
        </div>
      ) : null}
    </div>
  );
}

function ConferenceColumn({
  bracket,
  align,
}: {
  bracket: ConferenceBracket;
  align: "left" | "right";
}) {
  const showPlayIn =
    bracket.playIn.some(
      (m) => m.top.team || m.bottom.team || m.result
    );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p
        className={cn(
          "text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
          align === "right" && "text-right"
        )}
      >
        {bracket.conference}
      </p>

      {showPlayIn ? (
        <div className="grid grid-cols-2 gap-1">
          {bracket.playIn.map((m) => (
            <MiniMatchup key={m.id} matchup={m} compact />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-1">
        {bracket.firstRound.map((m) => (
          <MiniMatchup key={m.id} matchup={m} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1">
        {bracket.semifinals.map((m) => (
          <MiniMatchup key={m.id} matchup={m} compact />
        ))}
      </div>

      <MiniMatchup matchup={bracket.conferenceFinals} />
    </div>
  );
}

export function PlayoffBracket({ model }: { model: PlayoffBracketModel }) {
  const copy = modeCopy(model);

  return (
    <section className="sports-card flex flex-col gap-2.5 p-3 sm:p-4">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] sm:items-start sm:gap-2">
        <ConferenceColumn bracket={model.west} align="left" />

        <div className="order-first flex flex-col items-center gap-1 sm:order-none sm:self-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Finals
          </p>
          <MiniMatchup matchup={model.finals} compact />
        </div>

        <ConferenceColumn bracket={model.east} align="right" />
      </div>
    </section>
  );
}
