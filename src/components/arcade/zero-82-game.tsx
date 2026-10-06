"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { playerLabel, type ArcadeLeague } from "@/arcade/league";
import { teamName } from "@/arcade/teams";
import {
  BENCH_BPM,
  projectedRecord,
  rosterOffers,
  spinTeamSeason,
  STARTER_MINUTES,
  WINS_PER_POINT,
  zero82TeamSeasons,
  ZERO_82_MIN_GAMES,
  ZERO_82_MIN_MINUTES,
  ZERO_82_SLOTS,
  type RosterOffer,
  type TeamSeason,
  type Zero82Slot,
} from "@/arcade/zero-82";
import { ArcadeLoading, PlayerAvatar, useBestScore } from "@/components/arcade/arcade-parts";
import { CourtLineup, type LineupPick } from "@/components/arcade/court-lineup";
import {
  reelStrip,
  SlotMachine,
  slotSpinMs,
  SpinButton,
  type SlotReel,
} from "@/components/arcade/slot-machine";
import { arcadeTeamLook } from "@/components/arcade/team-look";
import { useArcadeLeague } from "@/components/arcade/use-arcade-league";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Mode = "worst" | "best";
type Picks = Partial<Record<Zero82Slot, LineupPick>>;

const CELL = 72;

export function Zero82Game() {
  const { league, failed, retry } = useArcadeLeague();
  if (!league) return <ArcadeLoading failed={failed} onRetry={retry} />;
  return <Zero82Board league={league} />;
}

function TeamCell({ ts }: { ts: TeamSeason }) {
  const look = arcadeTeamLook(ts.team, ts.season);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {look.brand ? (
        <HistoricalTeamMark brand={look.brand} size="md" />
      ) : (
        <span className="size-9 rounded-md" style={{ background: look.primary }} />
      )}
      <span className="min-w-0 truncate text-[15px] font-bold tracking-tight">{teamName(ts.team)}</span>
    </span>
  );
}

function SeasonCell({ season }: { season: string }) {
  return <span className="score-num text-[1.6rem] leading-none tracking-tight">{season}</span>;
}

function idleReels(): SlotReel[] {
  const blank = <span className="text-[1.4rem] font-black text-neutral-400">?</span>;
  return [
    { cells: [blank, blank, blank], className: "flex-[1.7]" },
    { cells: [blank, blank, blank] },
  ];
}

