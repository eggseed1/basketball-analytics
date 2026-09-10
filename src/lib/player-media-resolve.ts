/**
 * Client-safe player portrait resolution (no fs).
 * Approved URLs are passed from the server (`getPlayerPortraitUrl` /
 * bundled `portrait-lookup-store`). This module keeps an empty in-memory
 * registry so the large lookup JSON is not duplicated into every client
 * chunk; CDN typed fallthrough covers list surfaces without a server URL.
 */

export type MediaRoleContext = "PLAYER" | "COACH" | "STAFF" | "UNKNOWN";

export type MediaValidationResult =
  | "VALID_EXACT_ERA"
  | "VALID_PLAYER_FALLBACK"
  | "MISSING"
  | "ROLE_MISMATCH"
  | "IDENTITY_MISMATCH"
  | "SOURCE_BLOCKED";

/** NBA PERSON_IDs whose CDN `latest` headshot is coach/staff — not player portrait. */
export const BLOCKED_NBA_LATEST_PLAYER_IDS = new Set<string>([
  "959", // Steve Nash — coach-era latest
]);

export const FORCE_PLACEHOLDER_PLAYER_IDS = new Set<string>([]);

const PORTRAITS: Record<string, string> = {};

function approvedFromRegistry(
  ...ids: Array<string | null | undefined>
): string | null {
  for (const id of ids) {
    if (!id) continue;
    const key = String(id);
    const url = PORTRAITS[key] ?? PORTRAITS[`espn:${key}`];
    if (url) return url;
  }
  return null;
}

export function validatePlayerMedia(options: {
  canonicalPlayerId: string;
  selectedSeason?: string | null;
  media: {
    sourcePlayerId?: string | null;
    roleContext?: MediaRoleContext | null;
    sourceUrl?: string | null;
    productUseStatus?: string | null;
  };
}): MediaValidationResult {
  const { media } = options;
  void options.canonicalPlayerId;
  if (!media.sourceUrl) return "MISSING";
  if (media.productUseStatus === "QUARANTINED") {
    if (media.roleContext === "COACH") return "ROLE_MISMATCH";
    return "SOURCE_BLOCKED";
  }
  if (media.roleContext === "COACH" || media.roleContext === "STAFF") {
    return "ROLE_MISMATCH";
  }
  return "VALID_PLAYER_FALLBACK";
}

/**
 * Resolve ordered portrait URLs for a player surface.
 *
 * Priority:
 * approvedUrl → registry(nba|espn|playerId) → typed NBA CDN → typed ESPN CDN
 * Placeholder is terminal only when nothing verified exists.
 */
export function resolvePlayerPortraitCandidates(options: {
  playerId?: string | null;
  espnId?: string | null;
  nbaId?: string | null;
  role?: "PLAYER" | "COACH";
  approvedUrl?: string | null;
  registryOnly?: boolean;
}): string[] {
  const role = options.role ?? "PLAYER";
  const urls: string[] = [];
  const push = (url?: string | null) => {
    if (url && !urls.includes(url)) urls.push(url);
  };

  const registryHit = approvedFromRegistry(
    options.approvedUrl ? null : options.nbaId,
    options.approvedUrl ? null : options.espnId,
    options.approvedUrl ? null : options.playerId
  );

  if (options.registryOnly) {
    push(options.approvedUrl);
    if (!options.approvedUrl) push(registryHit);
    return urls;
  }

  if (options.approvedUrl) {
    push(options.approvedUrl);
    return urls;
  }

  // Verified registry (dual-key) before any raw CDN guess
  push(registryHit);

  const nbaId =
    options.nbaId && /^\d+$/.test(options.nbaId) ? options.nbaId : null;
  const espnId =
    options.espnId && /^\d+$/.test(options.espnId) ? options.espnId : null;

  if (
    (nbaId && FORCE_PLACEHOLDER_PLAYER_IDS.has(nbaId)) ||
    (options.playerId && FORCE_PLACEHOLDER_PLAYER_IDS.has(options.playerId))
  ) {
    return urls;
  }

  if (role === "PLAYER" && nbaId && BLOCKED_NBA_LATEST_PLAYER_IDS.has(nbaId)) {
    // Skip NBA latest; ESPN typed or registry already handled
    if (espnId) {
      push(
        `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`
      );
    }
    return urls;
  }

  if (nbaId && !BLOCKED_NBA_LATEST_PLAYER_IDS.has(nbaId)) {
    // Only emit raw NBA CDN if not already covered by registry
    if (!registryHit?.includes(`/${nbaId}.png`)) {
      push(
        `https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`
      );
    }
  }
  if (espnId) {
    if (!registryHit?.includes(`/full/${espnId}.png`)) {
      push(
        `https://a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`
      );
    }
  }

  return urls;
}
