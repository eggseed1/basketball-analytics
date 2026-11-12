import type { GmPlayer } from "@/gm/types";
import { playerMentality } from "@/gm/engine/mentality";
import { cn } from "@/lib/utils";

/** Visible work-mentality tag, deliberately separate from fixed OVR potential. */
export function GmMentalityTag({ player, compact = false }: { player: GmPlayer; compact?: boolean }) {
  const mentality = playerMentality(player);
  return <span data-testid="gm-mentality-tag" data-mentality={mentality.label}
    title={mentality.description} className={cn(
      "inline-flex w-fit shrink-0 items-center rounded-full border border-current/20 bg-secondary/40 font-semibold",
      compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs", mentality.tone,
    )}>{mentality.label}</span>;
}
