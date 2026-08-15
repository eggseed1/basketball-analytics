/**
 * Ensures at most one PlayerIdentity preview is open app-wide.
 * Dense tables would otherwise stack multiple absolute-era previews.
 */

type Listener = (activeId: string | null) => void;

let activeId: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(activeId);
}

export function getActivePlayerIdentityPreviewId(): string | null {
  return activeId;
}

/** Claim exclusive open state for this PlayerIdentity instance. */
export function claimPlayerIdentityPreview(id: string): void {
  if (activeId === id) return;
  activeId = id;
  notify();
}

/** Release only if this instance currently owns the preview. */
export function releasePlayerIdentityPreview(id: string): void {
  if (activeId !== id) return;
  activeId = null;
  notify();
}

export function subscribePlayerIdentityPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — clear exclusive lock between cases. */
export function resetPlayerIdentityPreviewLock(): void {
  activeId = null;
  notify();
}
