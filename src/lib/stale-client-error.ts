import { useEffect } from "react";

/**
 * Errors from a tab running older JS than the server: a deploy or dev edit
 * replaced a client module, so the loaded copy is missing an export or chunk.
 * Only a full reload fetches the new code; retry() and reset() reuse the old.
 */
const STALE_CLIENT_PATTERNS = [
  /Lazy element type must resolve/i,
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

const RELOAD_KEY = "drbl:stale-client-reload";
const RELOAD_GUARD_MS = 30_000;

export function isStaleClientError(error: Error | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.name ?? ""} ${error.message ?? ""}`;
  return STALE_CLIENT_PATTERNS.some((p) => p.test(text));
}

/** True when a stale-client reload for this URL already ran in the last 30s. */
function reloadedRecently(): boolean {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return false;
    const { href, at } = JSON.parse(raw) as { href?: string; at?: number };
    return href === window.location.href && typeof at === "number" && Date.now() - at < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

export function hardReload() {
  try {
    window.sessionStorage.setItem(
      RELOAD_KEY,
      JSON.stringify({ href: window.location.href, at: Date.now() })
    );
  } catch {
    /* private mode: reload anyway */
  }
  window.location.reload();
}

/** Reload once on a stale-client error; the boundary UI shows if it recurs. */
export function useStaleClientRecovery(error: Error) {
  const stale = isStaleClientError(error);
  useEffect(() => {
    if (stale && !reloadedRecently()) hardReload();
  }, [stale]);
  return stale;
}
