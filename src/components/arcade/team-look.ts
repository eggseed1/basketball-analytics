import { resolveHistoricalTeamBrand, type HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";

export type ArcadeTeamLook = {
  brand: HistoricalTeamBrand | null;
  primary: string;
  secondary: string;
  /** Readable text on `primary`. */
  ink: string;
};

const NEUTRAL = { primary: "#6b7280", secondary: "#d1d5db" };

function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.45 ? "#111111" : "#ffffff";
}

const cache = new Map<string, ArcadeTeamLook>();

/**
 * Colors and mark for an Arcade team code in a season. Era palettes win, then
 * the franchise's current colors, then gray. Never invents a hue.
 */
export function arcadeTeamLook(code: string, season: string): ArcadeTeamLook {
  const key = `${code}|${season}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const brand = resolveHistoricalTeamBrand(code, season);
  const current = resolveTeamBrand(code);
  const primary = brand?.palette?.primary ?? current?.primary ?? NEUTRAL.primary;
  const secondary = brand?.palette?.secondary ?? current?.secondary ?? NEUTRAL.secondary;
  const look = { brand, primary, secondary, ink: brand?.palette?.foreground ?? inkOn(primary) };
  cache.set(key, look);
  return look;
}
