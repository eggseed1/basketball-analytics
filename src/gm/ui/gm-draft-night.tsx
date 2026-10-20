"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  classMockBoard,
  draftNightOffers,
  draftPickLog,
  fallingProspects,
  orderedBoard,
  pickOwnerAt,
  rosterNeeds,
  type DraftNightOffer,
} from "@/gm/engine/draft-room";
import { playerSheet } from "@/gm/engine/attributes";
import { playerDevTrait, traitLabel } from "@/gm/engine/dev-traits";
import {
  formatHeight,
  gradeMeaning,
  trajectoryRead,
} from "@/gm/engine/scouting";
import {
  displayPlayerName,
  displayPlayerSubtitle,
  userTeam,
} from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import {
  GmDraftReveal,
  type DraftRevealPayload,
} from "@/gm/ui/gm-draft-reveal";
import type { GmPlayer, ScoutLetterGrade } from "@/gm/types";
import { cn } from "@/lib/utils";

function gradeTone(g: ScoutLetterGrade | null | undefined): string {
  if (!g) return "text-muted-foreground";
  if (g.startsWith("A")) return "text-delta-up";
  if (g.startsWith("B")) return "text-sky-300";
  if (g.startsWith("C")) return "text-amber-300";
  return "text-delta-down";
}

export function GmDraftNight() {
  const league = useGmStore((s) => s.league);
  const draftPlayer = useGmStore((s) => s.draftPlayer);
  const simDraftPick = useGmStore((s) => s.simDraftPick);
  const simDraftToUser = useGmStore((s) => s.simDraftToUser);
  const acceptDraftNightTrade = useGmStore((s) => s.acceptDraftNightTrade);
  const finishDraftBoard = useGmStore((s) => s.finishDraftBoard);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [reveal, setReveal] = useState<DraftRevealPayload | null>(null);
  const logLenRef = useRef(0);

  const board = useMemo(() => {
    if (!league) return [] as GmPlayer[];
    return orderedBoard(league, league.players);
  }, [league]);

  const log = useMemo(() => (league ? draftPickLog(league) : []), [league]);
  const falling = useMemo(() => (league ? fallingProspects(league) : []), [league]);
  const offers = useMemo(() => (league ? draftNightOffers(league) : []), [league]);
  const mock = useMemo(() => (league ? classMockBoard(league) : []), [league]);

  useEffect(() => {
    if (!board.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !board.some((player) => player.id === selectedId)) {
      setSelectedId(board[0]!.id);
    }
  }, [board, selectedId]);

  // Stage a ceremony whenever the pick log grows (your pick or the room's).
  useEffect(() => {
    if (!league) return;
    if (log.length < logLenRef.current) {
      logLenRef.current = log.length;
      return;
    }
    if (log.length === logLenRef.current) return;
    const prev = logLenRef.current;
    logLenRef.current = log.length;
    const added = log.slice(prev);
    if (!added.length) return;
    const yours = added.find((row) => row.teamId === league.userTeamId);
    const jackpotRow = added.find((row) => {
      const trait = playerDevTrait(row.player);
      return trait === "xfactor" || trait === "superstar";
    });
    const sleeper = added.find((row) => row.sleeper);
    // Bulk jumps (Jump to my pick) only stop for your pick or a jackpot.
    if (added.length > 2 && !yours && !jackpotRow) return;
    const focus = yours ?? jackpotRow ?? sleeper ?? added[added.length - 1]!;
    const trait = playerDevTrait(focus.player);
    const jackpot = trait === "xfactor" || trait === "superstar";
    const isYours = focus.teamId === league.userTeamId;
    // Ceremony for your pick, jackpots, and sleepers. Ordinary CPU picks stay on the ticker.
    if (!isYours && !jackpot && !focus.sleeper) return;
    if (auto) setAuto(false);
    setReveal({
      pick: focus.pick,
      teamAbbr:
        league.teams.find((club) => club.id === focus.teamId)?.abbr ??
        focus.teamId.toUpperCase(),
      teamId: focus.teamId,
      userTeam: isYours,
      player: focus.player,
      codename: focus.player.codename,
      mockRank: focus.mockRank,
      sleeper: focus.sleeper,
      fall: focus.fall,
    });
  }, [auto, league, log]);

  useEffect(() => {
    if (!league || !auto || league.phase !== "draft" || reveal) return;
    const onClock = pickOwnerAt(league);
    if (onClock === league.userTeamId || !league.draftPool.length) {
      setAuto(false);
      return;
    }
    const timer = window.setTimeout(() => {
      simDraftPick();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [auto, league, reveal, simDraftPick]);

  if (!league || league.phase !== "draft") return null;

  const team = userTeam(league);
  const needs = rosterNeeds(team, league.players);
  const pickNum = (league.draftPickIndex ?? 0) + 1;
  const onClock = pickOwnerAt(league);
  const yourTurn = onClock === league.userTeamId;
  const clockClub = league.teams.find((club) => club.id === onClock);
  const selected = board.find((player) => player.id === selectedId) ?? null;
  const last = log[log.length - 1] ?? null;

  return (
    <div className="gm-draft-night flex flex-col gap-4">
      {reveal ? (
        <GmDraftReveal reveal={reveal} onClose={() => setReveal(null)} />
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Draft night · {league.season - 1}-{String(league.season).slice(-2)}
          </p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight">
            Pick #{Math.min(pickNum, 60)}
            {clockClub ? ` · ${clockClub.city} ${clockClub.name}` : ""}
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Overall and the development trait stay sealed until the pick.
            Draft off fogged grades and ceiling/floor comps. Jackpots land with
            a full reveal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={yourTurn || !league.draftPool.length || auto}
            onClick={() => simDraftPick()}
          >
            Next pick
          </Button>
          <Button
            variant="outline"
            disabled={yourTurn || !league.draftPool.length}
            onClick={() => setAuto((value) => !value)}
          >
            {auto ? "Pause" : "Auto"}
          </Button>
          <Button
            variant="outline"
            disabled={yourTurn || !league.draftPool.length}
            onClick={() => {
              setAuto(false);
              simDraftToUser();
            }}
          >
            Jump to my pick
          </Button>
          <Button
            variant="outline"
            disabled={!league.draftPool.length}
            onClick={() => {
              setAuto(false);
              finishDraftBoard();
            }}
          >
            Finish draft
          </Button>
        </div>
      </header>

      {yourTurn ? (
        <div className="rounded-xl border border-foreground/20 bg-foreground px-4 py-3 text-background">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-background/70">
            On the clock
          </p>
          <p className="mt-1 text-[16px] font-semibold">
            {team.abbr} is up. Holes: {needs.slice(0, 2).join(", ") || "balanced"}.
          </p>
        </div>
      ) : null}

      {last && !reveal ? (
        <LastPickReveal last={last} abbr={league.teams.find((club) => club.id === last.teamId)?.abbr} />
      ) : null}

      {falling.length ? (
        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Still on the board
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {falling.map((row) => (
              <li
                key={row.player.id}
                className="rounded-full bg-card px-3 py-1 text-[12px] font-semibold"
              >
                {displayPlayerName(row.player)}
                <span className="ml-1 font-medium text-muted-foreground">
                  mock #{row.mockRank} · +{row.fall}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {offers.length ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Trade calls
          </p>
          {offers.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              partner={
                league.teams.find((club) => club.id === offer.partnerTeamId)?.abbr ??
                offer.partnerTeamId.toUpperCase()
              }
              onAccept={() => acceptDraftNightTrade(offer)}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(260px,320px)]">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Your board · remaining</span>
            <span className="normal-case tracking-normal text-[10px] font-normal">
              Ath · Shot · Create · Def
            </span>
          </div>
          <ul className="max-h-[min(58vh,560px)] divide-y divide-border overflow-y-auto">
            {board.map((player, index) => {
              const mold = displayPlayerSubtitle(player);
              const grades = player.scoutProfile?.grades;
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(player.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                      selectedId === player.id ? "bg-secondary" : "hover:bg-secondary/50"
                    )}
                  >
                    <span className="w-6 text-[12px] tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {displayPlayerName(player)}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {player.position} · {player.age}
                        {mold ? ` · ${mold}` : ""}
                        {player.position === needs[0] ? " · hole" : ""}
                      </span>
                    </span>
                    {(
                      [
                        grades?.athleticism,
                        grades?.shooting,
                        grades?.creation,
                        grades?.defense,
                      ] as const
                    ).map((g, gi) => (
                      <span
                        key={gi}
                        className={cn(
                          "w-7 text-center text-[12px] font-bold tabular-nums",
                          gradeTone(g)
                        )}
                        title={gradeMeaning(g)}
                      >
                        {g ?? "?"}
                      </span>
                    ))}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Off the board
          </div>
          <ul className="max-h-[min(58vh,560px)] divide-y divide-border overflow-y-auto">
            {log.length ? (
              log
                .slice()
                .reverse()
                .map((row) => (
                  <li
                    key={`${row.pick}-${row.player.id}`}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span className="w-8 text-[12px] font-semibold tabular-nums text-muted-foreground">
                      #{row.pick}
                    </span>
                    <span className="w-10 text-[12px] font-bold">
                      {league.teams.find((club) => club.id === row.teamId)?.abbr}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {displayPlayerName(row.player)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        OVR {playerSheet(row.player).overall} ·{" "}
                        {traitLabel(playerDevTrait(row.player))}
                        {row.sleeper ? ` · fell ${row.fall}` : ""}
                      </span>
                    </span>
                  </li>
                ))
            ) : (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                No picks yet. Hit Next pick or Auto.
              </li>
            )}
          </ul>
        </section>

        <ProspectCard
          player={selected}
          yourTurn={yourTurn}
          onDraft={(id) => {
            setAuto(false);
            draftPlayer(id);
          }}
          mockRank={
            selected
              ? mock.findIndex((player) => player.id === selected.id) + 1 || null
              : null
          }
        />
      </div>
    </div>
  );
}

function OfferRow({
  offer,
  partner,
  onAccept,
}: {
  offer: DraftNightOffer;
  partner: string;
  onAccept: () => void;
}) {
  const send = offer.youSend?.length
    ? offer.youSend
    : [`#${offer.yourSlot + 1}`];
  const get = offer.youGet?.length
    ? offer.youGet
    : [`#${offer.theirSlot + 1}`];
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-secondary/60 px-3 py-3 sm:flex-row sm:items-stretch sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {offer.direction === "up"
            ? `Trade up with ${partner}`
            : `${partner} wants your #${offer.yourSlot + 1}`}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{offer.blurb}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border/70 bg-background/60 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              You send
              {offer.youSendPoints != null ? (
                <span className="ml-1 font-medium normal-case tracking-normal text-muted-foreground/80">
                  · {Math.round(offer.youSendPoints)} pts
                </span>
              ) : null}
            </p>
            <ul className="mt-1 space-y-0.5 text-[13px] font-semibold leading-snug">
              {send.map((line) => (
                <li key={`send-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-border/70 bg-background/60 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              You get
              {offer.youGetPoints != null ? (
                <span className="ml-1 font-medium normal-case tracking-normal text-muted-foreground/80">
                  · {Math.round(offer.youGetPoints)} pts
                </span>
              ) : null}
            </p>
            <ul className="mt-1 space-y-0.5 text-[13px] font-semibold leading-snug">
              {get.map((line) => (
                <li key={`get-${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-stretch justify-end gap-2 sm:w-28">
        <Button size="sm" onClick={onAccept}>
          Accept
        </Button>
      </div>
    </div>
  );
}

function LastPickReveal({
  last,
  abbr,
}: {
  last: { pick: number; player: GmPlayer; mockRank: number; sleeper: boolean; fall: number };
  abbr?: string;
}) {
  const trait = playerDevTrait(last.player);
  const ovr = playerSheet(last.player).overall;
  const jackpot = trait === "xfactor" || trait === "superstar";
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        jackpot
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-border bg-card"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {jackpot ? `${traitLabel(trait)} unlocked` : "Last pick"}
      </p>
      <p className="mt-1 text-[15px] font-semibold">
        #{last.pick} {abbr} · {displayPlayerName(last.player)}
        <span className="ml-2 text-[12px] font-medium text-muted-foreground">
          OVR {ovr} · {traitLabel(trait)}
        </span>
        {last.sleeper ? (
          <span className="ml-2 text-[12px] font-semibold text-amber-600 dark:text-amber-300">
            Sleeper · fell {last.fall} from mock #{last.mockRank}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function ProspectCard({
  player,
  yourTurn,
  onDraft,
  mockRank,
}: {
  player: GmPlayer | null;
  yourTurn: boolean;
  onDraft: (id: string) => void;
  mockRank: number | null;
}) {
  const league = useGmStore((s) => s.league);
  if (!player || !league) {
    return (
      <aside className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Select a prospect.
      </aside>
    );
  }
  const scout = userTeam(league).staff.scout;
  const profile = player.scoutProfile;
  const grades = profile?.grades;
  const mold = displayPlayerSubtitle(player);

  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-[1.25rem] font-bold leading-tight tracking-tight">
          {displayPlayerName(player)}
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {player.position} · Age {player.age}
          {profile?.archetypeLabel ? ` · ${profile.archetypeLabel}` : ""}
          {mockRank ? ` · Mock #${mockRank}` : ""}
        </p>
        {mold ? (
          <p className="mt-2 rounded-lg bg-secondary/80 px-2.5 py-1.5 text-[12px] font-medium">
            Scout mold {mold}. Grades can miss.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg bg-secondary/80 px-2.5 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          NBA comps
        </p>
        <p className="mt-1 text-[14px] font-semibold leading-snug">
          Ceiling{" "}
          <span className="text-foreground">
            {profile?.compCeiling ?? profile?.comps?.[0] ?? "Foggy"}
          </span>
        </p>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug">
          Floor{" "}
          <span className="text-foreground">
            {profile?.compFloor ?? profile?.comps?.[1] ?? "Foggy"}
          </span>
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {trajectoryRead(player, scout)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <Mini label="Height" value={formatHeight(profile?.heightInEstimate)} />
        <Mini
          label="Weight"
          value={
            profile?.weightLbsEstimate != null
              ? `${profile.weightLbsEstimate} lb`
              : "—"
          }
        />
        <Mini
          label="Ath"
          value={grades?.athleticism ?? "?"}
          tone={gradeTone(grades?.athleticism)}
        />
        <Mini
          label="Shot"
          value={grades?.shooting ?? "?"}
          tone={gradeTone(grades?.shooting)}
        />
        <Mini
          label="Create"
          value={grades?.creation ?? "?"}
          tone={gradeTone(grades?.creation)}
        />
        <Mini
          label="Def"
          value={grades?.defense ?? "?"}
          tone={gradeTone(grades?.defense)}
        />
      </div>

      {profile?.summary ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {profile.summary}
        </p>
      ) : null}

      {yourTurn ? (
        <Button className="mt-auto w-full" onClick={() => onDraft(player.id)}>
          Draft {displayPlayerName(player)}
        </Button>
      ) : (
        <p className="mt-auto text-center text-[12px] text-muted-foreground">
          Waiting on the clock. Use Next pick or Auto.
        </p>
      )}
    </aside>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-secondary/70 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-[14px] font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
