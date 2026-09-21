import { PlayerRoleLine } from "@/components/players/player-role-line";
import type { PlayerSeason } from "@/data/types";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
import { assignPlayerRole } from "@/lib/player-role";

/**
 * Resolves scout-phrase role for the stats season (offseason fallback aware).
 * Shot-zone diet enrichment is skipped on the critical path so overview paints
 * without waiting on the shot index.
 */
export async function PlayerRoleIsland({
  career,
  requestSeason,
  position,
  playerId,
  nbaId,
  espnId,
  className,
}: {
  career: PlayerSeason[];
  requestSeason: string;
  position?: string | null;
  playerId: string;
  nbaId?: string | null;
  espnId?: string | null;
  className?: string;
}) {
  const { statsSeason } = resolvePlayerStatsSeason(career, requestSeason);
  const row =
    career.find(
      (r) => r.season === statsSeason && (r.gamesPlayed > 0 || r.usagePct != null)
    ) ?? career.find((r) => r.season === statsSeason);

  if (!row) return null;

  let rowForRole = row;

  // Career rows can lack USG/AST% until BRef overlay — pull from bundled board.
  if (row.usagePct == null || !Number.isFinite(row.usagePct)) {
    try {
      const { getBundledBrefPeerBoard } = await import(
        "@/data/runtime/bref-advanced-snapshot"
      );
      const board = getBundledBrefPeerBoard(statsSeason);
      const ids = new Set(
        [playerId, nbaId, espnId]
          .map((id) => String(id ?? "").trim())
          .filter(Boolean)
      );
      const hit =
        board.find((r) => ids.has(r.playerId)) ??
        board.find(
          (r) =>
            r.playerName.trim().toLowerCase() ===
            row.playerName.trim().toLowerCase()
        );
      if (hit) {
        rowForRole = {
          ...row,
          usagePct: hit.usagePct ?? row.usagePct,
          assistPct: hit.assistPct || row.assistPct,
          threePointAttemptRate:
            hit.threePointAttemptRate || row.threePointAttemptRate,
          turnoverPct: hit.turnoverPct || row.turnoverPct,
          reboundPct: hit.reboundPct || row.reboundPct,
          stealPct: hit.stealPct || row.stealPct,
          blockPct: hit.blockPct || row.blockPct,
          trueShootingPct: hit.trueShootingPct ?? row.trueShootingPct,
        };
      }
    } catch {
      /* keep career row */
    }
  }

  const role = assignPlayerRole({
    row: rowForRole,
    zones: null,
    position: position ?? rowForRole.position,
  });
  if (!role || role.id === "unclear") return null;

  return <PlayerRoleLine role={role} className={className} />;
}
