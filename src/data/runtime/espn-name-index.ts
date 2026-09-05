/**
 * Bundled ESPN athlete id lookup by normalized player name.
 * Used when BRef peer boards lack live ESPN roster ids (Cloudflare).
 */
import indexJson from "./espn-name-index.json";

type NameIndexFile = {
  version?: number;
  byName?: Record<string, string>;
};

const byName =
  (indexJson as NameIndexFile)?.byName &&
  typeof (indexJson as NameIndexFile).byName === "object"
    ? ((indexJson as NameIndexFile).byName as Record<string, string>)
    : {};

const byEspnId = new Map<string, string>();
for (const [name, id] of Object.entries(byName)) {
  if (!byEspnId.has(id)) byEspnId.set(id, name);
}

export function normalizeEspnLookupName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeys(name: string): string[] {
  const n = normalizeEspnLookupName(name);
  if (!n) return [];
  const stripped = n
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped && stripped !== n ? [n, stripped] : [n];
}

/** Resolve ESPN athlete id from a display name, if known. */
export function lookupEspnIdByPlayerName(
  playerName: string | null | undefined
): string | null {
  if (!playerName) return null;
  for (const key of nameKeys(playerName)) {
    const id = byName[key];
    if (id) return id;
  }
  return null;
}

/** Best-effort reverse lookup for bundled career matching. */
export function lookupPlayerNameByEspnId(
  espnId: string | null | undefined
): string | null {
  if (!espnId) return null;
  return byEspnId.get(String(espnId).trim()) ?? null;
}
