/**
 * Official NBA CDN media URLs (no API key).
 * Headshots use stats.nba.com player IDs (e.g. LeBron = 2544).
 */

/** Sample/local slug ids → NBA Stats person ids (for CDN headshots). */
const LOCAL_PLAYER_NBA_IDS: Record<string, string> = {
  tatum: "1628369",
  brown: "1627759",
  brunson: "1628973",
  towns: "1626157",
  gilgeous: "1628983",
  williams: "1631114",
  jokic: "203999",
  murray: "1627750",
  antetokounmpo: "203507",
  lillard: "203081",
  doncic: "1629029",
  irving: "202681",
  holiday: "201950",
  porter: "1629645",
  hart: "1628404",
};

export function resolveNbaPlayerId(playerId: string): string {
  return LOCAL_PLAYER_NBA_IDS[playerId] ?? playerId;
}

export function isNbaStatsPlayerId(playerId: string): boolean {
  return /^\d+$/.test(resolveNbaPlayerId(playerId).trim());
}

export function nbaPlayerHeadshotUrl(
  playerId: string,
  size: "small" | "large" = "small"
): string | null {
  const id = resolveNbaPlayerId(playerId);
  if (!/^\d+$/.test(id.trim())) return null;
  const dims = size === "large" ? "1040x760" : "260x190";
  return `https://cdn.nba.com/headshots/nba/latest/${dims}/${id}.png`;
}

export function nbaTeamLogoUrl(teamId: string): string | null {
  if (!/^\d+$/.test(teamId.trim())) return null;
  return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
}

/** Initials for avatar fallback when no CDN headshot is available. */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
