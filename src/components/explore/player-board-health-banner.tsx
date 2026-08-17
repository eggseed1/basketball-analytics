import type { PlayerBoardHealth } from "@/data/diagnostics/player-board-health";
import { cn } from "@/lib/utils";

/**
 * Inline board-health notice for player explore — uses health from the
 * same snapshot that loaded the table (no extra ESPN call).
 */
export function PlayerBoardHealthBanner({
  health,
}: {
  health: PlayerBoardHealth;
}) {
  if (health.status === "healthy") {
    // Keep live healthy quiet in production; light hint in development.
    if (process.env.NODE_ENV === "production") {
      return (
        <p className="text-[11px] text-muted-foreground">
          Live ESPN/NBA board browsing is separate from the precomputed DRBL
          overlay.
        </p>
      );
    }
    return (
      <p className="text-[12px] text-muted-foreground">
        {health.providerDescription} · {health.season} · {health.rowCount}{" "}
        player-season rows · live board ≠ precomputed DRBL overlay
      </p>
    );
  }

  if (health.status === "cached_board") {
    return (
      <p
        className="border-l-2 border-border pl-2 text-[12px] text-muted-foreground"
        role="status"
      >
        {health.message}
      </p>
    );
  }

  const tone =
    health.status === "sample_dataset"
      ? "border-border bg-secondary/50"
      : health.status === "provider_failure" ||
          health.status === "sample_sized_unexpected"
        ? "border-amber-700/35 bg-amber-950/10"
        : "border-border bg-secondary/40";

  return (
    <section
      className={cn("rounded-md border px-3 py-2.5 text-[13px]", tone)}
      role="status"
    >
      <p className="font-bold tracking-tight">{health.label}</p>
      <p className="mt-1 text-muted-foreground">{health.message}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Live ESPN/NBA board browsing is separate from the precomputed DRBL
        overlay.
      </p>
      {health.historicalGamesCachePresent === true &&
      (health.status === "season_unsupported" ||
        health.status === "board_unavailable") ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Note: historical game cache exists for this season, but that is not a
          PlayerSeason board.
        </p>
      ) : null}
    </section>
  );
}
