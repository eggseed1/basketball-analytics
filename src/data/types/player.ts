/**
 * Canonical player identity. UI and queries depend only on this shape —
 * never on raw NBA API / CSV column names.
 */
export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export interface Player {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  /** Primary position; may be undefined for incomplete source rows. */
  position?: Position;
  /** Birth date as ISO date string (YYYY-MM-DD), when known. */
  birthDate?: string;
  heightInches?: number;
  weightLbs?: number;
  /** Current or most recent team id in our canonical team space. */
  currentTeamId?: string;
}
