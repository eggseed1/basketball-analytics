import { SectionFrame } from "@/components/layout/section-frame";
import { PlayerStyleStory } from "@/components/players/player-style-story";
import type { PlayerSeason } from "@/data/types";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
import { assignPlayerRole } from "@/lib/player-role";
import { buildStyleStoryModel } from "@/lib/player-style-story";
import { getTranslations } from "next-intl/server";

/**
 * Full-width Style story for Overview.
 * Shot-zone diet enrichment stays off the critical path (3PAr / FTR fallback).
 */
export async function PlayerRoleIsland({
  career,
  requestSeason,
  position,
  playerId,
  nbaId,
  espnId,
  accent,
}: {
  career: PlayerSeason[];
  requestSeason: string;
  position?: string | null;
  playerId: string;
  nbaId?: string | null;
  espnId?: string | null;
  /** Optional team accent for the creation-map focus dot. */
  accent?: string;
  className?: string;
}) {
  const t = await getTranslations("PlayerDetail");
  const { statsSeason } = resolvePlayerStatsSeason(career, requestSeason);
  const row =
    career.find(
      (r) => r.season === statsSeason && (r.gamesPlayed > 0 || r.usagePct != null)
    ) ?? career.find((r) => r.season === statsSeason);

  if (!row) return null;

  let rowForRole = row;
  let peerBoard: PlayerSeason[] = [];

  try {
    const { getBundledBrefPeerBoard } = await import(
      "@/data/runtime/bref-advanced-snapshot"
    );
    peerBoard = getBundledBrefPeerBoard(statsSeason);
    if (row.usagePct == null || !Number.isFinite(row.usagePct)) {
      const ids = new Set(
        [playerId, nbaId, espnId]
          .map((id) => String(id ?? "").trim())
          .filter(Boolean)
      );
      const hit =
        peerBoard.find((r) => ids.has(r.playerId)) ??
        peerBoard.find(
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
          freeThrowRate: hit.freeThrowRate ?? row.freeThrowRate,
        };
      }
    }
  } catch {
    /* keep career row */
  }

  const role = assignPlayerRole({
    row: rowForRole,
    zones: null,
    position: position ?? rowForRole.position,
  });
  if (!role || role.id === "unclear") return null;

  const model = buildStyleStoryModel({
    role,
    row: rowForRole,
    peerBoard,
    playerId,
  });

  return (
    <SectionFrame
      id="style"
      density="overview"
      title={t("styleTitle")}
      description={t("styleHint", { season: role.season })}
    >
      <PlayerStyleStory model={model} accent={accent} />
    </SectionFrame>
  );
}
