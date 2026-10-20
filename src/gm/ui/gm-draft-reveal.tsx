"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { playerSheet } from "@/gm/engine/attributes";
import { playerDevTrait, traitLabel } from "@/gm/engine/dev-traits";
import type { GmDevTrait, GmPlayer } from "@/gm/types";
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

function scoutVsTruth(player: GmPlayer, trait: GmDevTrait): string | null {
  const grades = player.scoutProfile?.grades;
  if (!grades) return null;
  const letters = [
    grades.athleticism,
    grades.shooting,
    grades.creation,
    grades.defense,
    grades.feel,
    grades.upside,
  ].filter(Boolean) as string[];
  if (!letters.length) return null;
  const aCount = letters.filter((g) => g.startsWith("A")).length;
  const dCount = letters.filter((g) => g.startsWith("D") || g.startsWith("F")).length;
  if (trait === "xfactor" || trait === "superstar") {
    if (aCount >= 2) return "The tape already had him this high.";
    if (dCount >= 2) return "The room graded him soft. The trait disagrees.";
    return "A quiet board. Loud trait.";
  }
  if (trait === "bust") {
    if (aCount >= 3) return "Pretty grades. Cold path.";
    return "The floor was always the worry.";
  }
  if (trait === "star" && aCount >= 3) return "The grades lined up.";
  if (trait === "normal" && aCount >= 3) return "Big dossier. Average path.";
  return null;
}

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
  const trait = playerDevTrait(reveal.player);
  const ovr = playerSheet(reveal.player).overall;
  const jackpot = trait === "xfactor" || trait === "superstar";
  const bust = trait === "bust";
  const longBeat = jackpot || reveal.userTeam;
  const [stage, setStage] = useState<Stage>("pick");
  const hit = scoutVsTruth(reveal.player, trait);

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
          {jackpot ? " · jackpot" : bust ? " · cold path" : ""}
        </p>
        <p className="gm-draft-reveal__slot">
          #{reveal.pick} · {reveal.teamAbbr}
        </p>

        <div className="gm-draft-reveal__name-block">
          {reveal.codename && !showName ? (
            <p className="gm-draft-reveal__codename">{reveal.codename}</p>
          ) : null}
          {showName ? (
            <h2 className="gm-draft-reveal__name">{reveal.player.name}</h2>
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
            <span>Dev trait</span>
            <strong>{showTrait ? traitLabel(trait) : "Sealed"}</strong>
          </div>
        </div>

        {showTrait && reveal.sleeper ? (
          <p className="gm-draft-reveal__note">
            Sleeper · fell {reveal.fall} from mock #{reveal.mockRank}
          </p>
        ) : null}
        {showTrait && hit ? <p className="gm-draft-reveal__note">{hit}</p> : null}

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
