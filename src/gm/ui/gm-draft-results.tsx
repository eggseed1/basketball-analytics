"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  draftPickLog,
  isDraftComplete,
  userDraftPicks,
  type DraftPickRow,
} from "@/gm/engine/draft-room";
import { playerSheet } from "@/gm/engine/attributes";
import { playerDevTrait, traitLabel } from "@/gm/engine/dev-traits";
import { displayPlayerName } from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmLeagueState } from "@/gm/types";
import { cn } from "@/lib/utils";

function teamAbbr(league: GmLeagueState, teamId: string): string {
  return league.teams.find((club) => club.id === teamId)?.abbr ?? teamId.toUpperCase();
}

function PickMeta({ row }: { row: DraftPickRow }) {
  const ovr = playerSheet(row.player).overall;
  const trait = playerDevTrait(row.player);
  return (
    <span className="text-[12px] text-muted-foreground">
      OVR {ovr} · {traitLabel(trait)}
      {row.sleeper ? ` · fell ${row.fall} (mock #${row.mockRank})` : ""}
    </span>
  );
}

/**
 * Post-draft recap: your class up top, then every pick in order.
 */
export function GmDraftResults({ league }: { league: GmLeagueState }) {
  const router = useRouter();
  const advanceJourney = useGmStore((s) => s.advanceSeasonJourney);
  const yours = userDraftPicks(league);
  const board = draftPickLog(league);
  const stillOnDraft = isDraftComplete(league);
  const seasonLabel = `${league.season - 1}-${String(league.season).slice(-2)}`;

  return (
    <div className="gm-draft-results flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Draft complete · {seasonLabel}
          </p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight">
            {yours.length
              ? `You took ${yours.length} pick${yours.length === 1 ? "" : "s"}`
              : "The board is set"}
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Overall and development traits are unlocked. Scroll the full order
            below, then review rookie contracts at the season hub.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stillOnDraft ? (
            <Button onClick={() => { advanceJourney(); router.push("/gm/offseason"); }}>Review rookie contracts</Button>
          ) : (
            <Button variant="outline" onClick={() => router.push("/gm/free-agency")}>
              Free agency
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/gm/roster")}>
            Roster
          </Button>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Your picks
        </div>
        {yours.length ? (
          <ul className="divide-y divide-border">
            {yours.map((row) => (
              <li key={row.player.id}>
                <Link
                  href={`/gm/player/${row.player.id}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/60"
                >
                  <span className="w-10 shrink-0 text-[13px] font-semibold tabular-nums text-muted-foreground">
                    #{row.pick}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-tight">
                      {displayPlayerName(row.player)}
                    </span>
                    <span className="mt-0.5 block">
                      <span className="text-[12px] text-muted-foreground">
                        {row.player.position} · {row.player.age}
                      </span>
                      <span className="mx-1.5 text-muted-foreground/50">·</span>
                      <PickMeta row={row} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            You did not make a selection in this draft.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span>Full draft order</span>
          <span className="normal-case tracking-normal text-[10px] font-normal">
            {board.length} picks
          </span>
        </div>
        <ul className="max-h-[min(70vh,720px)] divide-y divide-border overflow-y-auto">
          {board.map((row) => {
            const yoursPick = row.teamId === league.userTeamId;
            return (
              <li key={`${row.pick}-${row.player.id}`}>
                <Link
                  href={`/gm/player/${row.player.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/60",
                    yoursPick && "bg-secondary/40"
                  )}
                >
                  <span className="w-8 shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
                    #{row.pick}
                  </span>
                  <span
                    className={cn(
                      "w-10 shrink-0 text-[12px] font-bold",
                      yoursPick && "text-foreground"
                    )}
                  >
                    {teamAbbr(league, row.teamId)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {displayPlayerName(row.player)}
                      {yoursPick ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          You
                        </span>
                      ) : null}
                    </span>
                    <span className="block">
                      <PickMeta row={row} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {!board.length ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              No picks recorded for this class.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
