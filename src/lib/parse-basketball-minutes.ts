/**
 * Parse basketball minutes from box-score strings.
 * Supports:
 *   - MM:SS / M:SS
 *   - ISO-8601 duration PT#H#M#S (NBA Stats API style, 2019-20+)
 *   - raw numeric minutes
 */

export function parseBasketballMinutes(
  value: string | number | null | undefined
): number {
  if (value == null) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  const s = String(value).trim();
  if (!s) return 0;

  const iso =
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(s);
  if (iso) {
    const hours = Number(iso[1] || 0);
    const minutes = Number(iso[2] || 0);
    const seconds = Number(iso[3] || 0);
    const total = hours * 60 + minutes + seconds / 60;
    return Number.isFinite(total) ? total : 0;
  }

  const clock = /^(\d+):(\d{1,2})(?:\.\d+)?$/.exec(s);
  if (clock) {
    return Number(clock[1]) + Number(clock[2]) / 60;
  }

  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
