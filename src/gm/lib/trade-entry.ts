import type { GmLeagueState, GmPlayer } from "@/gm/types";

/** Safe, shareable player-profile entry into the existing two-sided Trade Desk. */
export type GmTradeEntry = { mode: "shop" | "target"; player: GmPlayer; partnerId: string | null };

export function tradeEntryHref(player: GmPlayer, league: GmLeagueState): string | null {
  if (!player.teamId || !player.contract || league.draftPool.includes(player.id) ||
      player.teamId.startsWith("as-")) return null;
  const mode = player.teamId === league.userTeamId ? "shop" : "target";
  return `/gm/trade?${mode}=${encodeURIComponent(player.id)}`;
}

/** IDs and ownership are revalidated against the current save, never trusted from a URL. */
export function resolveTradeEntry(league: GmLeagueState, query: URLSearchParams): GmTradeEntry | null {
  const shop = query.get("shop"), target = query.get("target");
  if (Boolean(shop) === Boolean(target)) return null;
  const mode = shop ? "shop" : "target";
  const id = shop ?? target;
  if (!id || id.length > 200) return null;
  const player = league.players.find(p => p.id === id);
  if (!player || !player.contract || !player.teamId ||
      player.teamId.startsWith("as-") || league.draftPool.includes(player.id)) return null;
  const own = player.teamId === league.userTeamId;
  if (own !== (mode === "shop")) return null;
  if (!league.teams.some(t => t.id === player.teamId)) return null;
  return { mode, player, partnerId: own ? null : player.teamId };
}
