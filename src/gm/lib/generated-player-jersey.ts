import { brandKeyForUi } from "@/data/identity/team-map";
import { resolveTeamBrand } from "@/lib/nba-brand";

/**
 * Fictional players use a lightweight NBA-inspired uniform whose palette is
 * resolved from their CURRENT team, never from the saved portrait seed.
 *
 * "FA" is deliberately neutral. We use official franchise abbreviations
 * rather than inventing jersey numbers or claiming exact on-court uniforms.
 */
export type GeneratedJerseyStyle = {
  teamId: string | null;
  abbreviation: string;
  base: string;
  piping: string;
  lettering: string;
  highlight: string;
};

/** Prefer high-contrast lettering for light jerseys (Spurs) and dark ones. */
function contrastingInk(color: string): string {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match) return "#fff";
  const rgb = [0, 2, 4].map(i => parseInt(match[1]!.slice(i, i + 2), 16) / 255);
  const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  return lum > 0.32 ? "#17212c" : "#fff";
}

const JERSEY_DETAILS: Record<string, Partial<Pick<GeneratedJerseyStyle, "piping" | "lettering" | "highlight">>> = {
  bos: { piping: "#fff", lettering: "#fff", highlight: "#BA9653" },
  lal: { piping: "#FDB927", lettering: "#FDB927", highlight: "#fff" },
  nyk: { piping: "#F58426", lettering: "#fff", highlight: "#F58426" },
  gsw: { piping: "#FFC72C", lettering: "#FFC72C", highlight: "#fff" },
  mia: { piping: "#fff", lettering: "#fff", highlight: "#F9A01B" },
  bkn: { piping: "#fff", lettering: "#fff", highlight: "#fff" },
  chi: { piping: "#fff", lettering: "#fff", highlight: "#000" },
  sas: { piping: "#000", lettering: "#111", highlight: "#fff" },
};

export function generatedJerseyStyle(teamId?: string | null): GeneratedJerseyStyle {
  const brand = resolveTeamBrand(brandKeyForUi(teamId));
  if (!brand) {
    return {
      teamId: null, abbreviation: "FA", base: "#4b5563",
      piping: "#cbd5e1", lettering: "#fff", highlight: "#f1f5f9",
    };
  }
  const details = JERSEY_DETAILS[brand.id];
  return {
    teamId: brand.id,
    abbreviation: brand.abbr,
    base: brand.primary,
    piping: details?.piping ?? brand.secondary,
    lettering: details?.lettering ?? contrastingInk(brand.primary),
    highlight: details?.highlight ?? brand.secondary,
  };
}
