export function findingHref(id: string): string {
  return `/findings/${encodeURIComponent(id)}`;
}

/** Shared view-transition name for the card chart and the detail chart. */
export function insightMorphName(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "");
  return safe ? `insight-${safe}` : "insight";
}