function Zero82Board({ league }: { league: ArcadeLeague }) {
  const teamSeasons = useMemo(() => zero82TeamSeasons(league), [league]);
  const seasons = useMemo(() => [...new Set(teamSeasons.map((ts) => ts.season))], [teamSeasons]);
  const [mode, setMode] = useState<Mode>("worst");
  const [picks, setPicks] = useState<Picks>({});
  const [team, setTeam] = useState<TeamSeason | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [reels, setReels] = useState<SlotReel[]>(idleReels);
  const [hover, setHover] = useState<Zero82Slot | null>(null);
  const [skips, setSkips] = useState(1);
  const [bestWorst, saveWorst] = useBestScore("drbl-arcade-0-82-best", "lower");
  const [bestBest, saveBest] = useBestScore("drbl-arcade-82-0-best", "higher");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const openSlots = ZERO_82_SLOTS.filter((slot) => !picks[slot]);
  const usedPids = new Set(Object.values(picks).map((p) => p!.row.pid));
  const done = openSlots.length === 0;
  const record = done ? projectedRecord(ZERO_82_SLOTS.map((slot) => picks[slot]!.row.bpm!)) : null;

  function spin() {
    if (spinning || done) return;
    const target = spinTeamSeason(teamSeasons, openSlots, usedPids);
    setTeam(null);
    setHover(null);
    setReels([
      {
        cells: reelStrip(teamSeasons, target).map((ts, i) => <TeamCell key={i} ts={ts} />),
        className: "flex-[1.7]",
      },
      { cells: reelStrip(seasons, target.season, 30).map((s, i) => <SeasonCell key={i} season={s} />) },
    ]);
    setSpinId((id) => id + 1);
    setSpinning(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSpinning(false);
      setTeam(target);
    }, slotSpinMs(2));
  }

  function pick(offer: RosterOffer) {
    if (!team || offer.blocked) return;
    const slot = offer.row.pos as Zero82Slot;
    const next = { ...picks, [slot]: { row: offer.row, team: team.team } };
    setPicks(next);
    setTeam(null);
    setHover(null);
    if (ZERO_82_SLOTS.every((s) => next[s])) {
      const { wins } = projectedRecord(ZERO_82_SLOTS.map((s) => next[s]!.row.bpm!));
      if (mode === "worst") saveWorst(wins);
      else saveBest(wins);
    }
  }

  function reset(nextMode: Mode = mode) {
    setMode(nextMode);
    setPicks({});
    setTeam(null);
    setSkips(1);
    setSpinId(0);
    setReels(idleReels());
  }

  const goal = mode === "worst" ? "0–82" : "82–0";
  const best = mode === "worst" ? bestWorst : bestBest;
  const offers = team ? rosterOffers(team, openSlots, usedPids) : [];
  const look = team ? arcadeTeamLook(team.team, team.season) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="sports-card flex flex-wrap items-end justify-between gap-3 px-4 py-3">
        <SegmentedControl
          label="Goal"
          value={mode}
          onChange={(id) => reset(id)}
          options={[
            { id: "worst", label: "Worst team (0–82)" },
            { id: "best", label: "Best team (82–0)" },
          ]}
        />
        <p className={cn(type.caption, "text-muted-foreground")}>
          {best != null ? `Your best: ${best}–${82 - best}` : `Aim for ${goal}`}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-20">
          <CourtLineup league={league} picks={picks} highlight={hover} showBpm={done} />
          {record ? <ResultCard mode={mode} record={record} onReplay={() => reset()} /> : null}
        </div>

        {record ? null : (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
                Pick {5 - openSlots.length + 1} of 5
              </p>
              <p className={cn(type.caption, "text-muted-foreground")}>
                Open: {openSlots.join(", ")}
              </p>
            </div>
            <SlotMachine reels={reels} spinId={spinId} spinning={spinning} cellHeight={CELL} />
            <div className="flex items-center gap-2">
              {team ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  disabled={skips === 0}
                  onClick={() => {
                    setSkips(skips - 1);
                    spin();
                  }}
                >
                  Skip team ({skips} left)
                </Button>
              ) : (
                <SpinButton spinning={spinning} onClick={spin} className="flex-1" />
              )}
            </div>

            <p className="sr-only" aria-live="polite">
              {team ? `${team.season} ${teamName(team.team)}` : ""}
            </p>

            {team && look ? (
              <div
                className="sports-card relative isolate overflow-hidden px-3 py-3"
                style={{ "--orb-color": look.primary } as CSSProperties}
              >
                <span aria-hidden className="strip-orb -z-10" style={{ right: -40, top: -40 }} />
                <div className="mb-2.5 flex items-center gap-2.5 px-1">
                  {look.brand ? <HistoricalTeamMark brand={look.brand} size="sm" /> : null}
                  <h2 className={cn(type.body, "min-w-0 truncate font-semibold")}>
                    {team.season} {teamName(team.team)}
                  </h2>
                  <span className={cn(type.caption, "ml-auto shrink-0 text-muted-foreground")}>
                    {offers.filter((o) => !o.blocked).length} of {offers.length} fit
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {offers.map((offer) => (
                    <li key={offer.row.pid}>
                      <OfferButton
                        league={league}
                        offer={offer}
                        color={look.primary}
                        ink={look.ink}
                        onPick={() => pick(offer)}
                        onHover={(on) => setHover(on && !offer.blocked ? (offer.row.pos as Zero82Slot) : null)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className={cn(type.caption, "text-muted-foreground")}>
              Each team shows its rotation players (at least {ZERO_82_MIN_MINUTES} minutes and{" "}
              {ZERO_82_MIN_GAMES} games). A player fills only his listed position.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function OfferButton({
  league,
  offer,
  color,
  ink,
  onPick,
  onHover,
}: {
  league: ArcadeLeague;
  offer: RosterOffer;
  color: string;
  ink: string;
  onPick: () => void;
  onHover: (on: boolean) => void;
}) {
  const { row, blocked } = offer;
  const player = league.players[row.pid];
  const mpg = row.gp ? row.mp / row.gp : null;
  const line = [
    row.pts != null ? `${row.pts.toFixed(1)} PTS` : null,
    row.trb != null ? `${row.trb.toFixed(1)} REB` : null,
    row.ast != null ? `${row.ast.toFixed(1)} AST` : null,
    mpg != null ? `${mpg.toFixed(1)} MIN` : null,
  ].filter(Boolean);
  const reason = blocked === "on-team" ? "On your team" : blocked === "slot-filled" ? `${row.pos} filled` : null;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={blocked != null}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border border-border/80 bg-background/80 px-2.5 py-2 text-left transition-[background-color,transform,box-shadow]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        blocked
          ? "cursor-not-allowed opacity-50"
          : "hover:-translate-y-px hover:bg-background hover:shadow-[0_6px_16px_-10px_rgb(0_0_0/0.45)]"
      )}
    >
      <span
        className="score-num flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[13px]"
        style={blocked ? undefined : { background: color, color: ink }}
      >
        <span className={cn(blocked && "text-muted-foreground")}>{row.pos}</span>
      </span>
      <PlayerAvatar player={player} className={cn("size-10 text-sm", blocked && "grayscale")} />
      <span className="min-w-0 flex-1">
        <span className={cn(type.bodySm, "block truncate font-semibold")}>{playerLabel(league, row.pid)}</span>
        <span className={cn(type.caption, "block truncate text-muted-foreground")}>
          {line.join(" · ")} · {row.gp} GP
        </span>
      </span>
      {reason ? (
        <span className="shrink-0 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {reason}
        </span>
      ) : (
        <span className="shrink-0 text-[12px] font-semibold text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Sign
        </span>
      )}
    </button>
  );
}

function ResultCard({
  mode,
  record,
  onReplay,
}: {
  mode: Mode;
  record: { wins: number; losses: number; net: number };
  onReplay: () => void;
}) {
  const perfect = mode === "worst" ? record.wins === 0 : record.wins === 82;
  return (
    <div className="sports-card arcade-pop flex flex-col items-center gap-3 px-4 py-5 text-center">
      <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        Projected record
      </p>
      <p className="score-num text-[3.5rem] leading-none">
        {record.wins}–{record.losses}
      </p>
      <div
        className="flex h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-foreground/[0.08]"
        role="img"
        aria-label={`${record.wins} wins, ${record.losses} losses`}
      >
        <span className="h-full bg-[var(--chart-3)]" style={{ width: `${(record.wins / 82) * 100}%` }} />
        <span className="h-full bg-destructive/70" style={{ width: `${(record.losses / 82) * 100}%` }} />
      </div>
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        {perfect
          ? mode === "worst"
            ? "A winless season. That is hard to do."
            : "Undefeated. That is hard to do."
          : `Net rating ${record.net > 0 ? "+" : ""}${record.net.toFixed(1)}`}
      </p>
      <Button size="lg" onClick={onReplay}>
        Play again
      </Button>
      <p className={cn(type.caption, "max-w-prose text-muted-foreground")}>
        Each starter plays {STARTER_MINUTES} minutes at his Box Plus/Minus for that season. A
        replacement-level bench ({BENCH_BPM} BPM) covers the other minutes, and each point of net
        rating is worth {WINS_PER_POINT} wins over 82 games. BPM compares a player to the league
        average of his own season, so eras mix fairly.
      </p>
    </div>
  );
}
