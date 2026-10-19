"use client";

import { useEffect, useMemo, useState } from "react";

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
import {
  formatHeight,
  scoutPotentialView,
} from "@/gm/engine/scouting";
import {
  displayPlayerName,
  displayPlayerSubtitle,
  scoutedOverall,
  userTeam,
} from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmPlayer } from "@/gm/types";
import { cn } from "@/lib/utils";

export function GmDraftNight() {
  const league = useGmStore((s) => s.league);
  const draftPlayer = useGmStore((s) => s.draftPlayer);
  const simDraftPick = useGmStore((s) => s.simDraftPick);
  const simDraftToUser = useGmStore((s) => s.simDraftToUser);
  const acceptDraftNightTrade = useGmStore((s) => s.acceptDraftNightTrade);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

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

  useEffect(() => {
    if (!league || !auto || league.phase !== "draft") return;
    const onClock = pickOwnerAt(league);
    if (onClock === league.userTeamId || !league.draftPool.length) {
      setAuto(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const before = league.draftPickIndex ?? 0;
      simDraftPick();
      const after = useGmStore.getState().league;
      const row = after ? draftPickLog(after).find((entry) => entry.pick === before + 1) : null;
      if (row?.sleeper) {
        setFlash(
          `Sleeper: ${row.player.name} went #${row.pick} (mock #${row.mockRank}).`
        );
        setAuto(false);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [auto, league, simDraftPick]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 5200);
    return () => window.clearTimeout(timer);
  }, [flash]);

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
            Watch the board, catch sleepers, trade up, then take your swing.
            Names stay on the card. Molds and builds stay with them.
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
          <Button variant="outline" onClick={() => runOffseason()}>
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

      {flash ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[14px] font-medium">
          {flash}
        </div>
      ) : null}

      {last ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Last pick
          </p>
          <p className="mt-1 text-[15px] font-semibold">
            #{last.pick} {league.teams.find((club) => club.id === last.teamId)?.abbr} ·{" "}
            {displayPlayerName(last.player)}
            {last.sleeper ? (
              <span className="ml-2 text-[12px] font-semibold text-amber-600 dark:text-amber-300">
                Sleeper · fell {last.fall} from mock #{last.mockRank}
              </span>
            ) : (
              <span className="ml-2 text-[12px] text-muted-foreground">
                Mock #{last.mockRank}
              </span>
            )}
          </p>
        </div>
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
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Your board · remaining
          </div>
          <ul className="max-h-[min(58vh,560px)] divide-y divide-border overflow-y-auto">
            {board.map((player, index) => {
              const mold = displayPlayerSubtitle(player);
              const read = scoutPotentialView(player, team.staff.scout);
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
                        {player.position} · {player.age} · {read.low}-{read.high}
                        {mold ? ` · ${mold}` : ""}
                        {player.position === needs[0] ? " · hole" : ""}
                      </span>
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {scoutedOverall(player)}
                    </span>
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
                        Mock #{row.mockRank}
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {offer.direction === "up" ? `Trade up with ${partner}` : `${partner} wants your slot`}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{offer.blurb}</p>
      </div>
      <Button size="sm" onClick={onAccept}>
        Accept
      </Button>
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
  const potential = scoutPotentialView(player, scout);
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
            Scout mold {mold}. Build and grades stay on this card.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg bg-secondary/80 px-2.5 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Scouted potential
        </p>
        <p className="mt-1 text-[18px] font-bold tabular-nums">
          {potential.low}-{potential.high}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {potential.comment}
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
        <Mini label="OVR" value={scoutedOverall(player)} />
        <Mini
          label="Upside"
          value={profile?.grades.upside ?? "?"}
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/70 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="text-[14px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}
