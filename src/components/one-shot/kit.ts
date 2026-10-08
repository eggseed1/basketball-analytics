import { TEAM_BRANDS } from "@/lib/nba-brand";
import { hashString } from "@/one-shot/rng";
import { NBA_TEAMS } from "@/one-shot/routes";
import type { NodeKind } from "@/one-shot/types";

/**
 * Uniform colors and jersey numbers. NBA teams use their real colors; every
 * other club is fictional, so its colors come from a fixed palette picked by
 * name. Pure functions of seed and team name, never the game's random streams.
 */

export interface Kit {
  primary: string;
  secondary: string;
  /** Readable ink on `primary` (numbers, trim). */
  ink: string;
  number: number | null;
  /** Organized team uniform rather than everyday clothes. */
  uniform: boolean;
}

const NBA_KEYS = ["atl", "bos", "bkn", "cha", "chi", "cle", "dal", "den", "det", "gsw", "hou", "ind", "lac", "lal", "mem", "mia", "mil", "min", "nop", "nyk", "okc", "orl", "phi", "phx", "por", "sac", "sas", "tor", "uta", "was"];

const CLUB_PALETTE: [string, string][] = [
  ["#C8102E", "#F4F4F4"],
  ["#0B3D91", "#F2C14E"],
  ["#00704A", "#F4F4F4"],
  ["#1D1D1F", "#E5E5EA"],
  ["#5B2C83", "#F2C14E"],
  ["#E35205", "#1D1D1F"],
  ["#00838F", "#F4F4F4"],
  ["#7A1F2B", "#E8C07A"],
  ["#2E7D32", "#FDD835"],
  ["#1565C0", "#F4F4F4"],
  ["#F2C230", "#1D1D1F"],
  ["#9E1B32", "#1D1D1F"],
  ["#37474F", "#FF7043"],
  ["#004D40", "#A7E3D6"],
  ["#F4F4F4", "#0B3D91"],
  ["#F4F4F4", "#C8102E"],
  ["#6D4C41", "#F2C14E"],
  ["#0277BD", "#FFD54F"],
];

const CASUAL = ["#7E8A97", "#C0504D", "#4F81BD", "#9BBB59", "#E8B04A", "#8064A2", "#4BACC6"];

const NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 41, 44, 55];

export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.6 ? "#1D1D1F" : "#F7F7F7";
}

/** The NBA team a team name belongs to, including its G League affiliate. */
export function nbaKeyOf(teamName: string | null): string | null {
  if (!teamName) return null;
  const i = NBA_TEAMS.findIndex((t) => teamName.includes(t));
  return i >= 0 ? NBA_KEYS[i]! : null;
}

/** His number on a team: a favorite he keeps when he can, something else when it is taken. */
export function jerseyNumber(seed: number, teamName: string): number {
  const fav = NUMBERS[hashString(`${seed}:favorite-number`) % NUMBERS.length]!;
  const h = hashString(`${seed}:number:${teamName}`);
  if (h % 5 !== 0) return fav;
  return NUMBERS[(h >>> 4) % NUMBERS.length]!;
}

export function kitFor(seed: number, node: NodeKind, teamName: string | null): Kit {
  const organized = !["home", "playground", "unattached"].includes(node) && Boolean(teamName);
  if (!organized) {
    const primary = CASUAL[hashString(`${seed}:tee`) % CASUAL.length]!;
    return { primary, secondary: "#2B2F36", ink: inkOn(primary), number: null, uniform: false };
  }
  const key = nbaKeyOf(teamName);
  const brand = key ? TEAM_BRANDS[key] : null;
  const [primary, secondary] = brand ? [brand.primary, brand.secondary] : CLUB_PALETTE[hashString(`club:${teamName}`) % CLUB_PALETTE.length]!;
  return { primary, secondary, ink: inkOn(primary), number: jerseyNumber(seed, teamName!), uniform: true };
}

/** An opponent's colors that differ from his own. */
function rgbDistance(a: string, b: string): number {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  return Math.hypot(((x >> 16) & 255) - ((y >> 16) & 255), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255));
}

export function opponentKit(seed: number, teamName: string | null, salt: string): Kit {
  const own = kitFor(seed, "local-club", teamName ?? "none").primary;
  for (let i = 0; i < 12; i++) {
    const k = kitFor(seed, "local-club", `opp:${salt}:${i}`);
    if (rgbDistance(k.primary, own) > 140) return { ...k, number: NUMBERS[hashString(`${salt}:${i}:n`) % NUMBERS.length]! };
  }
  return { primary: "#F4F4F4", secondary: "#1D1D1F", ink: "#1D1D1F", number: 1, uniform: true };
}
