/** Shared name key for joining DARKO / RAPTOR / ESPN rows. */
export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const NAME_SUFFIX =
  /^(jr\.?|sr\.?|ii|iii|iv|v|2nd|3rd|4th|5th)$/i;

/**
 * Narrow-viewport masthead form: first initial + family name.
 * "Giannis Antetokounmpo" → "G. Antetokounmpo"; "Michael Porter Jr." → "M. Porter Jr."
 * Single-token names are unchanged. Returns the original string when nothing shortens.
 */
export function formatPlayerMastheadShortName(name: string): string {
  const trimmed = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  const parts = trimmed.split(" ");
  if (parts.length < 2) return trimmed;

  const first = parts[0]!;
  const initialMatch = first.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
  if (!initialMatch) return trimmed;

  const rest = parts.slice(1);
  const last = rest[rest.length - 1]!;
  const family =
    rest.length >= 2 && NAME_SUFFIX.test(last)
      ? `${rest[rest.length - 2]} ${last}`
      : last;

  const short = `${initialMatch[0]!.toUpperCase()}. ${family}`;
  return short === trimmed ? trimmed : short;
}
