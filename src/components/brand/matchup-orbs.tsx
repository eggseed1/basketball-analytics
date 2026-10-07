import type { CSSProperties } from "react";

/**
 * Two soft drifting team-color orbs behind a game card, the home strip look.
 * The card needs `isolate` (or any stacking context) so the orbs sit above its
 * fill and below its content. A decided game brightens the winner's orb.
 */
export function MatchupOrbs({
  away,
  home,
  winner = null,
}: {
  away: string;
  home: string;
  winner?: "away" | "home" | null;
}) {
  const strength = (side: "away" | "home") => (winner == null ? 0.8 : winner === side ? 1 : 0.45);
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      <span
        className="strip-orb"
        style={{ left: -60, top: 2, "--orb-color": away, "--orb-strength": strength("away") } as CSSProperties}
      />
      <span
        className="strip-orb strip-orb--b"
        style={{ right: -60, bottom: -16, "--orb-color": home, "--orb-strength": strength("home") } as CSSProperties}
      />
    </span>
  );
}

/** Near-opaque fill for orb cards. They skip the backdrop blur: it barely shows
    through this fill and costs a full repaint per frame inside scroll strips. */
export const STRIP_CARD_STYLE: CSSProperties = {
  background: "var(--strip-card-bg)",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

/** Winner side of a final with a margin, for MatchupOrbs. */
export function finalWinner(game: {
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
}): "away" | "home" | null {
  if (game.status !== "final" || game.homeScore == null || game.awayScore == null) return null;
  if (game.homeScore === game.awayScore) return null;
  return game.homeScore > game.awayScore ? "home" : "away";
}
