import type {
  GameBroadcastOption,
  GameStatusKind,
} from "@/lib/game-status";

export type { GameBroadcastOption, GameStatusKind };

export interface Game {
  id: string;
  season: string;
  /** ISO date string YYYY-MM-DD. */
  gameDate: string;
  /** Full tip-off timestamp when known (ISO). Absolute — not a local wall string. */
  tipOffAt?: string;
  /** ESPN short status line, e.g. "10/3 - 7:00 PM EDT". */
  statusDetail?: string;
  /**
   * Canonical DRBL team id (ESPN team id string) when the transform resolved
   * identity. Prefer this for links, filters, and branding.
   */
  homeTeamId: string;
  awayTeamId: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  /**
   * Provider namespace for retained raw team ids.
   * Present on rows that passed through provider transforms.
   */
  teamIdProvider?: "espn" | "bdl";
  /** Raw provider team id for the home side (traceability). */
  homeProviderTeamId?: string;
  /** Raw provider team id for the away side (traceability). */
  awayProviderTeamId?: string;
  homeScore: number;
  awayScore: number;
  /**
   * Per-period points when the source provides linescores (Q1…OT).
   * Lengths should match; absent when the source has no period breakdown.
   */
  homePeriodScores?: number[];
  awayPeriodScores?: number[];
  /** Regular season, playoffs, etc. */
  gameType: "regular" | "playoff" | "play-in" | "preseason";
  /**
   * Canonical provider-normalized status.
   * Never infer `final` from 0–0 alone.
   */
  status?: GameStatusKind;
  /** Current period when live (1–4, then OT as 5+). */
  period?: number;
  /** Provider display clock, e.g. "4:21" — do not locally decrement. */
  displayClock?: string;
  /** Legal broadcast options from provider structured fields. */
  broadcasts?: GameBroadcastOption[];
  /** When this game row was retrieved (ISO), if known. */
  retrievedAt?: string;
}

/** Convenience metrics derived for game exploration views. */
export interface GameSummary extends Game {
  totalPoints: number;
  margin: number;
  absMargin: number;
}
