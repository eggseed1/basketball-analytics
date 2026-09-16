/**
 * Join a board row to a season hustle line.
 *
 * Hustle files are keyed by NBA player id. Explore rows are ESPN ids (or
 * bref fallback ids). UNIQUE_NAME_ONLY aliases are not safe for silent DRBL
 * joins, but they are the right key when that NBA id is already in the
 * hustle snapshot — otherwise stars like Anthony Davis render as "-".
 */
import type { PlayerIdAliasIndex } from "@/data/providers/impact/player-id-aliases";
import { normalizeEspnLookupName } from "@/data/runtime/espn-name-index";

/** Short given names that uniquely expand to one legal name. */
const GIVEN_NAME_ALIASES: Record<string, string> = {
  ron: "ronald",
  bob: "robert",
  bobby: "robert",
  bill: "william",
  will: "william",
  mike: "michael",
  nick: "nicholas",
  alex: "alexander",
  chris: "christopher",
  matt: "matthew",
  dan: "daniel",
  dave: "david",
  rob: "robert",
  pat: "patrick",
  joe: "joseph",
  jim: "james",
  tony: "anthony",
};

function nonemptyPatch<T extends object>(patch: T | undefined): T | undefined {
  if (!patch || !Object.keys(patch).length) return undefined;
  return patch;
}

function hustleNameKey(name: string): string {
  return normalizeEspnLookupName(name.replace(/-/g, " "));
}

function nameTokens(name: string): string[] {
  return hustleNameKey(name)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function canonicalGivenName(token: string): string {
  return GIVEN_NAME_ALIASES[token] ?? token;
}

function givenNamesCompatible(board: string, alias: string): boolean {
  if (board === alias) return true;
  const boardCanon = canonicalGivenName(board);
  const aliasCanon = canonicalGivenName(alias);
  if (boardCanon === alias || aliasCanon === board || boardCanon === aliasCanon) {
    return true;
  }
  const shorter = board.length <= alias.length ? board : alias;
  const longer = board.length <= alias.length ? alias : board;
  return shorter.length >= 4 && longer.startsWith(shorter);
}

function lastNameIndex(
  aliases: PlayerIdAliasIndex,
  hustleIds: Set<string>
): Map<string, string[]> {
  const byLast = new Map<string, string[]>();
  for (const alias of aliases.byNba.values()) {
    if (!alias.playerName || !hustleIds.has(alias.nbaPlayerId)) continue;
    const tokens = nameTokens(alias.playerName);
    const last = tokens[tokens.length - 1];
    if (!last) continue;
    const list = byLast.get(last) ?? [];
    if (!list.includes(alias.nbaPlayerId)) list.push(alias.nbaPlayerId);
    byLast.set(last, list);
  }
  return byLast;
}

function nbaIdFromEspn(
  espnId: string | null | undefined,
  aliases: PlayerIdAliasIndex
): string | null {
  if (!espnId) return null;
  const alias = aliases.byEspn.get(espnId);
  return alias?.nbaPlayerId ?? null;
}

/**
 * NBA id to read from the hustle map, or null when this row has no safe join.
 * A known ESPN alias that is absent from the hustle file is a miss — we do
 * not guess a different player by name.
 */
export function resolveHustleNbaId(
  row: { playerId: string; playerName?: string | null },
  hustleIds: Set<string>,
  aliases: PlayerIdAliasIndex,
  lookupEspnId: (name: string) => string | null = () => null
): string | null {
  const playerId = String(row.playerId ?? "").trim();
  if (playerId && hustleIds.has(playerId)) return playerId;

  if (playerId && aliases.byEspn.has(playerId)) {
    const nbaId = nbaIdFromEspn(playerId, aliases);
    return nbaId && hustleIds.has(nbaId) ? nbaId : null;
  }

  const name = row.playerName?.trim();
  if (!name) return null;

  const spaced = name.replace(/-/g, " ");
  for (const candidate of [name, spaced]) {
    const espnId = lookupEspnId(candidate);
    if (!espnId || !aliases.byEspn.has(espnId)) continue;
    const nbaId = nbaIdFromEspn(espnId, aliases);
    return nbaId && hustleIds.has(nbaId) ? nbaId : null;
  }

  const tokens = nameTokens(name);
  const last = tokens[tokens.length - 1];
  const given = tokens.slice(0, -1);
  if (!last || !given.length) return null;
  const candidates = (lastNameIndex(aliases, hustleIds).get(last) ?? []).filter(
    (nbaId) => {
      const aliasName = aliases.byNba.get(nbaId)?.playerName;
      if (!aliasName) return false;
      const aliasGiven = nameTokens(aliasName)[0];
      if (!aliasGiven) return false;
      return given.some((token) => givenNamesCompatible(token, aliasGiven));
    }
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

export function resolveHustlePatch<T extends object>(
  row: { playerId: string; playerName?: string | null },
  hustleById: Map<string, T>,
  aliases: PlayerIdAliasIndex,
  lookupEspnId: (name: string) => string | null = () => null
): T | undefined {
  const nbaId = resolveHustleNbaId(
    row,
    new Set(hustleById.keys()),
    aliases,
    lookupEspnId
  );
  if (!nbaId) return undefined;
  return nonemptyPatch(hustleById.get(nbaId));
}
