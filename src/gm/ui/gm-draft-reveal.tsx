"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ClubMark } from "@/gm/ui/club-mark";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { playerSheet } from "@/gm/engine/attributes";

import { playerMentality } from "@/gm/engine/mentality";
import type { GmPlayer } from "@/gm/types";
import { cn } from "@/lib/utils";

export type DraftRevealPayload = {
  pick: number;
  teamAbbr: string;
  teamId: string;
  userTeam: boolean;
  player: GmPlayer;
  /** Codename still on the card before identity stamped, if any. */
  codename?: string | null;
  mockRank: number;
  sleeper: boolean;
  fall: number;
};

type Stage = "pick" | "name" | "ovr" | "trait" | "done";

/**
 * Staged pick-night ceremony. Name, then OVR, then the Madden trait stamp.
 * Jackpots (X-Factor / Superstar) and your own picks get the longer beat.
 */
export function GmDraftReveal({
  reveal,
  onClose,
}: {
  reveal: DraftRevealPayload;
  onClose: () => void;
}) {

  const mentality = playerMentality(reveal.player);
  const ovr = playerSheet(reveal.player).overall;
  // A prospect with open-ended development has no revealed secret career
  // verdict on draft night. Celebrate the scout's pick, not hidden DNA.
  const jackpot = mentality.rank === 5;
  const bust = false;
  const longBeat = jackpot || reveal.userTeam;
  const [stage, setStage] = useState<Stage>("pick");

  useEffect(() => {
    setStage("pick");
    const delays = longBeat ? [700, 1600, 2600, 3800] : [500, 1100, 1800, 2600];
    const timers = [
      window.setTimeout(() => setStage("name"), delays[0]!),
      window.setTimeout(() => setStage("ovr"), delays[1]!),
      window.setTimeout(() => setStage("trait"), delays[2]!),
      window.setTimeout(() => setStage("done"), delays[3]!),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reveal.player.id, reveal.pick, longBeat]);

  const showName = stage !== "pick";
  const showOvr = stage === "ovr" || stage === "trait" || stage === "done";
  const showTrait = stage === "trait" || stage === "done";

  return (
    <div
      className="gm-draft-reveal"
      role="dialog"
      aria-modal="true"
      aria-label="Draft pick reveal"
    >
      <div
        className={cn(
          "gm-draft-reveal__card",
          jackpot && "is-jackpot",
          bust && "is-bust",
          reveal.userTeam && "is-yours"
        )}
      >
        <p className="gm-draft-reveal__eyebrow">
          {reveal.userTeam ? "Your pick" : "The pick is in"}
          {jackpot ? " · extraordinary work habits" : ""}
        </p>
        <p className="gm-draft-reveal__slot">
          #{reveal.pick} · <ClubMark teamId={reveal.teamId} label={reveal.teamAbbr} />
        </p>

        <div className="gm-draft-reveal__name-block">
          {reveal.codename && !showName ? (
            <p className="gm-draft-reveal__codename">{reveal.codename}</p>
          ) : null}
          {showName ? (
            <div className="flex items-center justify-center gap-3"><GmPlayerPortrait player={reveal.player} size="md" /><h2 className="gm-draft-reveal__name">{reveal.player.name}</h2></div>
          ) : (
            <h2 className="gm-draft-reveal__name is-pending">······</h2>
          )}
          {showName && reveal.codename && reveal.codename !== reveal.player.name ? (
            <p className="gm-draft-reveal__was">was {reveal.codename}</p>
          ) : null}
        </div>

        <div className="gm-draft-reveal__stats">
          <div className={cn("gm-draft-reveal__stat", showOvr && "is-on")}>
            <span>OVR</span>
            <strong className="tabular-nums">{showOvr ? ovr : "—"}</strong>
          </div>
          <div className={cn("gm-draft-reveal__stat", showTrait && "is-on", jackpot && "is-hot")}>
            <span>Mentality</span>
            <strong className={showTrait ? mentality.tone : undefined}>{showTrait ? mentality.label : "···"}</strong>
          </div>
        </div>

        {showTrait && reveal.sleeper ? (
          <p className="gm-draft-reveal__note">
            Sleeper · fell {reveal.fall} from mock #{reveal.mockRank}
          </p>
        ) : null}
        {showTrait ? <p className="gm-draft-reveal__note">Mentality can evolve with coaching, opportunity and long-term mentors. It is not a fixed career ceiling.</p> : null}

        {stage === "done" ? (
          <Button className="mt-4 w-full" onClick={onClose}>
            Continue
          </Button>
        ) : (
          <button
            type="button"
            className="mt-4 w-full text-center text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
            onClick={onClose}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
